/**
 * DeliveryNoteRepository — surat jalan (NON-POSTING).
 *
 * Dokumen administratif murni:
 * - TIDAK ADA logic jurnal sama sekali (tidak menyentuh journal_entries).
 * - TANPA status, TANPA field terhitung — tidak ada nilai uang di modul
 *   ini, baris item cuma description + quantity (TANPA unit_price /
 *   line_total), jadi tidak ada perhitungan total apa pun.
 * - salesOrderId/salesInvoiceId nullable; kalau diisi HARUS milik
 *   customerId yang sama (validasi silang, pola LatePaymentFees).
 * - deliveryAddress auto-isi dari alamat Customer saat create KALAU body
 *   tidak mengirim field itu eksplisit.
 * - Delete bebas, tanpa lock (dokumen ini tidak mempengaruhi saldo).
 */
import { and, asc, count, eq, ilike, isNull, or } from "drizzle-orm";
import db from "../db/index.js";
import {
  contacts,
  deliveryNoteLines,
  deliveryNotes,
  salesInvoices,
  salesOrders,
} from "../db/schema.js";
import { getCustomerById } from "./ContactRepository.js";

export class DeliveryNoteValidationError extends Error {}

export interface DeliveryNoteLineInput {
  description: string;
  quantity?: number;
}

export interface DeliveryNoteCreateInput {
  customerId: string;
  deliveryDate: string;
  salesOrderId?: string | null;
  salesInvoiceId?: string | null;
  reference?: string | null;
  deliveryAddress?: string | null;
  description?: string | null;
  lines: DeliveryNoteLineInput[];
}

export interface DeliveryNoteUpdateInput {
  customerId?: string;
  deliveryDate?: string;
  salesOrderId?: string | null;
  salesInvoiceId?: string | null;
  reference?: string | null;
  deliveryAddress?: string | null;
  description?: string | null;
  lines?: DeliveryNoteLineInput[];
}

export interface DeliveryNoteListOptions {
  page: number;
  pageSize: number;
  q?: string;
}

export interface DeliveryNoteLineRecord {
  id: string;
  description: string;
  quantity: number;
  sortOrder: number;
}

export interface DeliveryNoteRecord {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  deliveryDate: string;
  reference: string | null;
  salesOrderId: string | null;
  salesOrderReference: string | null;
  salesInvoiceId: string | null;
  salesInvoiceReference: string | null;
  deliveryAddress: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryNoteDetailRecord extends DeliveryNoteRecord {
  lines: DeliveryNoteLineRecord[];
}

function toRecord(row: {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  deliveryDate: string;
  reference: string | null;
  salesOrderId: string | null;
  salesOrderReference: string | null;
  salesInvoiceId: string | null;
  salesInvoiceReference: string | null;
  deliveryAddress: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DeliveryNoteRecord {
  return { ...row };
}

function toLineRecord(row: {
  id: string;
  description: string;
  quantity: string;
  sortOrder: number;
}): DeliveryNoteLineRecord {
  // Field numeric Postgres datang sebagai STRING dari driver — WAJIB
  // Number() eksplisit sebelum return (pelajaran #2).
  return { ...row, quantity: Number(row.quantity) };
}

// ---------------------------------------------------------------------
// Validasi silang: sales_order_id / sales_invoice_id wajib milik
// customer yang sama (kalau diisi).
// ---------------------------------------------------------------------
export async function validateSalesOrderBelongsToCustomer(
  businessId: string,
  salesOrderId: string,
  customerId: string,
): Promise<void> {
  const [order] = await db
    .select({ customerId: salesOrders.customerId })
    .from(salesOrders)
    .where(
      and(
        eq(salesOrders.businessId, businessId),
        eq(salesOrders.id, salesOrderId),
        isNull(salesOrders.deletedAt),
      ),
    )
    .limit(1);

  if (!order) {
    throw new DeliveryNoteValidationError("Sales Order tidak ditemukan.");
  }
  if (order.customerId !== customerId) {
    throw new DeliveryNoteValidationError(
      "Sales Order yang dipilih bukan milik Customer ini.",
    );
  }
}

export async function validateSalesInvoiceBelongsToCustomer(
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
    throw new DeliveryNoteValidationError("Sales Invoice tidak ditemukan.");
  }
  if (invoice.customerId !== customerId) {
    throw new DeliveryNoteValidationError(
      "Sales Invoice yang dipilih bukan milik Customer ini.",
    );
  }
}

/**
 * Validasi kedua relasi sekaligus — ID null/undefined boleh langsung
 * lewat (opsional). Catatan: customerId yang dipakai adalah nilai
 * efektif (baru kalau dikirim, lama kalau tidak).
 */
export async function validateDeliveryNoteRelations(
  businessId: string,
  customerId: string,
  salesOrderId: string | null | undefined,
  salesInvoiceId: string | null | undefined,
): Promise<void> {
  if (salesOrderId) {
    await validateSalesOrderBelongsToCustomer(businessId, salesOrderId, customerId);
  }
  if (salesInvoiceId) {
    await validateSalesInvoiceBelongsToCustomer(businessId, salesInvoiceId, customerId);
  }
}

// ---------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------
export async function listDeliveryNotes(
  businessId: string,
  opts: DeliveryNoteListOptions,
): Promise<{ data: DeliveryNoteRecord[]; total: number }> {
  const conditions = [
    eq(deliveryNotes.businessId, businessId),
    isNull(deliveryNotes.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(deliveryNotes.reference, pattern),
        ilike(deliveryNotes.description, pattern),
        ilike(contacts.name, pattern),
      )!,
    );
  }

  const where = and(...conditions);
  const baseQuery = db
    .select({
      id: deliveryNotes.id,
      businessId: deliveryNotes.businessId,
      customerId: deliveryNotes.customerId,
      customerName: contacts.name,
      deliveryDate: deliveryNotes.deliveryDate,
      reference: deliveryNotes.reference,
      salesOrderId: deliveryNotes.salesOrderId,
      salesOrderReference: salesOrders.reference,
      salesInvoiceId: deliveryNotes.salesInvoiceId,
      salesInvoiceReference: salesInvoices.reference,
      deliveryAddress: deliveryNotes.deliveryAddress,
      description: deliveryNotes.description,
      createdAt: deliveryNotes.createdAt,
      updatedAt: deliveryNotes.updatedAt,
    })
    .from(deliveryNotes)
    .innerJoin(contacts, eq(deliveryNotes.customerId, contacts.id))
    .leftJoin(salesOrders, eq(deliveryNotes.salesOrderId, salesOrders.id))
    .leftJoin(salesInvoices, eq(deliveryNotes.salesInvoiceId, salesInvoices.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(deliveryNotes.deliveryDate), asc(deliveryNotes.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(deliveryNotes)
      .innerJoin(contacts, eq(deliveryNotes.customerId, contacts.id))
      .where(where),
  ]);

  return { data: rows.map(toRecord), total: totalRow?.total ?? 0 };
}

// ---------------------------------------------------------------------
// GET DETAIL
// ---------------------------------------------------------------------
async function getLines(
  tx: typeof db,
  noteId: string,
): Promise<DeliveryNoteLineRecord[]> {
  const rows = await tx
    .select({
      id: deliveryNoteLines.id,
      description: deliveryNoteLines.description,
      quantity: deliveryNoteLines.quantity,
      sortOrder: deliveryNoteLines.sortOrder,
    })
    .from(deliveryNoteLines)
    .where(eq(deliveryNoteLines.deliveryNoteId, noteId))
    .orderBy(asc(deliveryNoteLines.sortOrder), asc(deliveryNoteLines.id));
  return rows.map(toLineRecord);
}

export async function getDeliveryNoteById(
  businessId: string,
  noteId: string,
): Promise<DeliveryNoteDetailRecord | null> {
  const [header] = await db
    .select({
      id: deliveryNotes.id,
      businessId: deliveryNotes.businessId,
      customerId: deliveryNotes.customerId,
      customerName: contacts.name,
      deliveryDate: deliveryNotes.deliveryDate,
      reference: deliveryNotes.reference,
      salesOrderId: deliveryNotes.salesOrderId,
      salesOrderReference: salesOrders.reference,
      salesInvoiceId: deliveryNotes.salesInvoiceId,
      salesInvoiceReference: salesInvoices.reference,
      deliveryAddress: deliveryNotes.deliveryAddress,
      description: deliveryNotes.description,
      createdAt: deliveryNotes.createdAt,
      updatedAt: deliveryNotes.updatedAt,
    })
    .from(deliveryNotes)
    .innerJoin(contacts, eq(deliveryNotes.customerId, contacts.id))
    .leftJoin(salesOrders, eq(deliveryNotes.salesOrderId, salesOrders.id))
    .leftJoin(salesInvoices, eq(deliveryNotes.salesInvoiceId, salesInvoices.id))
    .where(
      and(
        eq(deliveryNotes.businessId, businessId),
        eq(deliveryNotes.id, noteId),
        isNull(deliveryNotes.deletedAt),
      ),
    )
    .limit(1);

  if (!header) return null;

  const lines = await getLines(db, noteId);
  return { ...toRecord(header), lines };
}

// ---------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------
/**
 * deliveryAddress:
 * - body TIDAK mengirim field ini (undefined) -> auto-isi dari alamat
 *   (delivery) Customer yang dipilih.
 * - body mengirim eksplisit (termasuk string kosong) -> hormati nilai
 *   itu, JANGAN ditimpa alamat Customer.
 */
async function resolveDeliveryAddress(
  businessId: string,
  customerId: string,
  explicit: string | null | undefined,
): Promise<string | null> {
  if (explicit !== undefined) {
    const trimmed = (explicit ?? "").trim();
    return trimmed ? trimmed : null;
  }
  const customer = await getCustomerById(businessId, customerId);
  const fromCustomer = customer?.deliveryAddress?.trim();
  return fromCustomer ? fromCustomer : null;
}

export async function createDeliveryNote(
  businessId: string,
  input: DeliveryNoteCreateInput,
): Promise<DeliveryNoteDetailRecord> {
  const deliveryAddress = await resolveDeliveryAddress(
    businessId,
    input.customerId,
    input.deliveryAddress,
  );

  const noteId = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(deliveryNotes)
      .values({
        businessId,
        deliveryDate: input.deliveryDate,
        customerId: input.customerId,
        salesOrderId: input.salesOrderId ?? null,
        salesInvoiceId: input.salesInvoiceId ?? null,
        reference: input.reference ?? null,
        deliveryAddress,
        description: input.description ?? null,
      })
      .returning({ id: deliveryNotes.id });

    await tx.insert(deliveryNoteLines).values(
      input.lines.map((l, i) => ({
        deliveryNoteId: header.id,
        description: l.description.trim(),
        quantity: (l.quantity ?? 1).toFixed(4),
        sortOrder: i,
      })),
    );
    return header.id;
  });

  const detail = await getDeliveryNoteById(businessId, noteId);
  if (!detail) throw new Error("Gagal mengambil surat jalan setelah create.");
  return detail;
}

// ---------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------
export async function updateDeliveryNote(
  businessId: string,
  noteId: string,
  input: DeliveryNoteUpdateInput,
): Promise<DeliveryNoteDetailRecord | null> {
  const existing = await getDeliveryNoteById(businessId, noteId);
  if (!existing) return null;

  // customerId dan/atau salesOrderId/salesInvoiceId berubah -> validasi
  // ulang silang pakai nilai efektif (baru kalau dikirim, lama kalau
  // tidak). salesOrderId/salesInvoiceId yang dipatenkan null sah.
  if (
    input.customerId !== undefined ||
    input.salesOrderId !== undefined ||
    input.salesInvoiceId !== undefined
  ) {
    const effectiveCustomerId = input.customerId ?? existing.customerId;
    const effectiveOrderId =
      input.salesOrderId !== undefined ? input.salesOrderId : existing.salesOrderId;
    const effectiveInvoiceId =
      input.salesInvoiceId !== undefined
        ? input.salesInvoiceId
        : existing.salesInvoiceId;
    await validateDeliveryNoteRelations(
      businessId,
      effectiveCustomerId,
      effectiveOrderId,
      effectiveInvoiceId,
    );
  }

  await db.transaction(async (tx) => {
    if (input.lines) {
      await tx
        .delete(deliveryNoteLines)
        .where(eq(deliveryNoteLines.deliveryNoteId, noteId));
      await tx.insert(deliveryNoteLines).values(
        input.lines.map((l, i) => ({
          deliveryNoteId: noteId,
          description: l.description.trim(),
          quantity: (l.quantity ?? 1).toFixed(4),
          sortOrder: i,
        })),
      );
    }

    const patch: Partial<typeof deliveryNotes.$inferInsert> & {
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (input.customerId) patch.customerId = input.customerId;
    if (input.deliveryDate) patch.deliveryDate = input.deliveryDate;
    if (input.salesOrderId !== undefined) patch.salesOrderId = input.salesOrderId;
    if (input.salesInvoiceId !== undefined) {
      patch.salesInvoiceId = input.salesInvoiceId;
    }
    if (input.reference !== undefined) patch.reference = input.reference;
    if (input.deliveryAddress !== undefined) {
      patch.deliveryAddress = input.deliveryAddress;
    }
    if (input.description !== undefined) patch.description = input.description;

    await tx
      .update(deliveryNotes)
      .set(patch)
      .where(
        and(
          eq(deliveryNotes.businessId, businessId),
          eq(deliveryNotes.id, noteId),
          isNull(deliveryNotes.deletedAt),
        ),
      );
  });

  return getDeliveryNoteById(businessId, noteId);
}

// ---------------------------------------------------------------------
// DELETE — bebas, tanpa lock (murni catatan administratif)
// ---------------------------------------------------------------------
export async function softDeleteDeliveryNote(
  businessId: string,
  noteId: string,
): Promise<boolean> {
  const [updated] = await db
    .update(deliveryNotes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(deliveryNotes.businessId, businessId),
        eq(deliveryNotes.id, noteId),
        isNull(deliveryNotes.deletedAt),
      ),
    )
    .returning({ id: deliveryNotes.id });
  return updated !== undefined;
}
