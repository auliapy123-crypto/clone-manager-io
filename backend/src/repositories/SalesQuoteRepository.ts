/**
 * SalesQuoteRepository — penawaran harga (NON-POSTING).
 *
 * BEDA dari modul transaksi & dari PurchaseOrders:
 * - TIDAK ADA logic jurnal sama sekali (murni CRUD header + lines).
 * - TANPA kolom status — sales quote langsung final begitu tersimpan.
 * - Baris item TANPA account_id (tahap penawaran belum menyentuh
 *   akuntansi): cukup description + quantity + unitPrice.
 * - TANPA relasi ke dokumen lain, jadi delete bebas tanpa lock.
 *
 * Field terhitung (real-time, TIDAK disimpan sebagai kolom):
 * - totalAmount = SUM(line_total) baris penawaran.
 * - expiryDate   = issue_date + valid_for_days hari
 *                  (null kalau valid_for_days kosong).
 */
import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import db, { type Database } from "../db/index.js";
import { contacts, salesQuoteLines, salesQuotes } from "../db/schema.js";
import { getCustomerById } from "./ContactRepository.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

export interface SalesQuoteLineInput {
  description: string;
  quantity?: number;
  unitPrice: number;
}

export interface SalesQuoteCreateInput {
  customerId: string;
  issueDate: string;
  validForDays?: number | null;
  reference?: string | null;
  billingAddress?: string | null;
  description?: string | null;
  lines: SalesQuoteLineInput[];
}

export interface SalesQuoteUpdateInput {
  customerId?: string;
  issueDate?: string;
  validForDays?: number | null;
  reference?: string | null;
  billingAddress?: string | null;
  description?: string | null;
  lines?: SalesQuoteLineInput[];
}

export interface SalesQuoteListOptions {
  page: number;
  pageSize: number;
  q?: string;
}

interface ComputedLine {
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface SalesQuoteLineRecord {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
}

export interface SalesQuoteRecord {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  issueDate: string;
  validForDays: number | null;
  reference: string | null;
  billingAddress: string | null;
  description: string | null;
  totalAmount: number;
  expiryDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesQuoteDetailRecord extends SalesQuoteRecord {
  lines: SalesQuoteLineRecord[];
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Tambah hari ke string tanggal YYYY-MM-DD (UTC, aman dari drift timezone). */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * expiryDate — field terhitung, TIDAK pernah disimpan.
 * null kalau validForDays tidak diisi.
 */
export function computeExpiryDate(
  issueDate: string,
  validForDays: number | null | undefined,
): string | null {
  if (validForDays == null) return null;
  return addDays(issueDate, validForDays);
}

function computeLines(lines: SalesQuoteLineInput[]): {
  computed: ComputedLine[];
  totalCents: number;
} {
  const computed = lines.map((l) => {
    const qty = l.quantity ?? 1;
    const amountCents = Math.round(qty * l.unitPrice * 100);
    return {
      description: l.description.trim(),
      quantity: qty.toFixed(4),
      unitPrice: l.unitPrice.toFixed(2),
      lineTotal: fromCents(amountCents),
    };
  });
  const totalCents = computed.reduce(
    (sum, l) => sum + toCents(Number(l.lineTotal)),
    0,
  );
  return { computed, totalCents };
}

function toLineRecord(row: {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  sortOrder: number;
}): SalesQuoteLineRecord {
  return {
    id: row.id,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
    lineTotal: Number(row.lineTotal),
    sortOrder: row.sortOrder,
  };
}

function toRecord(
  header: {
    id: string;
    businessId: string;
    customerId: string;
    customerName: string;
    issueDate: string;
    validForDays: number | null;
    reference: string | null;
    billingAddress: string | null;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  totalCents: number,
): SalesQuoteRecord {
  return {
    ...header,
    validForDays: header.validForDays == null ? null : Number(header.validForDays),
    totalAmount: totalCents / 100,
    expiryDate: computeExpiryDate(header.issueDate, header.validForDays),
  };
}

// ---------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------
export async function listSalesQuotes(
  businessId: string,
  opts: SalesQuoteListOptions,
): Promise<{ data: SalesQuoteRecord[]; total: number }> {
  const totals = db
    .select({
      quoteId: salesQuoteLines.salesQuoteId,
      totalAmount: sql<string>`COALESCE(SUM(${salesQuoteLines.lineTotal}), 0)`.as(
        "total_amount",
      ),
    })
    .from(salesQuoteLines)
    .groupBy(salesQuoteLines.salesQuoteId)
    .as("t");

  const conditions = [
    eq(salesQuotes.businessId, businessId),
    isNull(salesQuotes.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(salesQuotes.reference, pattern),
        ilike(salesQuotes.description, pattern),
        ilike(contacts.name, pattern),
      )!,
    );
  }

  const where = and(...conditions);
  const baseQuery = db
    .select({
      id: salesQuotes.id,
      businessId: salesQuotes.businessId,
      customerId: salesQuotes.customerId,
      customerName: contacts.name,
      issueDate: salesQuotes.issueDate,
      validForDays: salesQuotes.validForDays,
      reference: salesQuotes.reference,
      billingAddress: salesQuotes.billingAddress,
      description: salesQuotes.description,
      totalAmount: totals.totalAmount,
      createdAt: salesQuotes.createdAt,
      updatedAt: salesQuotes.updatedAt,
    })
    .from(salesQuotes)
    .innerJoin(contacts, eq(salesQuotes.customerId, contacts.id))
    .leftJoin(totals, eq(totals.quoteId, salesQuotes.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(salesQuotes.issueDate), asc(salesQuotes.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(salesQuotes)
      .innerJoin(contacts, eq(salesQuotes.customerId, contacts.id))
      .where(where),
  ]);

  return {
    data: rows.map((r) =>
      toRecord(
        {
          id: r.id,
          businessId: r.businessId,
          customerId: r.customerId,
          customerName: r.customerName,
          issueDate: r.issueDate,
          validForDays: r.validForDays,
          reference: r.reference,
          billingAddress: r.billingAddress,
          description: r.description,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        },
        Math.round(Number(r.totalAmount ?? 0) * 100),
      ),
    ),
    total: totalRow?.total ?? 0,
  };
}

// ---------------------------------------------------------------------
// GET DETAIL
// ---------------------------------------------------------------------
async function getLines(
  tx: DbOrTx,
  quoteId: string,
): Promise<SalesQuoteLineRecord[]> {
  const rows = await tx
    .select({
      id: salesQuoteLines.id,
      description: salesQuoteLines.description,
      quantity: salesQuoteLines.quantity,
      unitPrice: salesQuoteLines.unitPrice,
      lineTotal: salesQuoteLines.lineTotal,
      sortOrder: salesQuoteLines.sortOrder,
    })
    .from(salesQuoteLines)
    .where(eq(salesQuoteLines.salesQuoteId, quoteId))
    .orderBy(asc(salesQuoteLines.sortOrder), asc(salesQuoteLines.id));
  return rows.map(toLineRecord);
}

export async function getSalesQuoteById(
  businessId: string,
  quoteId: string,
): Promise<SalesQuoteDetailRecord | null> {
  const [header] = await db
    .select({
      id: salesQuotes.id,
      businessId: salesQuotes.businessId,
      customerId: salesQuotes.customerId,
      customerName: contacts.name,
      issueDate: salesQuotes.issueDate,
      validForDays: salesQuotes.validForDays,
      reference: salesQuotes.reference,
      billingAddress: salesQuotes.billingAddress,
      description: salesQuotes.description,
      createdAt: salesQuotes.createdAt,
      updatedAt: salesQuotes.updatedAt,
    })
    .from(salesQuotes)
    .innerJoin(contacts, eq(salesQuotes.customerId, contacts.id))
    .where(
      and(
        eq(salesQuotes.businessId, businessId),
        eq(salesQuotes.id, quoteId),
        isNull(salesQuotes.deletedAt),
      ),
    )
    .limit(1);

  if (!header) return null;

  const lines = await getLines(db, quoteId);
  const totalCents = lines.reduce((sum, l) => sum + toCents(l.lineTotal), 0);
  return { ...toRecord(header, totalCents), lines };
}

// ---------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------
/**
 * billingAddress:
 * - body TIDAK mengirim field ini (undefined) -> auto-isi dari alamat
 *   Customer yang dipilih.
 * - body mengirim eksplisit (termasuk string kosong) -> hormati nilai
 *   itu, JANGAN ditimpa alamat Customer.
 */
async function resolveBillingAddress(
  businessId: string,
  customerId: string,
  explicit: string | null | undefined,
): Promise<string | null> {
  if (explicit !== undefined) {
    const trimmed = (explicit ?? "").trim();
    return trimmed ? trimmed : null;
  }
  const customer = await getCustomerById(businessId, customerId);
  const fromCustomer = customer?.billingAddress?.trim();
  return fromCustomer ? fromCustomer : null;
}

export async function createSalesQuote(
  businessId: string,
  input: SalesQuoteCreateInput,
): Promise<SalesQuoteDetailRecord> {
  const { computed } = computeLines(input.lines);
  const billingAddress = await resolveBillingAddress(
    businessId,
    input.customerId,
    input.billingAddress,
  );

  const quoteId = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(salesQuotes)
      .values({
        businessId,
        customerId: input.customerId,
        issueDate: input.issueDate,
        validForDays: input.validForDays ?? null,
        reference: input.reference ?? null,
        billingAddress,
        description: input.description ?? null,
      })
      .returning({ id: salesQuotes.id });

    await tx.insert(salesQuoteLines).values(
      computed.map((l, i) => ({
        salesQuoteId: header.id,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        sortOrder: i,
      })),
    );
    return header.id;
  });

  const detail = await getSalesQuoteById(businessId, quoteId);
  if (!detail) throw new Error("Gagal mengambil penawaran setelah create.");
  return detail;
}

// ---------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------
export async function updateSalesQuote(
  businessId: string,
  quoteId: string,
  input: SalesQuoteUpdateInput,
): Promise<SalesQuoteDetailRecord | null> {
  const existing = await getSalesQuoteById(businessId, quoteId);
  if (!existing) return null;

  await db.transaction(async (tx) => {
    if (input.lines) {
      const { computed } = computeLines(input.lines);
      await tx
        .delete(salesQuoteLines)
        .where(eq(salesQuoteLines.salesQuoteId, quoteId));
      await tx.insert(salesQuoteLines).values(
        computed.map((l, i) => ({
          salesQuoteId: quoteId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          sortOrder: i,
        })),
      );
    }

    const patch: Partial<typeof salesQuotes.$inferInsert> & {
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (input.customerId) patch.customerId = input.customerId;
    if (input.issueDate) patch.issueDate = input.issueDate;
    if (input.validForDays !== undefined) patch.validForDays = input.validForDays;
    if (input.reference !== undefined) patch.reference = input.reference;
    if (input.billingAddress !== undefined) {
      patch.billingAddress = input.billingAddress;
    }
    if (input.description !== undefined) patch.description = input.description;

    await tx
      .update(salesQuotes)
      .set(patch)
      .where(
        and(
          eq(salesQuotes.businessId, businessId),
          eq(salesQuotes.id, quoteId),
          isNull(salesQuotes.deletedAt),
        ),
      );
  });

  return getSalesQuoteById(businessId, quoteId);
}

// ---------------------------------------------------------------------
// DELETE — bebas, tanpa lock (dokumen ini tidak terikat ke dokumen lain)
// ---------------------------------------------------------------------
export async function softDeleteSalesQuote(
  businessId: string,
  quoteId: string,
): Promise<boolean> {
  const [updated] = await db
    .update(salesQuotes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(salesQuotes.businessId, businessId),
        eq(salesQuotes.id, quoteId),
        isNull(salesQuotes.deletedAt),
      ),
    )
    .returning({ id: salesQuotes.id });
  return updated !== undefined;
}
