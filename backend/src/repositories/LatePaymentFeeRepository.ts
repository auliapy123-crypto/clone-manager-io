/**
 * LatePaymentFeeRepository — denda keterlambatan pembayaran (NON-POSTING).
 *
 * Modul PALING SIMPEL sejauh ini:
 * - TANPA baris item (1 tabel datar).
 * - TIDAK ADA logic jurnal sama sekali.
 * - TANPA fungsi getById terpisah — dokumen resmi cuma minta 4 endpoint
 *   (list/create/update/delete), form edit dipicu dari data yang sudah
 *   ada di baris list.
 * - amount diisi MANUAL (bukan dihitung otomatis).
 * - salesInvoiceId WAJIB milik customerId yang sama — divalidasi di sini
 *   lewat validateInvoiceBelongsToCustomer, dipanggil dari routes.
 */
import { and, asc, count, eq, ilike, isNull } from "drizzle-orm";
import db from "../db/index.js";
import { contacts, latePaymentFees, salesInvoices } from "../db/schema.js";

export class LatePaymentFeeValidationError extends Error {}

export interface LatePaymentFeeCreateInput {
  date: string;
  customerId: string;
  salesInvoiceId: string;
  amount: number;
}

export interface LatePaymentFeeUpdateInput {
  date?: string;
  customerId?: string;
  salesInvoiceId?: string;
  amount?: number;
}

export interface LatePaymentFeeListOptions {
  page: number;
  pageSize: number;
  q?: string;
}

export interface LatePaymentFeeRecord {
  id: string;
  businessId: string;
  date: string;
  customerId: string;
  customerName: string;
  salesInvoiceId: string;
  salesInvoiceReference: string | null;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
}

function toRecord(row: {
  id: string;
  businessId: string;
  date: string;
  customerId: string;
  customerName: string;
  salesInvoiceId: string;
  salesInvoiceReference: string | null;
  amount: string;
  createdAt: Date;
  updatedAt: Date;
}): LatePaymentFeeRecord {
  return { ...row, amount: Number(row.amount) };
}

/**
 * sales_invoice_id yang dipilih harus benar-benar milik customer_id yang
 * sama — validasi silang biar nggak salah pasang invoice pelanggan lain.
 */
export async function validateInvoiceBelongsToCustomer(
  businessId: string,
  salesInvoiceId: string,
  customerId: string,
): Promise<void> {
  const [invoice] = await db
    .select({ customerId: salesInvoices.customerId })
    .from(salesInvoices)
    .where(
      and(
        eq(salesInvoices.businessId, businessId),
        eq(salesInvoices.id, salesInvoiceId),
        isNull(salesInvoices.deletedAt),
      ),
    )
    .limit(1);

  if (!invoice) {
    throw new LatePaymentFeeValidationError("Sales Invoice tidak ditemukan.");
  }
  if (invoice.customerId !== customerId) {
    throw new LatePaymentFeeValidationError(
      "Sales Invoice yang dipilih bukan milik Customer ini.",
    );
  }
}

// ---------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------
export async function listLatePaymentFees(
  businessId: string,
  opts: LatePaymentFeeListOptions,
): Promise<{ data: LatePaymentFeeRecord[]; total: number }> {
  const conditions = [
    eq(latePaymentFees.businessId, businessId),
    isNull(latePaymentFees.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(ilike(contacts.name, pattern));
  }

  const where = and(...conditions);
  const baseQuery = db
    .select({
      id: latePaymentFees.id,
      businessId: latePaymentFees.businessId,
      date: latePaymentFees.date,
      customerId: latePaymentFees.customerId,
      customerName: contacts.name,
      salesInvoiceId: latePaymentFees.salesInvoiceId,
      salesInvoiceReference: salesInvoices.reference,
      amount: latePaymentFees.amount,
      createdAt: latePaymentFees.createdAt,
      updatedAt: latePaymentFees.updatedAt,
    })
    .from(latePaymentFees)
    .innerJoin(contacts, eq(latePaymentFees.customerId, contacts.id))
    .innerJoin(
      salesInvoices,
      eq(latePaymentFees.salesInvoiceId, salesInvoices.id),
    )
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(latePaymentFees.date), asc(latePaymentFees.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(latePaymentFees)
      .innerJoin(contacts, eq(latePaymentFees.customerId, contacts.id))
      .innerJoin(
        salesInvoices,
        eq(latePaymentFees.salesInvoiceId, salesInvoices.id),
      )
      .where(where),
  ]);

  return {
    data: rows.map(toRecord),
    total: totalRow?.total ?? 0,
  };
}

// ---------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------
export async function createLatePaymentFee(
  businessId: string,
  input: LatePaymentFeeCreateInput,
): Promise<LatePaymentFeeRecord> {
  const [row] = await db
    .insert(latePaymentFees)
    .values({
      businessId,
      date: input.date,
      customerId: input.customerId,
      salesInvoiceId: input.salesInvoiceId,
      amount: input.amount.toFixed(2),
    })
    .returning({ id: latePaymentFees.id });

  const created = await getLatePaymentFeeRowById(businessId, row.id);
  if (!created) throw new Error("Gagal mengambil denda setelah create.");
  return created;
}

// ---------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------
export async function updateLatePaymentFee(
  businessId: string,
  feeId: string,
  input: LatePaymentFeeUpdateInput,
): Promise<LatePaymentFeeRecord | null> {
  const existing = await getLatePaymentFeeRowById(businessId, feeId);
  if (!existing) return null;

  // customerId dan/atau salesInvoiceId berubah -> validasi ulang silang,
  // pakai nilai efektif (baru kalau dikirim, lama kalau tidak).
  if (input.customerId !== undefined || input.salesInvoiceId !== undefined) {
    const effectiveCustomerId = input.customerId ?? existing.customerId;
    const effectiveInvoiceId = input.salesInvoiceId ?? existing.salesInvoiceId;
    await validateInvoiceBelongsToCustomer(
      businessId,
      effectiveInvoiceId,
      effectiveCustomerId,
    );
  }

  const patch: Partial<typeof latePaymentFees.$inferInsert> & {
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (input.date !== undefined) patch.date = input.date;
  if (input.customerId !== undefined) patch.customerId = input.customerId;
  if (input.salesInvoiceId !== undefined) {
    patch.salesInvoiceId = input.salesInvoiceId;
  }
  if (input.amount !== undefined) patch.amount = input.amount.toFixed(2);

  await db
    .update(latePaymentFees)
    .set(patch)
    .where(
      and(
        eq(latePaymentFees.businessId, businessId),
        eq(latePaymentFees.id, feeId),
        isNull(latePaymentFees.deletedAt),
      ),
    );

  return getLatePaymentFeeRowById(businessId, feeId);
}

// ---------------------------------------------------------------------
// DELETE — bebas, tanpa lock (murni catatan, tidak mempengaruhi saldo)
// ---------------------------------------------------------------------
export async function softDeleteLatePaymentFee(
  businessId: string,
  feeId: string,
): Promise<boolean> {
  const [updated] = await db
    .update(latePaymentFees)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(latePaymentFees.businessId, businessId),
        eq(latePaymentFees.id, feeId),
        isNull(latePaymentFees.deletedAt),
      ),
    )
    .returning({ id: latePaymentFees.id });
  return updated !== undefined;
}

// ---------------------------------------------------------------------
// Helper internal — dipakai create/update untuk mengembalikan record
// lengkap (join customer + invoice reference), TANPA endpoint GET detail
// terpisah di routes (sesuai dokumen §2.2 & §11).
// ---------------------------------------------------------------------
async function getLatePaymentFeeRowById(
  businessId: string,
  feeId: string,
): Promise<LatePaymentFeeRecord | null> {
  const [row] = await db
    .select({
      id: latePaymentFees.id,
      businessId: latePaymentFees.businessId,
      date: latePaymentFees.date,
      customerId: latePaymentFees.customerId,
      customerName: contacts.name,
      salesInvoiceId: latePaymentFees.salesInvoiceId,
      salesInvoiceReference: salesInvoices.reference,
      amount: latePaymentFees.amount,
      createdAt: latePaymentFees.createdAt,
      updatedAt: latePaymentFees.updatedAt,
    })
    .from(latePaymentFees)
    .innerJoin(contacts, eq(latePaymentFees.customerId, contacts.id))
    .innerJoin(
      salesInvoices,
      eq(latePaymentFees.salesInvoiceId, salesInvoices.id),
    )
    .where(
      and(
        eq(latePaymentFees.businessId, businessId),
        eq(latePaymentFees.id, feeId),
        isNull(latePaymentFees.deletedAt),
      ),
    )
    .limit(1);

  return row ? toRecord(row) : null;
}
