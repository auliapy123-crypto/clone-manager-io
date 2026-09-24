import { and, asc, count, eq, ilike, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db, { type Database } from "../db/index.js";
import {
  bankAccounts,
  interAccountTransfers,
  journalEntries,
  journalEntryLines,
} from "../db/schema.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

export const INTER_ACCOUNT_TRANSFER_SOURCE_MODULE = "inter_account_transfer";

export interface InterAccountTransferCreateInput {
  date: string;
  reference?: string | null;
  description?: string | null;
  fromBankAccountId: string;
  toBankAccountId: string;
  amount: number;
}

export interface InterAccountTransferUpdateInput {
  date?: string;
  reference?: string | null;
  description?: string | null;
  fromBankAccountId?: string;
  toBankAccountId?: string;
  amount?: number;
}

export interface InterAccountTransferListOptions {
  page: number;
  pageSize: number;
  q?: string;
}

export interface InterAccountTransferRecord {
  id: string;
  businessId: string;
  date: string;
  reference: string | null;
  description: string | null;
  fromBankAccountId: string;
  fromBankAccountName: string;
  toBankAccountId: string;
  toBankAccountName: string;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Dua alias terpisah untuk dua JOIN ke bank_accounts (pelajaran #1:
// kolom di konteks JOIN harus ter-qualify lewat alias).
const fromBa = alias(bankAccounts, "from_ba");
const toBa = alias(bankAccounts, "to_ba");

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
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
  transferId: string;
  businessId: string;
  fromCoaAccountId: string;
  fromBankAccountName: string;
  toCoaAccountId: string;
  toBankAccountName: string;
  reference: string | null;
  date: string;
  description: string | null;
  amountCents: number;
}

/**
 * Jurnal transfer: DEBIT COA akun tujuan, KREDIT COA akun sumber —
 * dua-duanya sebesar amount yang sama. Assert D=K dalam sen sebelum insert.
 */
async function postTransferJournal(
  tx: DbOrTx,
  input: PostJournalInput,
): Promise<string> {
  if (input.amountCents <= 0) {
    throw new Error("Nominal transfer harus lebih dari 0.");
  }

  const refLabel = input.reference ?? input.transferId.slice(0, 8);
  const [entry] = await tx
    .insert(journalEntries)
    .values({
      businessId: input.businessId,
      entryDate: input.date,
      reference: input.reference,
      sourceModule: INTER_ACCOUNT_TRANSFER_SOURCE_MODULE,
      sourceId: input.transferId,
      description: input.description ?? `Transfer ${refLabel}`,
    })
    .returning({ id: journalEntries.id });

  const amountStr = fromCents(input.amountCents);
  const lines: (typeof journalEntryLines.$inferInsert)[] = [
    {
      journalEntryId: entry.id,
      accountId: input.toCoaAccountId,
      debit: amountStr,
      credit: "0.00",
      description: `Terima transfer ke ${input.toBankAccountName} (${refLabel})`,
    },
    {
      journalEntryId: entry.id,
      accountId: input.fromCoaAccountId,
      debit: "0.00",
      credit: amountStr,
      description: `Transfer keluar dari ${input.fromBankAccountName} (${refLabel})`,
    },
  ];

  const debitSum = lines.reduce((s, row) => s + toCents(Number(row.debit)), 0);
  const creditSum = lines.reduce((s, row) => s + toCents(Number(row.credit)), 0);
  if (debitSum !== creditSum) {
    throw new Error(
      `Jurnal transfer tidak balance: debit ${debitSum} sen ≠ kredit ${creditSum} sen.`,
    );
  }

  await tx.insert(journalEntryLines).values(lines);
  return entry.id;
}

async function findActiveJournalIds(
  tx: DbOrTx,
  transferId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.sourceModule, INTER_ACCOUNT_TRANSFER_SOURCE_MODULE),
        eq(journalEntries.sourceId, transferId),
        isNull(journalEntries.deletedAt),
      ),
    );
  return rows.map((r) => r.id);
}

async function softDeleteJournals(tx: DbOrTx, transferId: string): Promise<void> {
  const ids = await findActiveJournalIds(tx, transferId);
  for (const id of ids) {
    await tx
      .update(journalEntries)
      .set({ deletedAt: new Date() })
      .where(eq(journalEntries.id, id));
  }
}

function toRecord(header: {
  id: string;
  businessId: string;
  date: string;
  reference: string | null;
  description: string | null;
  fromBankAccountId: string;
  fromBankAccountName: string;
  toBankAccountId: string;
  toBankAccountName: string;
  amount: string | number;
  createdAt: Date;
  updatedAt: Date;
}): InterAccountTransferRecord {
  // numeric Postgres datang sebagai STRING — Number() eksplisit (pelajaran #2).
  const { amount, ...rest } = header;
  return { ...rest, amount: Number(amount) };
}

export async function listInterAccountTransfers(
  businessId: string,
  opts: InterAccountTransferListOptions,
): Promise<{ data: InterAccountTransferRecord[]; total: number }> {
  const conditions = [
    eq(interAccountTransfers.businessId, businessId),
    isNull(interAccountTransfers.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(interAccountTransfers.reference, pattern),
        ilike(interAccountTransfers.description, pattern),
        ilike(fromBa.name, pattern),
        ilike(toBa.name, pattern),
      )!,
    );
  }

  const where = and(...conditions);
  const baseQuery = db
    .select({
      id: interAccountTransfers.id,
      businessId: interAccountTransfers.businessId,
      date: interAccountTransfers.date,
      reference: interAccountTransfers.reference,
      description: interAccountTransfers.description,
      fromBankAccountId: interAccountTransfers.fromBankAccountId,
      fromBankAccountName: fromBa.name,
      toBankAccountId: interAccountTransfers.toBankAccountId,
      toBankAccountName: toBa.name,
      amount: interAccountTransfers.amount,
      createdAt: interAccountTransfers.createdAt,
      updatedAt: interAccountTransfers.updatedAt,
    })
    .from(interAccountTransfers)
    .innerJoin(fromBa, eq(interAccountTransfers.fromBankAccountId, fromBa.id))
    .innerJoin(toBa, eq(interAccountTransfers.toBankAccountId, toBa.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(interAccountTransfers.date), asc(interAccountTransfers.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(interAccountTransfers)
      .innerJoin(fromBa, eq(interAccountTransfers.fromBankAccountId, fromBa.id))
      .innerJoin(toBa, eq(interAccountTransfers.toBankAccountId, toBa.id))
      .where(where),
  ]);

  return {
    data: rows.map((r) => toRecord(r)),
    total: totalRow?.total ?? 0,
  };
}

export async function getInterAccountTransferById(
  businessId: string,
  transferId: string,
): Promise<InterAccountTransferRecord | null> {
  const [header] = await db
    .select({
      id: interAccountTransfers.id,
      businessId: interAccountTransfers.businessId,
      date: interAccountTransfers.date,
      reference: interAccountTransfers.reference,
      description: interAccountTransfers.description,
      fromBankAccountId: interAccountTransfers.fromBankAccountId,
      fromBankAccountName: fromBa.name,
      toBankAccountId: interAccountTransfers.toBankAccountId,
      toBankAccountName: toBa.name,
      amount: interAccountTransfers.amount,
      createdAt: interAccountTransfers.createdAt,
      updatedAt: interAccountTransfers.updatedAt,
    })
    .from(interAccountTransfers)
    .innerJoin(fromBa, eq(interAccountTransfers.fromBankAccountId, fromBa.id))
    .innerJoin(toBa, eq(interAccountTransfers.toBankAccountId, toBa.id))
    .where(
      and(
        eq(interAccountTransfers.businessId, businessId),
        eq(interAccountTransfers.id, transferId),
        isNull(interAccountTransfers.deletedAt),
      ),
    )
    .limit(1);

  return header ? toRecord(header) : null;
}

export async function createInterAccountTransfer(
  businessId: string,
  input: InterAccountTransferCreateInput,
): Promise<InterAccountTransferRecord> {
  if (input.fromBankAccountId === input.toBankAccountId) {
    throw new Error("Akun tujuan harus berbeda dari akun sumber.");
  }
  const amountCents = toCents(input.amount);
  if (amountCents <= 0) {
    throw new Error("Nominal transfer harus lebih dari 0.");
  }

  const transferId = await db.transaction(async (tx) => {
    const fromBank = await getBankCoaAccount(tx, businessId, input.fromBankAccountId);
    if (!fromBank) {
      throw new Error("Rekening sumber tidak ditemukan.");
    }
    const toBank = await getBankCoaAccount(tx, businessId, input.toBankAccountId);
    if (!toBank) {
      throw new Error("Rekening tujuan tidak ditemukan.");
    }

    const [header] = await tx
      .insert(interAccountTransfers)
      .values({
        businessId,
        date: input.date,
        reference: input.reference ?? null,
        description: input.description ?? null,
        fromBankAccountId: input.fromBankAccountId,
        toBankAccountId: input.toBankAccountId,
        amount: fromCents(amountCents),
      })
      .returning({ id: interAccountTransfers.id });

    await postTransferJournal(tx, {
      transferId: header.id,
      businessId,
      fromCoaAccountId: fromBank.accountId,
      fromBankAccountName: fromBank.name,
      toCoaAccountId: toBank.accountId,
      toBankAccountName: toBank.name,
      reference: input.reference ?? null,
      date: input.date,
      description: input.description ?? null,
      amountCents,
    });
    return header.id;
  });

  const detail = await getInterAccountTransferById(businessId, transferId);
  if (!detail) throw new Error("Gagal mengambil transfer setelah create.");
  return detail;
}

export async function updateInterAccountTransfer(
  businessId: string,
  transferId: string,
  input: InterAccountTransferUpdateInput,
): Promise<InterAccountTransferRecord | null> {
  const existing = await getInterAccountTransferById(businessId, transferId);
  if (!existing) return null;

  // Pelajaran #3: SEMUA field penentu isi jurnal jadi trigger repost.
  const fromChanged =
    input.fromBankAccountId !== undefined &&
    input.fromBankAccountId !== existing.fromBankAccountId;
  const toChanged =
    input.toBankAccountId !== undefined &&
    input.toBankAccountId !== existing.toBankAccountId;
  const amountChanged =
    input.amount !== undefined && toCents(input.amount) !== toCents(existing.amount);
  const needsJournalRepost = fromChanged || toChanged || amountChanged;

  const effectiveFromId = input.fromBankAccountId ?? existing.fromBankAccountId;
  const effectiveToId = input.toBankAccountId ?? existing.toBankAccountId;
  if (effectiveFromId === effectiveToId) {
    throw new Error("Akun tujuan harus berbeda dari akun sumber.");
  }
  const effectiveAmountCents = toCents(input.amount ?? existing.amount);
  if (effectiveAmountCents <= 0) {
    throw new Error("Nominal transfer harus lebih dari 0.");
  }

  await db.transaction(async (tx) => {
    if (needsJournalRepost) {
      const fromBank = await getBankCoaAccount(tx, businessId, effectiveFromId);
      if (!fromBank) {
        throw new Error("Rekening sumber tidak ditemukan.");
      }
      const toBank = await getBankCoaAccount(tx, businessId, effectiveToId);
      if (!toBank) {
        throw new Error("Rekening tujuan tidak ditemukan.");
      }

      await softDeleteJournals(tx, transferId);
      await postTransferJournal(tx, {
        transferId,
        businessId,
        fromCoaAccountId: fromBank.accountId,
        fromBankAccountName: fromBank.name,
        toCoaAccountId: toBank.accountId,
        toBankAccountName: toBank.name,
        reference:
          input.reference !== undefined ? input.reference : existing.reference,
        date: input.date ?? existing.date,
        description:
          input.description !== undefined
            ? input.description
            : existing.description,
        amountCents: effectiveAmountCents,
      });
    }

    const patch: Partial<typeof interAccountTransfers.$inferInsert> & {
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (input.date) patch.date = input.date;
    if (input.reference !== undefined) patch.reference = input.reference;
    if (input.description !== undefined) patch.description = input.description;
    if (input.fromBankAccountId) patch.fromBankAccountId = input.fromBankAccountId;
    if (input.toBankAccountId) patch.toBankAccountId = input.toBankAccountId;
    if (input.amount !== undefined) patch.amount = fromCents(effectiveAmountCents);

    await tx
      .update(interAccountTransfers)
      .set(patch)
      .where(
        and(
          eq(interAccountTransfers.businessId, businessId),
          eq(interAccountTransfers.id, transferId),
          isNull(interAccountTransfers.deletedAt),
        ),
      );
  });

  return getInterAccountTransferById(businessId, transferId);
}

export async function softDeleteInterAccountTransfer(
  businessId: string,
  transferId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [header] = await tx
      .select({ id: interAccountTransfers.id })
      .from(interAccountTransfers)
      .where(
        and(
          eq(interAccountTransfers.businessId, businessId),
          eq(interAccountTransfers.id, transferId),
          isNull(interAccountTransfers.deletedAt),
        ),
      )
      .limit(1);
    if (!header) return false;

    await softDeleteJournals(tx, transferId);
    await tx
      .update(interAccountTransfers)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(interAccountTransfers.id, transferId));
    return true;
  });
}
