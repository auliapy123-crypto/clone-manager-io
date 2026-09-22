/**
 * BankAccountRepository — Mengelola data rekening kas dan bank.
 */
import { and, asc, count, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../db/index.js";
import {
  bankAccounts,
  chartOfAccounts,
  journalEntries,
  journalEntryLines,
} from "../db/schema.js";

export interface BankAccountRecord {
  id: string;
  businessId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  name: string;
  accountType: "bank" | "cash";
  bankName: string | null;
  accountNumber: string | null;
  currencyCode: string;
  description: string | null;
  status: "active" | "archived";
  currentBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BankAccountListOptions {
  page: number;
  pageSize: number;
  q?: string;
  accountType?: "bank" | "cash";
  status?: "active" | "archived";
}

export interface BankAccountCreateInput {
  name: string;
  accountId: string;
  accountType: "bank" | "cash";
  bankName?: string | null;
  accountNumber?: string | null;
  description?: string | null;
}

export interface BankAccountUpdateInput {
  name?: string;
  accountId?: string;
  accountType?: "bank" | "cash";
  bankName?: string | null;
  accountNumber?: string | null;
  description?: string | null;
}

// Alias tabel untuk subquery saldo (kolom di sql`` harus ter-qualify
// lewat alias — lihat catatan di ContactRepository).
const jelBal = alias(journalEntryLines, "jel_bal");
const jeBal = alias(journalEntries, "je_bal");

const bankAccountColumns = {
  id: bankAccounts.id,
  businessId: bankAccounts.businessId,
  accountId: bankAccounts.accountId,
  accountCode: chartOfAccounts.code,
  accountName: chartOfAccounts.name,
  name: bankAccounts.name,
  accountType: bankAccounts.accountType,
  bankName: bankAccounts.bankName,
  accountNumber: bankAccounts.accountNumber,
  currencyCode: bankAccounts.currencyCode,
  description: bankAccounts.description,
  status: bankAccounts.status,
  createdAt: bankAccounts.createdAt,
  updatedAt: bankAccounts.updatedAt,
  // Perhitungan saldo: sum(debit - credit) dari entri jurnal AKTIF saja.
  // Filter EXISTS ditambahkan saat modul Sales Invoices masuk — sebelumnya
  // belum ada jurnal yang di-soft-delete sehingga hasilnya identik.
  currentBalance: sql<string>`COALESCE((
    SELECT SUM(${jelBal.debit} - ${jelBal.credit})
    FROM ${journalEntryLines} AS ${jelBal}
    WHERE ${jelBal.accountId} = "bank_accounts"."account_id"
      AND EXISTS (
        SELECT 1 FROM ${journalEntries} AS ${jeBal}
        WHERE ${jeBal.id} = ${jelBal.journalEntryId}
          AND ${jeBal.deletedAt} IS NULL
      )
  ), 0.00)`.as("current_balance"),
};

function toRecord(row: any): BankAccountRecord {
  return {
    ...row,
    currentBalance: Number(row.currentBalance),
    accountType: row.accountType as "bank" | "cash",
    status: row.status as "active" | "archived",
  };
}

export async function listBankAccounts(
  businessId: string,
  opts: BankAccountListOptions,
): Promise<{ data: BankAccountRecord[]; total: number }> {
  const conditions = [
    eq(bankAccounts.businessId, businessId),
    isNull(bankAccounts.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(bankAccounts.name, pattern),
        ilike(bankAccounts.bankName, pattern),
        ilike(bankAccounts.accountNumber, pattern),
      )!,
    );
  }

  if (opts.accountType) {
    conditions.push(eq(bankAccounts.accountType, opts.accountType));
  }

  if (opts.status) {
    conditions.push(eq(bankAccounts.status, opts.status));
  }

  const where = and(...conditions);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select(bankAccountColumns)
      .from(bankAccounts)
      .innerJoin(chartOfAccounts, eq(bankAccounts.accountId, chartOfAccounts.id))
      .where(where)
      .orderBy(asc(bankAccounts.name))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db.select({ total: count() }).from(bankAccounts).where(where),
  ]);

  return { data: rows.map(toRecord), total: totalRow?.total ?? 0 };
}

export async function getBankAccountById(
  businessId: string,
  id: string,
): Promise<BankAccountRecord | null> {
  const [row] = await db
    .select(bankAccountColumns)
    .from(bankAccounts)
    .innerJoin(chartOfAccounts, eq(bankAccounts.accountId, chartOfAccounts.id))
    .where(
      and(
        eq(bankAccounts.businessId, businessId),
        eq(bankAccounts.id, id),
        isNull(bankAccounts.deletedAt),
      ),
    )
    .limit(1);

  return row ? toRecord(row) : null;
}

export async function createBankAccount(
  businessId: string,
  input: BankAccountCreateInput,
): Promise<BankAccountRecord> {
  // Ambil currency_code dari COA
  const [coa] = await db
    .select({ currencyCode: chartOfAccounts.currencyCode })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.id, input.accountId))
    .limit(1);

  if (!coa) throw new Error("Account COA tidak ditemukan.");

  const [newRow] = await db
    .insert(bankAccounts)
    .values({
      ...input,
      businessId,
      currencyCode: coa.currencyCode,
    })
    .returning();

  // Ambil record lengkap dengan join COA
  const record = await getBankAccountById(businessId, newRow.id);
  if (!record) throw new Error("Gagal mengambil data setelah create.");
  return record;
}

export async function updateBankAccount(
  businessId: string,
  id: string,
  input: BankAccountUpdateInput,
): Promise<BankAccountRecord | null> {
  let currencyCode: string | undefined;

  if (input.accountId) {
    const [coa] = await db
      .select({ currencyCode: chartOfAccounts.currencyCode })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.id, input.accountId))
      .limit(1);
    if (coa) currencyCode = coa.currencyCode;
  }

  await db
    .update(bankAccounts)
    .set({
      ...input,
      currencyCode,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bankAccounts.businessId, businessId),
        eq(bankAccounts.id, id),
        isNull(bankAccounts.deletedAt),
      ),
    );

  return getBankAccountById(businessId, id);
}

export async function updateBankAccountStatus(
  businessId: string,
  id: string,
  status: "active" | "archived",
): Promise<BankAccountRecord | null> {
  await db
    .update(bankAccounts)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(bankAccounts.businessId, businessId),
        eq(bankAccounts.id, id),
        isNull(bankAccounts.deletedAt),
      ),
    );

  return getBankAccountById(businessId, id);
}

export async function hasJournalEntries(accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: journalEntryLines.id })
    .from(journalEntryLines)
    .where(eq(journalEntryLines.accountId, accountId))
    .limit(1);
  return row !== undefined;
}

export async function softDeleteBankAccount(
  businessId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .update(bankAccounts)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(bankAccounts.businessId, businessId),
        eq(bankAccounts.id, id),
        isNull(bankAccounts.deletedAt),
      ),
    )
    .returning({ id: bankAccounts.id });

  return rows.length > 0;
}

export async function isCoaInUse(
  businessId: string,
  accountId: string,
  excludingBankAccountId?: string,
): Promise<boolean> {
  const conditions = [
    eq(bankAccounts.businessId, businessId),
    eq(bankAccounts.accountId, accountId),
    isNull(bankAccounts.deletedAt),
  ];
  if (excludingBankAccountId) {
    conditions.push(ne(bankAccounts.id, excludingBankAccountId));
  }

  const [row] = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(and(...conditions))
    .limit(1);

  return row !== undefined;
}
