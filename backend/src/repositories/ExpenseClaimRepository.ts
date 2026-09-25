import { and, asc, count, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import db, { type Database } from "../db/index.js";
import { chartOfAccounts, contacts, expenseClaims, expenseClaimLines, journalEntries, journalEntryLines, payments, paymentLines } from "../db/schema.js";
import type { CreateExpenseClaimSchema, UpdateExpenseClaimSchema, ExpenseClaimListQuerySchema } from "../schemas/ExpenseClaim.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;
type CreateInput = z.infer<typeof CreateExpenseClaimSchema>;
type UpdateInput = z.infer<typeof UpdateExpenseClaimSchema>;
export const EXPENSE_CLAIM_SOURCE_MODULE = "expense_claim";
export class ExpenseClaimValidationError extends Error { readonly statusCode = 400; }
const cents = (n: number) => Math.round(n * 100);
const money = (n: number) => (n / 100).toFixed(2);

export async function findExpenseClaimsControlAccount(businessId: string, tx: DbOrTx = db) {
  const rows = await tx.select({ id: chartOfAccounts.id }).from(chartOfAccounts).where(and(
    eq(chartOfAccounts.businessId, businessId), eq(chartOfAccounts.category, "Liability"),
    eq(chartOfAccounts.isExpenseClaimsControlAccount, true), isNull(chartOfAccounts.deletedAt),
  ));
  if (rows.length !== 1) throw new ExpenseClaimValidationError("Bisnis harus memiliki tepat satu akun Liability dengan isExpenseClaimsControlAccount=true.");
  return rows[0];
}

// Alias inner tables and explicitly qualify the outer header in correlated SQL.
const cl = alias(expenseClaimLines, "ec_total_lines");
const pl = alias(paymentLines, "ec_paid_lines");
const p = alias(payments, "ec_paid_headers");
const claimAmount = sql<string>`COALESCE((SELECT SUM(${cl.amount}) FROM ${expenseClaimLines} AS ${cl} WHERE ${cl.expenseClaimId} = "expense_claims"."id"), 0)`;
const paidAmount = sql<string>`COALESCE((SELECT SUM(${pl.amount}) FROM ${paymentLines} AS ${pl} INNER JOIN ${payments} AS ${p} ON ${p.id} = ${pl.paymentId} WHERE ${pl.expenseClaimId} = "expense_claims"."id" AND ${p.businessId} = "expense_claims"."business_id" AND ${p.deletedAt} IS NULL), 0)`;
const balance = sql<string>`(${claimAmount} - ${paidAmount})`;
const columns = {
  id: expenseClaims.id, businessId: expenseClaims.businessId, date: expenseClaims.date,
  reference: expenseClaims.reference, payerContactId: expenseClaims.payerContactId, payerName: contacts.name,
  payee: expenseClaims.payee, description: expenseClaims.description,
  createdAt: expenseClaims.createdAt, updatedAt: expenseClaims.updatedAt,
  claimAmount: claimAmount.as("claim_amount"), balanceDue: balance.as("balance_due"),
};
function toRecord<T extends { claimAmount: string; balanceDue: string }>(row: T) {
  const balanceDue = Number(row.balanceDue);
  return { ...row, claimAmount: Number(row.claimAmount), balanceDue, status: balanceDue <= 0 ? "Paid" as const : "Unpaid" as const };
}
const scope = (businessId: string, id?: string) => and(eq(expenseClaims.businessId, businessId), isNull(expenseClaims.deletedAt), id ? eq(expenseClaims.id, id) : undefined);

export async function listExpenseClaims(businessId: string, opts: z.infer<typeof ExpenseClaimListQuerySchema>) {
  const conditions = [scope(businessId)];
  if (opts.payerContactId) conditions.push(eq(expenseClaims.payerContactId, opts.payerContactId));
  if (opts.status) conditions.push(opts.status === "Paid" ? sql`${balance} <= 0` : sql`${balance} > 0`);
  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(or(ilike(expenseClaims.reference, pattern), ilike(expenseClaims.description, pattern), ilike(expenseClaims.payee, pattern), ilike(contacts.name, pattern)));
  }
  const where = and(...conditions);
  const [rows, [total]] = await Promise.all([
    db.select(columns).from(expenseClaims).innerJoin(contacts, eq(contacts.id, expenseClaims.payerContactId)).where(where)
      .orderBy(asc(expenseClaims.date), asc(expenseClaims.id)).limit(opts.pageSize).offset((opts.page - 1) * opts.pageSize),
    db.select({ total: count() }).from(expenseClaims).innerJoin(contacts, eq(contacts.id, expenseClaims.payerContactId)).where(where),
  ]);
  return { data: rows.map(toRecord), total: total?.total ?? 0 };
}
export async function getExpenseClaimById(businessId: string, id: string, tx: DbOrTx = db) {
  const [header] = await tx.select(columns).from(expenseClaims).innerJoin(contacts, eq(contacts.id, expenseClaims.payerContactId)).where(scope(businessId, id));
  if (!header) return null;
  const lines = await tx.select({
    id: expenseClaimLines.id, accountId: expenseClaimLines.accountId, accountCode: chartOfAccounts.code,
    accountName: chartOfAccounts.name, description: expenseClaimLines.description, amount: expenseClaimLines.amount, sortOrder: expenseClaimLines.sortOrder,
  }).from(expenseClaimLines).innerJoin(chartOfAccounts, eq(chartOfAccounts.id, expenseClaimLines.accountId))
    .where(eq(expenseClaimLines.expenseClaimId, id)).orderBy(asc(expenseClaimLines.sortOrder), asc(expenseClaimLines.id));
  return { ...toRecord(header), lines: lines.map(l => ({ ...l, amount: Number(l.amount) })) };
}

export async function getExpenseClaimAllocationInfo(businessId: string, id: string, opts: { tx?: DbOrTx; excludePaymentId?: string } = {}) {
  const tx = opts.tx ?? db;
  // Serialize allocations against the same claim so concurrent payments cannot overpay.
  const [header] = await tx.select({ payerContactId: expenseClaims.payerContactId }).from(expenseClaims).where(scope(businessId, id)).for("update");
  if (!header) return null;
  const [total] = await tx.select({ amount: sql<string>`COALESCE(SUM(${expenseClaimLines.amount}), 0)` }).from(expenseClaimLines).where(eq(expenseClaimLines.expenseClaimId, id));
  const [paid] = await tx.select({ amount: sql<string>`COALESCE(SUM(${paymentLines.amount}), 0)` }).from(paymentLines)
    .innerJoin(payments, eq(payments.id, paymentLines.paymentId)).where(and(
      eq(paymentLines.expenseClaimId, id), eq(payments.businessId, businessId), isNull(payments.deletedAt),
      opts.excludePaymentId ? ne(payments.id, opts.excludePaymentId) : undefined,
    ));
  return { payerContactId: header.payerContactId, balanceDue: (cents(Number(total.amount)) - cents(Number(paid.amount))) / 100 };
}
async function validate(tx: DbOrTx, businessId: string, input: CreateInput) {
  const [contact] = await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, input.payerContactId), eq(contacts.businessId, businessId), isNull(contacts.deletedAt)));
  if (!contact) throw new ExpenseClaimValidationError("Payer tidak ditemukan di bisnis ini.");
  if (!input.lines.length) throw new ExpenseClaimValidationError("Minimal satu baris diperlukan.");
  for (const line of input.lines) {
    const [account] = await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.id, line.accountId), eq(chartOfAccounts.businessId, businessId), isNull(chartOfAccounts.deletedAt)));
    if (!account || !["Expense", "Asset"].includes(account.category)) throw new ExpenseClaimValidationError("Akun baris harus Expense/Asset milik bisnis ini.");
    if (!Number.isSafeInteger(cents(line.amount)) || cents(line.amount) <= 0) throw new ExpenseClaimValidationError("Nominal baris tidak valid.");
  }
  if (!Number.isSafeInteger(input.lines.reduce((s, l) => s + cents(l.amount), 0))) throw new ExpenseClaimValidationError("Total melebihi batas presisi.");
}
async function deleteJournals(tx: DbOrTx, businessId: string, id: string) {
  await tx.update(journalEntries).set({ deletedAt: new Date() }).where(and(eq(journalEntries.businessId, businessId), eq(journalEntries.sourceModule, EXPENSE_CLAIM_SOURCE_MODULE), eq(journalEntries.sourceId, id), isNull(journalEntries.deletedAt)));
}
async function postJournal(tx: DbOrTx, businessId: string, id: string, input: CreateInput) {
  const control = await findExpenseClaimsControlAccount(businessId, tx);
  const total = input.lines.reduce((s, l) => s + cents(l.amount), 0);
  const [entry] = await tx.insert(journalEntries).values({ businessId, entryDate: input.date, reference: input.reference, description: input.description ?? "Expense Claim", sourceModule: EXPENSE_CLAIM_SOURCE_MODULE, sourceId: id }).returning({ id: journalEntries.id });
  const lines = input.lines.map(l => ({ journalEntryId: entry.id, accountId: l.accountId, contactId: input.payerContactId, debit: money(cents(l.amount)), credit: "0.00", description: l.description ?? null }));
  lines.push({ journalEntryId: entry.id, accountId: control.id, contactId: input.payerContactId, debit: "0.00", credit: money(total), description: "Utang reimbursement" });
  if (lines.reduce((s, l) => s + cents(Number(l.debit)) - cents(Number(l.credit)), 0) !== 0) throw new Error("Jurnal Expense Claim tidak balance.");
  await tx.insert(journalEntryLines).values(lines);
}
async function insertLines(tx: DbOrTx, id: string, lines: CreateInput["lines"]) {
  await tx.insert(expenseClaimLines).values(lines.map((l, i) => ({ expenseClaimId: id, accountId: l.accountId, description: l.description, amount: money(cents(l.amount)), sortOrder: i })));
}
export async function createExpenseClaim(businessId: string, input: CreateInput) {
  const id = await db.transaction(async tx => {
    await validate(tx, businessId, input);
    const { lines, ...header } = input;
    const [row] = await tx.insert(expenseClaims).values({ ...header, businessId }).returning({ id: expenseClaims.id });
    await insertLines(tx, row.id, lines);
    await postJournal(tx, businessId, row.id, input);
    return row.id;
  });
  return (await getExpenseClaimById(businessId, id))!;
}
export async function updateExpenseClaim(businessId: string, id: string, input: UpdateInput) {
  return db.transaction(async tx => {
    const [locked] = await tx.select({ id: expenseClaims.id }).from(expenseClaims).where(scope(businessId, id)).for("update");
    if (!locked) return null;
    const existing = (await getExpenseClaimById(businessId, id, tx))!;
    const merged = { ...existing, ...input };
    await validate(tx, businessId, merged);
    const { lines, ...patch } = input;
    await tx.update(expenseClaims).set({ ...patch, updatedAt: new Date() }).where(scope(businessId, id));
    if (lines) { await tx.delete(expenseClaimLines).where(eq(expenseClaimLines.expenseClaimId, id)); await insertLines(tx, id, lines); }
    // Repost also on date/reference/description changes so journal metadata stays current.
    await deleteJournals(tx, businessId, id);
    await postJournal(tx, businessId, id, merged);
    return getExpenseClaimById(businessId, id, tx);
  });
}
export async function softDeleteExpenseClaim(businessId: string, id: string) {
  return db.transaction(async tx => {
    const rows = await tx.update(expenseClaims).set({ deletedAt: new Date(), updatedAt: new Date() }).where(scope(businessId, id)).returning({ id: expenseClaims.id });
    if (!rows.length) return false;
    await deleteJournals(tx, businessId, id);
    return true;
  });
}
