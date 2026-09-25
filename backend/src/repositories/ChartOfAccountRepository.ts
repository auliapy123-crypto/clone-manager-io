/**
 * ChartOfAccountRepository (Guide §3.2, §5.4).
 *
 * Pure function, diekspor satu per satu, mengimpor `db` langsung.
 * Tidak tahu HTTP: tidak menerima FastifyReply, tidak menentukan status code.
 *
 * Soft-delete (Guide §5.2): setiap query membaca hanya baris dengan
 * `deleted_at IS NULL`. Semua fungsi juga dibatasi `business_id` — itulah
 * batas tenant untuk modul ini.
 */
import { and, asc, count, eq, ilike, isNull, or } from "drizzle-orm";
import db from "../db/index.js";
import { chartOfAccounts, type AccountCategory } from "../db/schema.js";

export interface AccountRecord {
  id: string;
  businessId: string;
  code: string;
  name: string;
  category: AccountCategory;
  groupName: string | null;
  currencyCode: string;
  isControlAccount: boolean;
  isExpenseClaimsControlAccount: boolean;
}

export interface AccountListOptions {
  page: number;
  pageSize: number;
  q?: string;
  category?: AccountCategory;
}

export interface AccountCreateInput {
  code: string;
  name: string;
  category: AccountCategory;
  groupName?: string;
  currencyCode: string;
  isControlAccount: boolean;
  isExpenseClaimsControlAccount?: boolean;
}

export interface AccountUpdateInput {
  code?: string;
  name?: string;
  category?: AccountCategory;
  groupName?: string | null;
  currencyCode?: string;
  isControlAccount?: boolean;
  isExpenseClaimsControlAccount?: boolean;
}

const accountColumns = {
  id: chartOfAccounts.id,
  businessId: chartOfAccounts.businessId,
  code: chartOfAccounts.code,
  name: chartOfAccounts.name,
  category: chartOfAccounts.category,
  groupName: chartOfAccounts.groupName,
  currencyCode: chartOfAccounts.currencyCode,
  isControlAccount: chartOfAccounts.isControlAccount,
  isExpenseClaimsControlAccount: chartOfAccounts.isExpenseClaimsControlAccount,
};

class AccountValidationError extends Error { readonly statusCode = 400; }
function validateExpenseClaimsControl(input: { category: AccountCategory; isControlAccount?: boolean; isExpenseClaimsControlAccount?: boolean }) {
  if (input.isExpenseClaimsControlAccount && (input.category !== "Liability" || input.isControlAccount)) {
    throw new AccountValidationError("Akun kontrol Expense Claims harus Liability dan isControlAccount=false (terpisah dari AR/AP).");
  }
}

/**
 * Daftar akun satu bisnis, dengan pencarian bebas (code/name) dan filter
 * kategori opsional.
 */
export async function listAccountsByBusiness(
  businessId: string,
  opts: AccountListOptions,
): Promise<{ data: AccountRecord[]; total: number }> {
  const conditions = [
    eq(chartOfAccounts.businessId, businessId),
    isNull(chartOfAccounts.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(chartOfAccounts.code, pattern),
        ilike(chartOfAccounts.name, pattern),
      )!,
    );
  }

  if (opts.category) {
    conditions.push(eq(chartOfAccounts.category, opts.category));
  }

  const where = and(...conditions);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select(accountColumns)
      .from(chartOfAccounts)
      .where(where)
      .orderBy(asc(chartOfAccounts.code))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db.select({ total: count() }).from(chartOfAccounts).where(where),
  ]);

  return { data: rows, total: totalRow?.total ?? 0 };
}

export async function getAccountById(
  businessId: string,
  accountId: string,
): Promise<AccountRecord | null> {
  const [row] = await db
    .select(accountColumns)
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.id, accountId),
        eq(chartOfAccounts.businessId, businessId),
        isNull(chartOfAccounts.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function createAccount(
  businessId: string,
  input: AccountCreateInput,
): Promise<AccountRecord> {
  validateExpenseClaimsControl(input);
  const [row] = await db
    .insert(chartOfAccounts)
    .values({ ...input, businessId })
    .returning(accountColumns);

  return row;
}

export async function updateAccount(
  businessId: string,
  accountId: string,
  input: AccountUpdateInput,
): Promise<AccountRecord | null> {
  const existing = await getAccountById(businessId, accountId);
  if (!existing) return null;
  validateExpenseClaimsControl({ ...existing, ...input });
  const [row] = await db
    .update(chartOfAccounts)
    .set(input)
    .where(
      and(
        eq(chartOfAccounts.id, accountId),
        eq(chartOfAccounts.businessId, businessId),
        isNull(chartOfAccounts.deletedAt),
      ),
    )
    .returning(accountColumns);

  return row ?? null;
}

export async function softDeleteAccount(
  businessId: string,
  accountId: string,
): Promise<boolean> {
  const rows = await db
    .update(chartOfAccounts)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(chartOfAccounts.id, accountId),
        eq(chartOfAccounts.businessId, businessId),
        isNull(chartOfAccounts.deletedAt),
      ),
    )
    .returning({ id: chartOfAccounts.id });

  return rows.length > 0;
}
