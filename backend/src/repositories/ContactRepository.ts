/**
 * ContactRepository — proyeksi Customers dan Suppliers dari tabel contacts.
 *
 * Seluruh query dibatasi business_id, role contact yang diminta, dan
 * deleted_at IS NULL. Mengubah satu peran tidak pernah mengubah peran lain.
 */
import { and, asc, count, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../db/index.js";
import {
  chartOfAccounts,
  contacts,
  journalEntries,
  journalEntryLines,
} from "../db/schema.js";

type ContactRole = "customer" | "supplier";

interface ContactRecordBase {
  id: string;
  businessId: string;
  name: string;
  code: string | null;
  email: string | null;
  billingAddress: string | null;
  deliveryAddress: string | null;
  salesInvoiceDueDateDays: number | null;
  purchaseInvoiceDueDateDays: number | null;
  isCustomer: boolean;
  isSupplier: boolean;
}

export interface CustomerRecord extends ContactRecordBase {
  creditLimit: number;
  isCustomer: true;
  accountsReceivable: number;
  unallocatedReceipts: number;
}

export interface SupplierRecord extends ContactRecordBase {
  isSupplier: true;
  accountsPayable: number;
  unallocatedPayments: number;
}

export interface ContactListOptions {
  page: number;
  pageSize: number;
  q?: string;
}

export type CustomerListOptions = ContactListOptions;
export type SupplierListOptions = ContactListOptions;

// Alias tabel untuk subquery SQL mentah (lihat catatan di contactColumns).
const jelAr = alias(journalEntryLines, "jel_ar");
const coaAr = alias(chartOfAccounts, "coa_ar");
const jeAr = alias(journalEntries, "je_ar");

export interface CustomerCreateInput {
  name: string;
  code?: string;
  email?: string;
  billingAddress?: string;
  deliveryAddress?: string;
  creditLimit: number;
  salesInvoiceDueDateDays?: number;
}

export interface CustomerUpdateInput {
  name?: string;
  code?: string | null;
  email?: string | null;
  billingAddress?: string | null;
  deliveryAddress?: string | null;
  creditLimit?: number;
  salesInvoiceDueDateDays?: number | null;
}

export interface SupplierCreateInput {
  name: string;
  code?: string;
  email?: string;
  billingAddress?: string;
  deliveryAddress?: string;
  purchaseInvoiceDueDateDays?: number;
}

export interface SupplierUpdateInput {
  name?: string;
  code?: string | null;
  email?: string | null;
  billingAddress?: string | null;
  deliveryAddress?: string | null;
  purchaseInvoiceDueDateDays?: number | null;
}

const contactColumns = {
  id: contacts.id,
  businessId: contacts.businessId,
  name: contacts.name,
  code: contacts.code,
  email: contacts.email,
  billingAddress: contacts.billingAddress,
  deliveryAddress: contacts.deliveryAddress,
  creditLimit: contacts.creditLimit,
  salesInvoiceDueDateDays: contacts.salesInvoiceDueDateDays,
  purchaseInvoiceDueDateDays: contacts.purchaseInvoiceDueDateDays,
  isCustomer: contacts.isCustomer,
  isSupplier: contacts.isSupplier,
  // Piutang live: Σ(debit − kredit) baris jurnal milik kontak ini pada
  // akun kontrol AR bisnisnya, hanya dari entri jurnal yang aktif
  // (ikuti modul Sales Invoices — dulunya hardcode 0.00).
  //
  // CATATAN DRIZZLE: kolom yang diinterpolasi ke sql`` dirender TANPA
  // nama tabel (mis. "contact_id" = "id" — salah!). Makanya tabel dalam
  // di-alias (jel_ar/coa_ar/je_ar) supaya ter-qualify, dan tabel luar
  // ditulis eksplisit "contacts". Tanpa ini hasilnya selalu 0.
  accountsReceivable: sql<string>`COALESCE((
    SELECT SUM(${jelAr.debit} - ${jelAr.credit})
    FROM ${journalEntryLines} AS ${jelAr}
    WHERE ${jelAr.contactId} = "contacts"."id"
      AND ${jelAr.accountId} IN (
        SELECT ${coaAr.id} FROM ${chartOfAccounts} AS ${coaAr}
        WHERE ${coaAr.businessId} = "contacts"."business_id"
          AND ${coaAr.category} = 'Asset'
          AND ${coaAr.isControlAccount} = true
          AND ${coaAr.deletedAt} IS NULL
      )
      AND EXISTS (
        SELECT 1 FROM ${journalEntries} AS ${jeAr}
        WHERE ${jeAr.id} = ${jelAr.journalEntryId}
          AND ${jeAr.deletedAt} IS NULL
      )
  ), 0.00)`.as("accounts_receivable"),
  unallocatedReceipts: sql<string>`0.00`.as("unallocated_receipts"),
  accountsPayable: sql<string>`0.00`.as("accounts_payable"),
  unallocatedPayments: sql<string>`0.00`.as("unallocated_payments"),
};

type ContactQueryRow = Omit<
  ContactRecordBase,
  "isCustomer" | "isSupplier"
> & {
  creditLimit: string;
  isCustomer: boolean;
  isSupplier: boolean;
  accountsReceivable: string;
  unallocatedReceipts: string;
  accountsPayable: string;
  unallocatedPayments: string;
};

function toCustomerRecord(row: ContactQueryRow): CustomerRecord {
  return {
    ...row,
    creditLimit: Number(row.creditLimit),
    isCustomer: true,
    accountsReceivable: Number(row.accountsReceivable),
    unallocatedReceipts: Number(row.unallocatedReceipts),
  };
}

function toSupplierRecord(row: ContactQueryRow): SupplierRecord {
  return {
    ...row,
    isSupplier: true,
    accountsPayable: Number(row.accountsPayable),
    unallocatedPayments: Number(row.unallocatedPayments),
  };
}

function contactConditions(businessId: string, role: ContactRole) {
  return [
    eq(contacts.businessId, businessId),
    role === "customer"
      ? eq(contacts.isCustomer, true)
      : eq(contacts.isSupplier, true),
    isNull(contacts.deletedAt),
  ];
}

async function listContactsByRole(
  businessId: string,
  opts: ContactListOptions,
  role: ContactRole,
): Promise<{ data: ContactQueryRow[]; total: number }> {
  const conditions = contactConditions(businessId, role);
  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(contacts.code, pattern),
        ilike(contacts.name, pattern),
        ilike(contacts.email, pattern),
      )!,
    );
  }

  const where = and(...conditions);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select(contactColumns)
      .from(contacts)
      .where(where)
      .orderBy(asc(contacts.name))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db.select({ total: count() }).from(contacts).where(where),
  ]);

  return { data: rows, total: totalRow?.total ?? 0 };
}

async function getContactByRole(
  businessId: string,
  contactId: string,
  role: ContactRole,
): Promise<ContactQueryRow | null> {
  const [row] = await db
    .select(contactColumns)
    .from(contacts)
    .where(and(...contactConditions(businessId, role), eq(contacts.id, contactId)))
    .limit(1);
  return row ?? null;
}

async function isContactCodeInUse(
  businessId: string,
  code: string,
  role: ContactRole,
  excludingContactId?: string,
): Promise<boolean> {
  const conditions = [
    ...contactConditions(businessId, role),
    eq(contacts.code, code),
  ];
  if (excludingContactId) conditions.push(ne(contacts.id, excludingContactId));

  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(...conditions))
    .limit(1);
  return row !== undefined;
}

async function softDeleteContactByRole(
  businessId: string,
  contactId: string,
  role: ContactRole,
): Promise<boolean> {
  const rows = await db
    .update(contacts)
    .set({ deletedAt: new Date() })
    .where(and(...contactConditions(businessId, role), eq(contacts.id, contactId)))
    .returning({ id: contacts.id });
  return rows.length > 0;
}

// --- Customers -------------------------------------------------------
export async function listCustomersByBusiness(
  businessId: string,
  opts: CustomerListOptions,
): Promise<{ data: CustomerRecord[]; total: number }> {
  const { data, total } = await listContactsByRole(businessId, opts, "customer");
  return { data: data.map(toCustomerRecord), total };
}

export async function getCustomerById(businessId: string, customerId: string) {
  const row = await getContactByRole(businessId, customerId, "customer");
  return row ? toCustomerRecord(row) : null;
}

export function isCustomerCodeInUse(
  businessId: string,
  code: string,
  excludingCustomerId?: string,
) {
  return isContactCodeInUse(businessId, code, "customer", excludingCustomerId);
}

export async function createCustomer(
  businessId: string,
  input: CustomerCreateInput,
): Promise<CustomerRecord> {
  const [row] = await db
    .insert(contacts)
    .values({
      ...input,
      businessId,
      isCustomer: true,
      creditLimit: input.creditLimit.toFixed(2),
    })
    .returning(contactColumns);
  return toCustomerRecord(row);
}

export async function updateCustomer(
  businessId: string,
  customerId: string,
  input: CustomerUpdateInput,
): Promise<CustomerRecord | null> {
  const [row] = await db
    .update(contacts)
    .set({
      ...input,
      creditLimit: input.creditLimit === undefined ? undefined : input.creditLimit.toFixed(2),
    })
    .where(and(...contactConditions(businessId, "customer"), eq(contacts.id, customerId)))
    .returning(contactColumns);
  return row ? toCustomerRecord(row) : null;
}

export function softDeleteCustomer(businessId: string, customerId: string) {
  return softDeleteContactByRole(businessId, customerId, "customer");
}

// --- Suppliers -------------------------------------------------------
export async function listSuppliersByBusiness(
  businessId: string,
  opts: SupplierListOptions,
): Promise<{ data: SupplierRecord[]; total: number }> {
  const { data, total } = await listContactsByRole(businessId, opts, "supplier");
  return { data: data.map(toSupplierRecord), total };
}

export async function getSupplierById(businessId: string, supplierId: string) {
  const row = await getContactByRole(businessId, supplierId, "supplier");
  return row ? toSupplierRecord(row) : null;
}

export function isSupplierCodeInUse(
  businessId: string,
  code: string,
  excludingSupplierId?: string,
) {
  return isContactCodeInUse(businessId, code, "supplier", excludingSupplierId);
}

export async function createSupplier(
  businessId: string,
  input: SupplierCreateInput,
): Promise<SupplierRecord> {
  const [row] = await db
    .insert(contacts)
    .values({ ...input, businessId, isSupplier: true })
    .returning(contactColumns);
  return toSupplierRecord(row);
}

export async function updateSupplier(
  businessId: string,
  supplierId: string,
  input: SupplierUpdateInput,
): Promise<SupplierRecord | null> {
  const [row] = await db
    .update(contacts)
    .set(input)
    .where(and(...contactConditions(businessId, "supplier"), eq(contacts.id, supplierId)))
    .returning(contactColumns);
  return row ? toSupplierRecord(row) : null;
}

export function softDeleteSupplier(businessId: string, supplierId: string) {
  return softDeleteContactByRole(businessId, supplierId, "supplier");
}
