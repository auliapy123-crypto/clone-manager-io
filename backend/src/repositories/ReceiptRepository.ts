import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db, { type Database } from "../db/index.js";
import {
  bankAccounts,
  chartOfAccounts,
  contacts,
  journalEntries,
  journalEntryLines,
  receiptLines,
  receipts,
} from "../db/schema.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

export const RECEIPT_SOURCE_MODULE = "receipt";

export interface ReceiptLineInput {
  accountId: string;
  description?: string | null;
  amount: number;
}

export interface ReceiptCreateInput {
  date: string;
  reference?: string | null;
  bankAccountId: string;
  contactId?: string | null;
  description?: string | null;
  lines: ReceiptLineInput[];
}

export interface ReceiptUpdateInput {
  date?: string;
  reference?: string | null;
  bankAccountId?: string;
  contactId?: string | null;
  description?: string | null;
  lines?: ReceiptLineInput[];
}

export interface ReceiptListOptions {
  page: number;
  pageSize: number;
  q?: string;
}

interface ComputedLine {
  accountId: string;
  description: string | null;
  amount: string;
  amountCents: number;
}

export interface ReceiptLineRecord {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  amount: number;
  sortOrder: number;
}

export interface ReceiptRecord {
  id: string;
  businessId: string;
  date: string;
  reference: string | null;
  bankAccountId: string;
  bankAccountName: string;
  contactId: string | null;
  contactName: string | null;
  description: string | null;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReceiptDetailRecord extends ReceiptRecord {
  lines: ReceiptLineRecord[];
}

const paidBy = alias(contacts, "paid_by");

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function computeLines(lines: ReceiptLineInput[]): {
  computed: ComputedLine[];
  totalCents: number;
} {
  const computed = lines.map((l) => {
    const amountCents = toCents(l.amount);
    return {
      accountId: l.accountId,
      description: l.description?.trim() ? l.description.trim() : null,
      amount: fromCents(amountCents),
      amountCents,
    };
  });
  const totalCents = computed.reduce((sum, l) => sum + l.amountCents, 0);
  return { computed, totalCents };
}

async function getBankCoaAccount(
  tx: DbOrTx,
  businessId: string,
  bankAccountId: string,
): Promise<{ accountId: string; name: string } | null> {
  const [row] = await tx
    .select({
      accountId: bankAccounts.accountId,
      name: bankAccounts.name,
    })
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.businessId, businessId),
        eq(bankAccounts.id, bankAccountId),
        isNull(bankAccounts.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

interface PostJournalInput {
  receiptId: string;
  businessId: string;
  bankCoaAccountId: string;
  bankAccountName: string;
  contactId: string | null;
  reference: string | null;
  date: string;
  description: string | null;
  lines: ComputedLine[];
  totalCents: number;
}

async function postReceiptJournal(
  tx: DbOrTx,
  input: PostJournalInput,
): Promise<string> {
  const creditCents = input.lines.reduce((sum, l) => sum + l.amountCents, 0);
  if (input.totalCents !== creditCents) {
    throw new Error(
      `Jurnal receipt tidak balance: debit ${input.totalCents} sen ≠ kredit ${creditCents} sen.`,
    );
  }

  const refLabel = input.reference ?? input.receiptId.slice(0, 8);
  const [entry] = await tx
    .insert(journalEntries)
    .values({
      businessId: input.businessId,
      entryDate: input.date,
      reference: input.reference,
      sourceModule: RECEIPT_SOURCE_MODULE,
      sourceId: input.receiptId,
      description: input.description ?? `Receipt ${refLabel}`,
    })
    .returning({ id: journalEntries.id });

  const lines: (typeof journalEntryLines.$inferInsert)[] = [
    {
      journalEntryId: entry.id,
      accountId: input.bankCoaAccountId,
      contactId: input.contactId,
      debit: fromCents(input.totalCents),
      credit: "0.00",
      description: `Penerimaan ke ${input.bankAccountName} (${refLabel})`,
    },
  ];

  for (const l of input.lines) {
    lines.push({
      journalEntryId: entry.id,
      accountId: l.accountId,
      contactId: input.contactId,
      debit: "0.00",
      credit: l.amount,
      description: l.description ?? `Penerimaan ${refLabel}`,
    });
  }

  const debitSum = lines.reduce((s, row) => s + toCents(Number(row.debit)), 0);
  const creditSum = lines.reduce((s, row) => s + toCents(Number(row.credit)), 0);
  if (debitSum !== creditSum) {
    throw new Error(
      `Jurnal receipt tidak balance: debit ${debitSum} sen ≠ kredit ${creditSum} sen.`,
    );
  }

  await tx.insert(journalEntryLines).values(lines);
  return entry.id;
}

async function findActiveJournalIds(
  tx: DbOrTx,
  receiptId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.sourceModule, RECEIPT_SOURCE_MODULE),
        eq(journalEntries.sourceId, receiptId),
        isNull(journalEntries.deletedAt),
      ),
    );
  return rows.map((r) => r.id);
}

async function softDeleteJournals(tx: DbOrTx, receiptId: string): Promise<void> {
  const ids = await findActiveJournalIds(tx, receiptId);
  for (const id of ids) {
    await tx
      .update(journalEntries)
      .set({ deletedAt: new Date() })
      .where(eq(journalEntries.id, id));
  }
}

function toLineRecord(row: {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  amount: string;
  sortOrder: number;
}): ReceiptLineRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    accountCode: row.accountCode,
    accountName: row.accountName,
    description: row.description,
    amount: Number(row.amount),
    sortOrder: row.sortOrder,
  };
}

function toRecord(header: {
  id: string;
  businessId: string;
  date: string;
  reference: string | null;
  bankAccountId: string;
  bankAccountName: string;
  contactId: string | null;
  contactName: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  totalAmount: string | number | null;
}): ReceiptRecord {
  const { totalAmount, ...rest } = header;
  return {
    ...rest,
    totalAmount: Number(totalAmount ?? 0),
  };
}

export async function listReceipts(
  businessId: string,
  opts: ReceiptListOptions,
): Promise<{ data: ReceiptRecord[]; total: number }> {
  const totals = db
    .select({
      receiptId: receiptLines.receiptId,
      totalAmount: sql<string>`COALESCE(SUM(${receiptLines.amount}), 0)`.as(
        "total_amount",
      ),
    })
    .from(receiptLines)
    .groupBy(receiptLines.receiptId)
    .as("t");

  const conditions = [
    eq(receipts.businessId, businessId),
    isNull(receipts.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(receipts.reference, pattern),
        ilike(receipts.description, pattern),
        ilike(paidBy.name, pattern),
      )!,
    );
  }

  const where = and(...conditions);
  const baseQuery = db
    .select({
      id: receipts.id,
      businessId: receipts.businessId,
      date: receipts.date,
      reference: receipts.reference,
      bankAccountId: receipts.bankAccountId,
      bankAccountName: bankAccounts.name,
      contactId: receipts.contactId,
      contactName: paidBy.name,
      description: receipts.description,
      totalAmount: totals.totalAmount,
      createdAt: receipts.createdAt,
      updatedAt: receipts.updatedAt,
    })
    .from(receipts)
    .innerJoin(bankAccounts, eq(receipts.bankAccountId, bankAccounts.id))
    .leftJoin(paidBy, eq(receipts.contactId, paidBy.id))
    .leftJoin(totals, eq(totals.receiptId, receipts.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(receipts.date), asc(receipts.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(receipts)
      .innerJoin(bankAccounts, eq(receipts.bankAccountId, bankAccounts.id))
      .leftJoin(paidBy, eq(receipts.contactId, paidBy.id))
      .leftJoin(totals, eq(totals.receiptId, receipts.id))
      .where(where),
  ]);

  return {
    data: rows.map((r) => toRecord(r)),
    total: totalRow?.total ?? 0,
  };
}

async function getLinesWithAccounts(
  tx: DbOrTx,
  receiptId: string,
): Promise<ReceiptLineRecord[]> {
  const rows = await tx
    .select({
      id: receiptLines.id,
      accountId: receiptLines.accountId,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      description: receiptLines.description,
      amount: receiptLines.amount,
      sortOrder: receiptLines.sortOrder,
    })
    .from(receiptLines)
    .innerJoin(chartOfAccounts, eq(receiptLines.accountId, chartOfAccounts.id))
    .where(eq(receiptLines.receiptId, receiptId))
    .orderBy(asc(receiptLines.sortOrder), asc(receiptLines.id));
  return rows.map(toLineRecord);
}

export async function getReceiptById(
  businessId: string,
  receiptId: string,
): Promise<ReceiptDetailRecord | null> {
  const [header] = await db
    .select({
      id: receipts.id,
      businessId: receipts.businessId,
      date: receipts.date,
      reference: receipts.reference,
      bankAccountId: receipts.bankAccountId,
      bankAccountName: bankAccounts.name,
      contactId: receipts.contactId,
      contactName: paidBy.name,
      description: receipts.description,
      createdAt: receipts.createdAt,
      updatedAt: receipts.updatedAt,
    })
    .from(receipts)
    .innerJoin(bankAccounts, eq(receipts.bankAccountId, bankAccounts.id))
    .leftJoin(paidBy, eq(receipts.contactId, paidBy.id))
    .where(
      and(
        eq(receipts.businessId, businessId),
        eq(receipts.id, receiptId),
        isNull(receipts.deletedAt),
      ),
    )
    .limit(1);

  if (!header) return null;
  const lines = await getLinesWithAccounts(db, receiptId);
  const totalCents = lines.reduce((sum, l) => sum + toCents(l.amount), 0);
  return {
    ...toRecord({ ...header, totalAmount: fromCents(totalCents) }),
    lines,
  };
}

export async function createReceipt(
  businessId: string,
  input: ReceiptCreateInput,
): Promise<ReceiptDetailRecord> {
  const { computed, totalCents } = computeLines(input.lines);
  const receiptId = await db.transaction(async (tx) => {
    const bank = await getBankCoaAccount(tx, businessId, input.bankAccountId);
    if (!bank) {
      throw new Error("Rekening bank/kas tidak ditemukan.");
    }

    const [header] = await tx
      .insert(receipts)
      .values({
        businessId,
        date: input.date,
        reference: input.reference,
        bankAccountId: input.bankAccountId,
        contactId: input.contactId ?? null,
        description: input.description,
      })
      .returning({ id: receipts.id });

    await tx.insert(receiptLines).values(
      computed.map((l, i) => ({
        receiptId: header.id,
        accountId: l.accountId,
        description: l.description,
        amount: l.amount,
        sortOrder: i,
      })),
    );

    await postReceiptJournal(tx, {
      receiptId: header.id,
      businessId,
      bankCoaAccountId: bank.accountId,
      bankAccountName: bank.name,
      contactId: input.contactId ?? null,
      reference: input.reference ?? null,
      date: input.date,
      description: input.description ?? null,
      lines: computed,
      totalCents,
    });
    return header.id;
  });

  const detail = await getReceiptById(businessId, receiptId);
  if (!detail) throw new Error("Gagal mengambil penerimaan setelah create.");
  return detail;
}

export async function updateReceipt(
  businessId: string,
  receiptId: string,
  input: ReceiptUpdateInput,
): Promise<ReceiptDetailRecord | null> {
  const existing = await getReceiptById(businessId, receiptId);
  if (!existing) return null;

  const bankAccountChanged =
    input.bankAccountId !== undefined &&
    input.bankAccountId !== existing.bankAccountId;
  const linesChanged = input.lines !== undefined;
  const contactIdChanged =
    input.contactId !== undefined && input.contactId !== existing.contactId;
  const needsJournalRepost = bankAccountChanged || linesChanged || contactIdChanged;

  await db.transaction(async (tx) => {
    let linesToUse = existing.lines;

    if (linesChanged) {
      const { computed } = computeLines(input.lines!);
      await tx.delete(receiptLines).where(eq(receiptLines.receiptId, receiptId));
      await tx.insert(receiptLines).values(
        computed.map((l, i) => ({
          receiptId,
          accountId: l.accountId,
          description: l.description,
          amount: l.amount,
          sortOrder: i,
        })),
      );
      linesToUse = computed.map((l, i) => ({
        id: "",
        accountId: l.accountId,
        accountCode: "",
        accountName: "",
        description: l.description,
        amount: Number(l.amount),
        sortOrder: i,
      }));
    }

    if (needsJournalRepost) {
      const bankAccountId = input.bankAccountId ?? existing.bankAccountId;
      const bank = await getBankCoaAccount(tx, businessId, bankAccountId);
      if (!bank) {
        throw new Error("Rekening bank/kas tidak ditemukan.");
      }

      await softDeleteJournals(tx, receiptId);
      const computedLinesForJournal: ComputedLine[] = linesToUse.map((l) => ({
        accountId: l.accountId,
        description: l.description,
        amount: fromCents(toCents(l.amount)),
        amountCents: toCents(l.amount),
      }));
      const totalCents = computedLinesForJournal.reduce(
        (s, l) => s + l.amountCents,
        0,
      );

      await postReceiptJournal(tx, {
        receiptId,
        businessId,
        bankCoaAccountId: bank.accountId,
        bankAccountName: bank.name,
        contactId:
          input.contactId !== undefined ? input.contactId : existing.contactId,
        reference:
          input.reference !== undefined ? input.reference : existing.reference,
        date: input.date ?? existing.date,
        description:
          input.description !== undefined
            ? input.description
            : existing.description,
        lines: computedLinesForJournal,
        totalCents,
      });
    }

    const patch: Partial<typeof receipts.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (input.date) patch.date = input.date;
    if (input.reference !== undefined) patch.reference = input.reference;
    if (input.bankAccountId) patch.bankAccountId = input.bankAccountId;
    if (input.contactId !== undefined) patch.contactId = input.contactId;
    if (input.description !== undefined) patch.description = input.description;

    await tx
      .update(receipts)
      .set(patch)
      .where(
        and(
          eq(receipts.businessId, businessId),
          eq(receipts.id, receiptId),
          isNull(receipts.deletedAt),
        ),
      );
  });

  return getReceiptById(businessId, receiptId);
}

export async function softDeleteReceipt(
  businessId: string,
  receiptId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [header] = await tx
      .select({ id: receipts.id })
      .from(receipts)
      .where(
        and(
          eq(receipts.businessId, businessId),
          eq(receipts.id, receiptId),
          isNull(receipts.deletedAt),
        ),
      )
      .limit(1);
    if (!header) return false;

    await softDeleteJournals(tx, receiptId);
    await tx
      .update(receipts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(receipts.id, receiptId));
    return true;
  });
}
