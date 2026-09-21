/**
 * ContactRepository — proyeksi Customers dari tabel contacts bersama.
 *
 * Setiap query Customers wajib dibatasi business_id, is_customer = true,
 * dan deleted_at IS NULL. is_supplier sengaja tidak pernah diubah di sini.
 */
import { and, asc, count, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import db from "../db/index.js";
import { contacts } from "../db/schema.js";

export interface CustomerRecord {
  id: string;
  businessId: string;
  name: string;
  code: string | null;
  email: string | null;
  billingAddress: string | null;
  deliveryAddress: string | null;
  creditLimit: number;
  salesInvoiceDueDateDays: number | null;
  isCustomer: true;
  isSupplier: boolean;
  accountsReceivable: number;
  unallocatedReceipts: number;
}

export interface CustomerListOptions {
  page: number;
  pageSize: number;
  q?: string;
}

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

/* Saldo tetap dihitung di SQL; sampai modul transaksi tersedia nilainya 0.00. */
const customerColumns = {
  id: contacts.id,
  businessId: contacts.businessId,
  name: contacts.name,
  code: contacts.code,
  email: contacts.email,
  billingAddress: contacts.billingAddress,
  deliveryAddress: contacts.deliveryAddress,
  creditLimit: contacts.creditLimit,
  salesInvoiceDueDateDays: contacts.salesInvoiceDueDateDays,
  isCustomer: contacts.isCustomer,
  isSupplier: contacts.isSupplier,
  accountsReceivable: sql<string>`0.00`.as("accounts_receivable"),
  unallocatedReceipts: sql<string>`0.00`.as("unallocated_receipts"),
};

type CustomerQueryRow = Omit<
  CustomerRecord,
  "creditLimit" | "isCustomer" | "accountsReceivable" | "unallocatedReceipts"
> & {
  creditLimit: string;
  isCustomer: boolean;
  accountsReceivable: string;
  unallocatedReceipts: string;
};

function toCustomerRecord(row: CustomerQueryRow): CustomerRecord {
  return {
    ...row,
    creditLimit: Number(row.creditLimit),
    isCustomer: true,
    accountsReceivable: Number(row.accountsReceivable),
    unallocatedReceipts: Number(row.unallocatedReceipts),
  };
}

function customerConditions(businessId: string) {
  return [
    eq(contacts.businessId, businessId),
    eq(contacts.isCustomer, true),
    isNull(contacts.deletedAt),
  ];
}

export async function listCustomersByBusiness(
  businessId: string,
  opts: CustomerListOptions,
): Promise<{ data: CustomerRecord[]; total: number }> {
  const conditions = customerConditions(businessId);

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
      .select(customerColumns)
      .from(contacts)
      .where(where)
      .orderBy(asc(contacts.name))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db.select({ total: count() }).from(contacts).where(where),
  ]);

  return { data: rows.map(toCustomerRecord), total: totalRow?.total ?? 0 };
}

export async function getCustomerById(
  businessId: string,
  customerId: string,
): Promise<CustomerRecord | null> {
  const [row] = await db
    .select(customerColumns)
    .from(contacts)
    .where(and(...customerConditions(businessId), eq(contacts.id, customerId)))
    .limit(1);

  return row ? toCustomerRecord(row) : null;
}

/** Dipakai route untuk mengembalikan 409 bila kode customer sudah digunakan. */
export async function isCustomerCodeInUse(
  businessId: string,
  code: string,
  excludingCustomerId?: string,
): Promise<boolean> {
  const conditions = [
    ...customerConditions(businessId),
    eq(contacts.code, code),
  ];

  if (excludingCustomerId) {
    conditions.push(ne(contacts.id, excludingCustomerId));
  }

  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(...conditions))
    .limit(1);

  return row !== undefined;
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
    .returning(customerColumns);

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
      creditLimit:
        input.creditLimit === undefined
          ? undefined
          : input.creditLimit.toFixed(2),
    })
    .where(and(...customerConditions(businessId), eq(contacts.id, customerId)))
    .returning(customerColumns);

  return row ? toCustomerRecord(row) : null;
}

export async function softDeleteCustomer(
  businessId: string,
  customerId: string,
): Promise<boolean> {
  const rows = await db
    .update(contacts)
    .set({ deletedAt: new Date() })
    .where(and(...customerConditions(businessId), eq(contacts.id, customerId)))
    .returning({ id: contacts.id });

  return rows.length > 0;
}
