/**
 * BankReconciliationRepository — lembar verifikasi saldo vs rekening koran.
 *
 * BEDA dari semua modul transaksi: TIDAK ADA posting jurnal di sini sama
 * sekali. Modul ini murni baca-saja + CRUD catatan pengecekan:
 * - bookBalance = SUM(debit-kredit) jurnal pada COA bank itu, HANYA yang
 *   entry_date <= tanggal cutoff DAN jurnal aktif (beda dari currentBalance
 *   BankAccountRepository yang selalu all-time).
 * - discrepancy = statementBalance - bookBalance (dihitung dalam SEN).
 * - status = "Reconciled" kalau discrepancy persis 0.
 */
import { and, asc, count, eq, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db, { type Database } from "../db/index.js";
import {
  bankAccounts,
  bankReconciliations,
  journalEntries,
  journalEntryLines,
} from "../db/schema.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

export type ReconciliationStatus = "Reconciled" | "Not Reconciled";

export interface BankReconciliationCreateInput {
  date: string;
  bankAccountId: string;
  statementBalance: number;
  description?: string | null;
}

export interface BankReconciliationUpdateInput {
  date?: string;
  bankAccountId?: string;
  statementBalance?: number;
  description?: string | null;
}

export interface BankReconciliationListOptions {
  page: number;
  pageSize: number;
  q?: string;
}

export interface BankReconciliationRecord {
  id: string;
  businessId: string;
  date: string;
  bankAccountId: string;
  bankAccountName: string;
  statementBalance: number;
  bookBalance: number;
  discrepancy: number;
  status: ReconciliationStatus;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Alias tabel untuk query saldo per cutoff (kolom di sql`` harus
// ter-qualify lewat alias — pelajaran #1).
const jelCut = alias(journalEntryLines, "jel_cut");
const jeCut = alias(journalEntries, "je_cut");

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * bookBalance (dalam SEN, integer eksak) = SUM(debit-kredit) baris jurnal
 * pada akun COA bank itu, hanya jurnal AKTIF dengan entry_date <= cutoff.
 * Perkalian ×100 dikerjakan di Postgres (numeric eksak), bukan di JS.
 */
async function getBookBalanceCents(
  tx: DbOrTx,
  bankCoaAccountId: string,
  cutoffDate: string,
): Promise<number> {
  const [row] = await tx
    .select({
      balanceCents:
        sql<string>`COALESCE(SUM((${jelCut.debit} - ${jelCut.credit}) * 100), 0)`.as(
          "balance_cents",
        ),
    })
    .from(jelCut)
    .innerJoin(jeCut, eq(jelCut.journalEntryId, jeCut.id))
    .where(
      and(
        eq(jelCut.accountId, bankCoaAccountId),
        lte(jeCut.entryDate, cutoffDate),
        isNull(jeCut.deletedAt),
      ),
    );
  return Math.round(Number(row?.balanceCents ?? 0));
}

function toRecord(
  header: {
    id: string;
    businessId: string;
    date: string;
    bankAccountId: string;
    bankAccountName: string;
    statementBalance: string | number;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  bookCents: number,
): BankReconciliationRecord {
  // numeric Postgres datang sebagai STRING — hitung dalam sen (pelajaran #2, #4).
  const statementCents = toCents(Number(header.statementBalance));
  const discrepancyCents = statementCents - bookCents;
  return {
    id: header.id,
    businessId: header.businessId,
    date: header.date,
    bankAccountId: header.bankAccountId,
    bankAccountName: header.bankAccountName,
    statementBalance: statementCents / 100,
    bookBalance: bookCents / 100,
    discrepancy: discrepancyCents / 100,
    status: discrepancyCents === 0 ? "Reconciled" : "Not Reconciled",
    description: header.description,
    createdAt: header.createdAt,
    updatedAt: header.updatedAt,
  };
}

export async function listBankReconciliations(
  businessId: string,
  opts: BankReconciliationListOptions,
): Promise<{ data: BankReconciliationRecord[]; total: number }> {
  const conditions = [
    eq(bankReconciliations.businessId, businessId),
    isNull(bankReconciliations.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(bankReconciliations.description, pattern),
        ilike(bankAccounts.name, pattern),
      )!,
    );
  }

  const where = and(...conditions);
  const baseQuery = db
    .select({
      id: bankReconciliations.id,
      businessId: bankReconciliations.businessId,
      date: bankReconciliations.date,
      bankAccountId: bankReconciliations.bankAccountId,
      bankCoaAccountId: bankAccounts.accountId,
      bankAccountName: bankAccounts.name,
      statementBalance: bankReconciliations.statementBalance,
      description: bankReconciliations.description,
      createdAt: bankReconciliations.createdAt,
      updatedAt: bankReconciliations.updatedAt,
    })
    .from(bankReconciliations)
    .innerJoin(bankAccounts, eq(bankReconciliations.bankAccountId, bankAccounts.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(bankReconciliations.date), asc(bankReconciliations.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(bankReconciliations)
      .innerJoin(bankAccounts, eq(bankReconciliations.bankAccountId, bankAccounts.id))
      .where(where),
  ]);

  const data = await Promise.all(
    rows.map(async (r) => {
      const { bankCoaAccountId, ...header } = r;
      const bookCents = await getBookBalanceCents(db, bankCoaAccountId, r.date);
      return toRecord(header, bookCents);
    }),
  );
  return { data, total: totalRow?.total ?? 0 };
}

export async function getBankReconciliationById(
  businessId: string,
  reconciliationId: string,
): Promise<BankReconciliationRecord | null> {
  const [row] = await db
    .select({
      id: bankReconciliations.id,
      businessId: bankReconciliations.businessId,
      date: bankReconciliations.date,
      bankAccountId: bankReconciliations.bankAccountId,
      bankCoaAccountId: bankAccounts.accountId,
      bankAccountName: bankAccounts.name,
      statementBalance: bankReconciliations.statementBalance,
      description: bankReconciliations.description,
      createdAt: bankReconciliations.createdAt,
      updatedAt: bankReconciliations.updatedAt,
    })
    .from(bankReconciliations)
    .innerJoin(bankAccounts, eq(bankReconciliations.bankAccountId, bankAccounts.id))
    .where(
      and(
        eq(bankReconciliations.businessId, businessId),
        eq(bankReconciliations.id, reconciliationId),
        isNull(bankReconciliations.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  const { bankCoaAccountId, ...header } = row;
  const bookCents = await getBookBalanceCents(db, bankCoaAccountId, row.date);
  return toRecord(header, bookCents);
}

export async function createBankReconciliation(
  businessId: string,
  input: BankReconciliationCreateInput,
): Promise<BankReconciliationRecord> {
  const statementCents = toCents(input.statementBalance);
  const [header] = await db
    .insert(bankReconciliations)
    .values({
      businessId,
      date: input.date,
      bankAccountId: input.bankAccountId,
      statementBalance: fromCents(statementCents),
      description: input.description ?? null,
    })
    .returning({ id: bankReconciliations.id });

  const detail = await getBankReconciliationById(businessId, header.id);
  if (!detail) throw new Error("Gagal mengambil rekonsiliasi setelah create.");
  return detail;
}

export async function updateBankReconciliation(
  businessId: string,
  reconciliationId: string,
  input: BankReconciliationUpdateInput,
): Promise<BankReconciliationRecord | null> {
  const existing = await getBankReconciliationById(businessId, reconciliationId);
  if (!existing) return null;

  const patch: Partial<typeof bankReconciliations.$inferInsert> & {
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (input.date) patch.date = input.date;
  if (input.bankAccountId) patch.bankAccountId = input.bankAccountId;
  if (input.statementBalance !== undefined)
    patch.statementBalance = fromCents(toCents(input.statementBalance));
  if (input.description !== undefined) patch.description = input.description;

  await db
    .update(bankReconciliations)
    .set(patch)
    .where(
      and(
        eq(bankReconciliations.businessId, businessId),
        eq(bankReconciliations.id, reconciliationId),
        isNull(bankReconciliations.deletedAt),
      ),
    );

  return getBankReconciliationById(businessId, reconciliationId);
}

export async function softDeleteBankReconciliation(
  businessId: string,
  reconciliationId: string,
): Promise<boolean> {
  const rows = await db
    .update(bankReconciliations)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(bankReconciliations.businessId, businessId),
        eq(bankReconciliations.id, reconciliationId),
        isNull(bankReconciliations.deletedAt),
      ),
    )
    .returning({ id: bankReconciliations.id });
  return rows.length > 0;
}
