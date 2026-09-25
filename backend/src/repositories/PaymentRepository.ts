import { findExpenseClaimsControlAccount, getExpenseClaimAllocationInfo } from "./ExpenseClaimRepository.js";
import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import db, { type Database } from "../db/index.js";
import {
  bankAccounts,
  chartOfAccounts,
  contacts,
  journalEntries,
  journalEntryLines,
  paymentLines,
  payments,
} from "../db/schema.js";
import {
  findApControlAccount,
  getPurchaseInvoiceAllocationInfo,
} from "./PurchaseInvoiceRepository.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

export const PAYMENT_SOURCE_MODULE = "payment";

/**
 * Error validasi alokasi/aturan bisnis Payment. `statusCode` dibaca oleh
 * error handler global (`toHttpError`) supaya jadi 400, bukan 500 seperti
 * `Error` polos.
 */
export class PaymentValidationError extends Error {
  readonly statusCode = 400;
}

export interface PaymentLineInput {
  accountId: string;
  purchaseInvoiceId?: string | null;
  expenseClaimId?: string | null;
  description?: string | null;
  amount: number;
}

export interface PaymentCreateInput {
  date: string;
  reference?: string | null;
  bankAccountId: string;
  contactId: string;
  description?: string | null;
  lines: PaymentLineInput[];
}

export interface PaymentUpdateInput {
  date?: string;
  reference?: string | null;
  bankAccountId?: string;
  contactId?: string;
  description?: string | null;
  lines?: PaymentLineInput[];
}

export interface PaymentListOptions {
  page: number;
  pageSize: number;
  q?: string;
}

interface ComputedLine {
  accountId: string;
  purchaseInvoiceId: string | null;
  expenseClaimId: string | null;
  description: string | null;
  amount: string;
  amountCents: number;
}

export interface PaymentLineRecord {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  purchaseInvoiceId: string | null;
  expenseClaimId: string | null;
  description: string | null;
  amount: number;
  sortOrder: number;
}

export interface PaymentRecord {
  id: string;
  businessId: string;
  date: string;
  reference: string | null;
  bankAccountId: string;
  bankAccountName: string;
  contactId: string;
  contactName: string;
  description: string | null;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentDetailRecord extends PaymentRecord {
  lines: PaymentLineRecord[];
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Validasi seluruh baris (dipanggil di dalam transaction, sebelum insert):
 * - Baris dengan purchaseInvoiceId WAJIB pakai akun kontrol Accounts Payable.
 * - Invoice yang dialokasikan harus milik contactId header.
 * - Total alokasi ke satu invoice (termasuk baris lain di batch yang sama)
 *   tidak boleh melebihi balanceDue invoice itu saat ini.
 * `excludePaymentId` dipakai saat update, supaya alokasi LAMA payment ini
 * sendiri tidak ikut dihitung sebagai "sudah terpakai".
 */
async function validateAndComputeLines(
  tx: DbOrTx,
  businessId: string,
  contactId: string,
  lines: PaymentLineInput[],
  excludePaymentId?: string,
): Promise<{ computed: ComputedLine[]; totalCents: number }> {
  let apAccountId: string | null | undefined;
  const allocatedInBatchCents = new Map<string, number>();

  const computed: ComputedLine[] = [];
  for (const line of lines) {
    const amountCents = toCents(line.amount);
    const purchaseInvoiceId = line.purchaseInvoiceId ?? null;
    const expenseClaimId = line.expenseClaimId ?? null;
    if (expenseClaimId && purchaseInvoiceId) throw new PaymentValidationError("Satu baris hanya boleh alokasi ke Purchase Invoice ATAU Expense Claim.");
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new PaymentValidationError("Nominal baris tidak valid.");
    if (expenseClaimId) {
      const control = await findExpenseClaimsControlAccount(businessId, tx);
      if (line.accountId !== control.id) throw new PaymentValidationError("Alokasi Expense Claim wajib memakai akun kontrol Expense Claims.");
      const allocation = await getExpenseClaimAllocationInfo(businessId, expenseClaimId, { tx, excludePaymentId });
      if (!allocation) throw new PaymentValidationError("Expense Claim tidak ditemukan.");
      if (allocation.payerContactId !== contactId) throw new PaymentValidationError("Expense Claim bukan milik Payee ini.");
      const key = "claim:" + expenseClaimId;
      const allocated = (allocatedInBatchCents.get(key) ?? 0) + amountCents;
      if (allocated > toCents(allocation.balanceDue)) throw new PaymentValidationError("Nominal alokasi melebihi sisa tagihan Expense Claim.");
      allocatedInBatchCents.set(key, allocated);
    }

    if (purchaseInvoiceId) {
      if (apAccountId === undefined) {
        const apAccount = await findApControlAccount(businessId, tx);
        apAccountId = apAccount?.id ?? null;
      }
      if (!apAccountId) {
        throw new PaymentValidationError(
          "Akun kontrol Utang Usaha (Liability + kontrol) tidak ditemukan di bisnis ini, tidak bisa alokasikan ke Purchase Invoice.",
        );
      }
      if (line.accountId !== apAccountId) {
        throw new PaymentValidationError(
          "Baris yang dialokasikan ke Purchase Invoice harus memakai akun kontrol Accounts Payable bisnis ini.",
        );
      }

      const allocation = await getPurchaseInvoiceAllocationInfo(
        businessId,
        purchaseInvoiceId,
        { tx, excludePaymentId },
      );
      if (!allocation) {
        throw new PaymentValidationError(
          "Purchase Invoice yang dialokasikan tidak ditemukan.",
        );
      }
      if (allocation.supplierId !== contactId) {
        throw new PaymentValidationError(
          "Purchase Invoice yang dialokasikan bukan milik Payee (contact) ini.",
        );
      }

      const balanceDueCents = toCents(allocation.balanceDue);
      const alreadyInBatchCents = allocatedInBatchCents.get(purchaseInvoiceId) ?? 0;
      if (alreadyInBatchCents + amountCents > balanceDueCents) {
        throw new PaymentValidationError(
          `Nominal alokasi baris (${(amountCents / 100).toFixed(2)}) melebihi sisa tagihan invoice (${allocation.balanceDue.toFixed(2)}).`,
        );
      }
      allocatedInBatchCents.set(purchaseInvoiceId, alreadyInBatchCents + amountCents);
    }

    computed.push({
      accountId: line.accountId,
      purchaseInvoiceId,
      expenseClaimId,
      description: line.description?.trim() ? line.description.trim() : null,
      amount: fromCents(amountCents),
      amountCents,
    });
  }

  const totalCents = computed.reduce((sum, l) => sum + l.amountCents, 0);
  if (!Number.isSafeInteger(totalCents)) throw new PaymentValidationError("Total melebihi batas presisi.");
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
  paymentId: string;
  businessId: string;
  bankCoaAccountId: string;
  bankAccountName: string;
  contactId: string;
  reference: string | null;
  date: string;
  description: string | null;
  lines: ComputedLine[];
  totalCents: number;
}

async function postPaymentJournal(
  tx: DbOrTx,
  input: PostJournalInput,
): Promise<string> {
  const debitCents = input.lines.reduce((sum, l) => sum + l.amountCents, 0);
  if (input.totalCents !== debitCents) {
    throw new Error(
      `Jurnal payment tidak balance: debit ${debitCents} sen ≠ total ${input.totalCents} sen.`,
    );
  }

  const refLabel = input.reference ?? input.paymentId.slice(0, 8);
  const [entry] = await tx
    .insert(journalEntries)
    .values({
      businessId: input.businessId,
      entryDate: input.date,
      reference: input.reference,
      sourceModule: PAYMENT_SOURCE_MODULE,
      sourceId: input.paymentId,
      description: input.description ?? `Payment ${refLabel}`,
    })
    .returning({ id: journalEntries.id });

  const lines: (typeof journalEntryLines.$inferInsert)[] = [];
  for (const l of input.lines) {
    lines.push({
      journalEntryId: entry.id,
      accountId: l.accountId,
      contactId: input.contactId,
      debit: l.amount,
      credit: "0.00",
      description: l.description ?? `Pembayaran ${refLabel}`,
    });
  }

  lines.push({
    journalEntryId: entry.id,
    accountId: input.bankCoaAccountId,
    contactId: input.contactId,
    debit: "0.00",
    credit: fromCents(input.totalCents),
    description: `Pembayaran dari ${input.bankAccountName} (${refLabel})`,
  });

  const debitSum = lines.reduce((s, row) => s + toCents(Number(row.debit)), 0);
  const creditSum = lines.reduce((s, row) => s + toCents(Number(row.credit)), 0);
  if (debitSum !== creditSum) {
    throw new Error(
      `Jurnal payment tidak balance: debit ${debitSum} sen ≠ kredit ${creditSum} sen.`,
    );
  }

  await tx.insert(journalEntryLines).values(lines);
  return entry.id;
}

async function findActiveJournalIds(
  tx: DbOrTx,
  paymentId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.sourceModule, PAYMENT_SOURCE_MODULE),
        eq(journalEntries.sourceId, paymentId),
        isNull(journalEntries.deletedAt),
      ),
    );
  return rows.map((r) => r.id);
}

async function softDeleteJournals(tx: DbOrTx, paymentId: string): Promise<void> {
  const ids = await findActiveJournalIds(tx, paymentId);
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
  purchaseInvoiceId: string | null;
  expenseClaimId: string | null;
  description: string | null;
  amount: string;
  sortOrder: number;
}): PaymentLineRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    accountCode: row.accountCode,
    accountName: row.accountName,
    purchaseInvoiceId: row.purchaseInvoiceId,
    expenseClaimId: row.expenseClaimId,
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
  contactId: string;
  contactName: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  totalAmount: string | number | null;
}): PaymentRecord {
  const { totalAmount, ...rest } = header;
  return {
    ...rest,
    totalAmount: Number(totalAmount ?? 0),
  };
}

export async function listPayments(
  businessId: string,
  opts: PaymentListOptions,
): Promise<{ data: PaymentRecord[]; total: number }> {
  const totals = db
    .select({
      paymentId: paymentLines.paymentId,
      totalAmount: sql<string>`COALESCE(SUM(${paymentLines.amount}), 0)`.as(
        "total_amount",
      ),
    })
    .from(paymentLines)
    .groupBy(paymentLines.paymentId)
    .as("t");

  const conditions = [
    eq(payments.businessId, businessId),
    isNull(payments.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(payments.reference, pattern),
        ilike(payments.description, pattern),
        ilike(contacts.name, pattern),
      )!,
    );
  }

  const where = and(...conditions);
  const baseQuery = db
    .select({
      id: payments.id,
      businessId: payments.businessId,
      date: payments.date,
      reference: payments.reference,
      bankAccountId: payments.bankAccountId,
      bankAccountName: bankAccounts.name,
      contactId: payments.contactId,
      contactName: contacts.name,
      description: payments.description,
      totalAmount: totals.totalAmount,
      createdAt: payments.createdAt,
      updatedAt: payments.updatedAt,
    })
    .from(payments)
    .innerJoin(bankAccounts, eq(payments.bankAccountId, bankAccounts.id))
    .innerJoin(contacts, eq(payments.contactId, contacts.id))
    .leftJoin(totals, eq(totals.paymentId, payments.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(payments.date), asc(payments.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(payments)
      .innerJoin(bankAccounts, eq(payments.bankAccountId, bankAccounts.id))
      .innerJoin(contacts, eq(payments.contactId, contacts.id))
      .leftJoin(totals, eq(totals.paymentId, payments.id))
      .where(where),
  ]);

  return {
    data: rows.map((r) => toRecord(r)),
    total: totalRow?.total ?? 0,
  };
}

async function getLinesWithAccounts(
  tx: DbOrTx,
  paymentId: string,
): Promise<PaymentLineRecord[]> {
  const rows = await tx
    .select({
      id: paymentLines.id,
      accountId: paymentLines.accountId,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      purchaseInvoiceId: paymentLines.purchaseInvoiceId,
      expenseClaimId: paymentLines.expenseClaimId,
      description: paymentLines.description,
      amount: paymentLines.amount,
      sortOrder: paymentLines.sortOrder,
    })
    .from(paymentLines)
    .innerJoin(chartOfAccounts, eq(paymentLines.accountId, chartOfAccounts.id))
    .where(eq(paymentLines.paymentId, paymentId))
    .orderBy(asc(paymentLines.sortOrder), asc(paymentLines.id));
  return rows.map(toLineRecord);
}

export async function getPaymentById(
  businessId: string,
  paymentId: string,
): Promise<PaymentDetailRecord | null> {
  const [header] = await db
    .select({
      id: payments.id,
      businessId: payments.businessId,
      date: payments.date,
      reference: payments.reference,
      bankAccountId: payments.bankAccountId,
      bankAccountName: bankAccounts.name,
      contactId: payments.contactId,
      contactName: contacts.name,
      description: payments.description,
      createdAt: payments.createdAt,
      updatedAt: payments.updatedAt,
    })
    .from(payments)
    .innerJoin(bankAccounts, eq(payments.bankAccountId, bankAccounts.id))
    .innerJoin(contacts, eq(payments.contactId, contacts.id))
    .where(
      and(
        eq(payments.businessId, businessId),
        eq(payments.id, paymentId),
        isNull(payments.deletedAt),
      ),
    )
    .limit(1);

  if (!header) return null;
  const lines = await getLinesWithAccounts(db, paymentId);
  const totalCents = lines.reduce((sum, l) => sum + toCents(l.amount), 0);
  return {
    ...toRecord({ ...header, totalAmount: fromCents(totalCents) }),
    lines,
  };
}

export async function createPayment(
  businessId: string,
  input: PaymentCreateInput,
): Promise<PaymentDetailRecord> {
  const paymentId = await db.transaction(async (tx) => {
    const bank = await getBankCoaAccount(tx, businessId, input.bankAccountId);
    if (!bank) {
      throw new Error("Rekening bank/kas tidak ditemukan.");
    }

    const { computed, totalCents } = await validateAndComputeLines(
      tx,
      businessId,
      input.contactId,
      input.lines,
    );

    const [header] = await tx
      .insert(payments)
      .values({
        businessId,
        date: input.date,
        reference: input.reference,
        bankAccountId: input.bankAccountId,
        contactId: input.contactId,
        description: input.description,
      })
      .returning({ id: payments.id });

    await tx.insert(paymentLines).values(
      computed.map((l, i) => ({
        paymentId: header.id,
        accountId: l.accountId,
        purchaseInvoiceId: l.purchaseInvoiceId,
        expenseClaimId: l.expenseClaimId,
        description: l.description,
        amount: l.amount,
        sortOrder: i,
      })),
    );

    await postPaymentJournal(tx, {
      paymentId: header.id,
      businessId,
      bankCoaAccountId: bank.accountId,
      bankAccountName: bank.name,
      contactId: input.contactId,
      reference: input.reference ?? null,
      date: input.date,
      description: input.description ?? null,
      lines: computed,
      totalCents,
    });
    return header.id;
  });

  const detail = await getPaymentById(businessId, paymentId);
  if (!detail) throw new Error("Gagal mengambil pembayaran setelah create.");
  return detail;
}

export async function updatePayment(
  businessId: string,
  paymentId: string,
  input: PaymentUpdateInput,
): Promise<PaymentDetailRecord | null> {
  const existing = await getPaymentById(businessId, paymentId);
  if (!existing) return null;

  const bankAccountChanged =
    input.bankAccountId !== undefined &&
    input.bankAccountId !== existing.bankAccountId;
  const contactIdChanged =
    input.contactId !== undefined && input.contactId !== existing.contactId;
  const linesChanged = input.lines !== undefined;
  const needsJournalRepost = bankAccountChanged || contactIdChanged || linesChanged || input.date !== undefined || input.reference !== undefined || input.description !== undefined;

  await db.transaction(async (tx) => {
    let linesToUse = existing.lines;

    if (needsJournalRepost) {
      const finalContactId = input.contactId ?? existing.contactId;
      const linesToValidate: PaymentLineInput[] = linesChanged
        ? input.lines!
        : existing.lines.map((l) => ({
            accountId: l.accountId,
            purchaseInvoiceId: l.purchaseInvoiceId,
            expenseClaimId: l.expenseClaimId,
            description: l.description,
            amount: l.amount,
          }));

      const { computed } = await validateAndComputeLines(
        tx,
        businessId,
        finalContactId,
        linesToValidate,
        paymentId,
      );

      if (linesChanged) {
        await tx.delete(paymentLines).where(eq(paymentLines.paymentId, paymentId));
        await tx.insert(paymentLines).values(
          computed.map((l, i) => ({
            paymentId,
            accountId: l.accountId,
            purchaseInvoiceId: l.purchaseInvoiceId,
            expenseClaimId: l.expenseClaimId,
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
          purchaseInvoiceId: l.purchaseInvoiceId,
          expenseClaimId: l.expenseClaimId,
          description: l.description,
          amount: Number(l.amount),
          sortOrder: i,
        }));
      }

      const bankAccountId = input.bankAccountId ?? existing.bankAccountId;
      const bank = await getBankCoaAccount(tx, businessId, bankAccountId);
      if (!bank) {
        throw new Error("Rekening bank/kas tidak ditemukan.");
      }

      await softDeleteJournals(tx, paymentId);
      const computedLinesForJournal: ComputedLine[] = linesToUse.map((l) => ({
        accountId: l.accountId,
        purchaseInvoiceId: l.purchaseInvoiceId,
        expenseClaimId: l.expenseClaimId,
        description: l.description,
        amount: fromCents(toCents(l.amount)),
        amountCents: toCents(l.amount),
      }));
      const totalCents = computedLinesForJournal.reduce(
        (s, l) => s + l.amountCents,
        0,
      );

      await postPaymentJournal(tx, {
        paymentId,
        businessId,
        bankCoaAccountId: bank.accountId,
        bankAccountName: bank.name,
        contactId: finalContactId,
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

    const patch: Partial<typeof payments.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (input.date) patch.date = input.date;
    if (input.reference !== undefined) patch.reference = input.reference;
    if (input.bankAccountId) patch.bankAccountId = input.bankAccountId;
    if (input.contactId) patch.contactId = input.contactId;
    if (input.description !== undefined) patch.description = input.description;

    await tx
      .update(payments)
      .set(patch)
      .where(
        and(
          eq(payments.businessId, businessId),
          eq(payments.id, paymentId),
          isNull(payments.deletedAt),
        ),
      );
  });

  return getPaymentById(businessId, paymentId);
}

export async function softDeletePayment(
  businessId: string,
  paymentId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [header] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.businessId, businessId),
          eq(payments.id, paymentId),
          isNull(payments.deletedAt),
        ),
      )
      .limit(1);
    if (!header) return false;

    await softDeleteJournals(tx, paymentId);
    await tx
      .update(payments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(payments.id, paymentId));
    return true;
  });
}
