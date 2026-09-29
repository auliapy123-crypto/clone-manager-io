/**
 * SalesOrderRepository — pesanan penjualan (NON-POSTING).
 *
 * Mirip SalesQuoteRepository TAPI lebih sederhana:
 * - TANPA validForDays / expiryDate.
 * - TANPA billingAddress (dan TANPA auto-fill dari Customer).
 * - TIDAK ADA logic jurnal sama sekali (murni CRUD header + lines).
 * - TANPA kolom status — sales order langsung final begitu tersimpan.
 * - Baris item TANPA account_id: cukup description + quantity + unitPrice.
 * - TANPA relasi ke dokumen lain, jadi delete bebas tanpa lock.
 *
 * Field terhitung (real-time, TIDAK disimpan sebagai kolom):
 * - totalAmount = SUM(line_total) baris pesanan.
 */
import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import db, { type Database } from "../db/index.js";
import { contacts, salesOrderLines, salesOrders } from "../db/schema.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

export interface SalesOrderLineInput {
  description: string;
  quantity?: number;
  unitPrice: number;
}

export interface SalesOrderCreateInput {
  customerId: string;
  issueDate: string;
  reference?: string | null;
  description?: string | null;
  lines: SalesOrderLineInput[];
}

export interface SalesOrderUpdateInput {
  customerId?: string;
  issueDate?: string;
  reference?: string | null;
  description?: string | null;
  lines?: SalesOrderLineInput[];
}

export interface SalesOrderListOptions {
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

export interface SalesOrderLineRecord {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
}

export interface SalesOrderRecord {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  issueDate: string;
  reference: string | null;
  description: string | null;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesOrderDetailRecord extends SalesOrderRecord {
  lines: SalesOrderLineRecord[];
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function computeLines(lines: SalesOrderLineInput[]): {
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
}): SalesOrderLineRecord {
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
    reference: string | null;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  totalCents: number,
): SalesOrderRecord {
  return {
    ...header,
    totalAmount: totalCents / 100,
  };
}

// ---------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------
export async function listSalesOrders(
  businessId: string,
  opts: SalesOrderListOptions,
): Promise<{ data: SalesOrderRecord[]; total: number }> {
  const totals = db
    .select({
      orderId: salesOrderLines.salesOrderId,
      totalAmount: sql<string>`COALESCE(SUM(${salesOrderLines.lineTotal}), 0)`.as(
        "total_amount",
      ),
    })
    .from(salesOrderLines)
    .groupBy(salesOrderLines.salesOrderId)
    .as("t");

  const conditions = [
    eq(salesOrders.businessId, businessId),
    isNull(salesOrders.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(salesOrders.reference, pattern),
        ilike(salesOrders.description, pattern),
        ilike(contacts.name, pattern),
      )!,
    );
  }

  const where = and(...conditions);
  const baseQuery = db
    .select({
      id: salesOrders.id,
      businessId: salesOrders.businessId,
      customerId: salesOrders.customerId,
      customerName: contacts.name,
      issueDate: salesOrders.issueDate,
      reference: salesOrders.reference,
      description: salesOrders.description,
      totalAmount: totals.totalAmount,
      createdAt: salesOrders.createdAt,
      updatedAt: salesOrders.updatedAt,
    })
    .from(salesOrders)
    .innerJoin(contacts, eq(salesOrders.customerId, contacts.id))
    .leftJoin(totals, eq(totals.orderId, salesOrders.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(salesOrders.issueDate), asc(salesOrders.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(salesOrders)
      .innerJoin(contacts, eq(salesOrders.customerId, contacts.id))
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
          reference: r.reference,
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
  orderId: string,
): Promise<SalesOrderLineRecord[]> {
  const rows = await tx
    .select({
      id: salesOrderLines.id,
      description: salesOrderLines.description,
      quantity: salesOrderLines.quantity,
      unitPrice: salesOrderLines.unitPrice,
      lineTotal: salesOrderLines.lineTotal,
      sortOrder: salesOrderLines.sortOrder,
    })
    .from(salesOrderLines)
    .where(eq(salesOrderLines.salesOrderId, orderId))
    .orderBy(asc(salesOrderLines.sortOrder), asc(salesOrderLines.id));
  return rows.map(toLineRecord);
}

export async function getSalesOrderById(
  businessId: string,
  orderId: string,
): Promise<SalesOrderDetailRecord | null> {
  const [header] = await db
    .select({
      id: salesOrders.id,
      businessId: salesOrders.businessId,
      customerId: salesOrders.customerId,
      customerName: contacts.name,
      issueDate: salesOrders.issueDate,
      reference: salesOrders.reference,
      description: salesOrders.description,
      createdAt: salesOrders.createdAt,
      updatedAt: salesOrders.updatedAt,
    })
    .from(salesOrders)
    .innerJoin(contacts, eq(salesOrders.customerId, contacts.id))
    .where(
      and(
        eq(salesOrders.businessId, businessId),
        eq(salesOrders.id, orderId),
        isNull(salesOrders.deletedAt),
      ),
    )
    .limit(1);

  if (!header) return null;

  const lines = await getLines(db, orderId);
  const totalCents = lines.reduce((sum, l) => sum + toCents(l.lineTotal), 0);
  return { ...toRecord(header, totalCents), lines };
}

// ---------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------
export async function createSalesOrder(
  businessId: string,
  input: SalesOrderCreateInput,
): Promise<SalesOrderDetailRecord> {
  const { computed } = computeLines(input.lines);

  const orderId = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(salesOrders)
      .values({
        businessId,
        customerId: input.customerId,
        issueDate: input.issueDate,
        reference: input.reference ?? null,
        description: input.description ?? null,
      })
      .returning({ id: salesOrders.id });

    await tx.insert(salesOrderLines).values(
      computed.map((l, i) => ({
        salesOrderId: header.id,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        sortOrder: i,
      })),
    );
    return header.id;
  });

  const detail = await getSalesOrderById(businessId, orderId);
  if (!detail) throw new Error("Gagal mengambil pesanan setelah create.");
  return detail;
}

// ---------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------
export async function updateSalesOrder(
  businessId: string,
  orderId: string,
  input: SalesOrderUpdateInput,
): Promise<SalesOrderDetailRecord | null> {
  const existing = await getSalesOrderById(businessId, orderId);
  if (!existing) return null;

  await db.transaction(async (tx) => {
    if (input.lines) {
      const { computed } = computeLines(input.lines);
      await tx
        .delete(salesOrderLines)
        .where(eq(salesOrderLines.salesOrderId, orderId));
      await tx.insert(salesOrderLines).values(
        computed.map((l, i) => ({
          salesOrderId: orderId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          sortOrder: i,
        })),
      );
    }

    const patch: Partial<typeof salesOrders.$inferInsert> & {
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (input.customerId) patch.customerId = input.customerId;
    if (input.issueDate) patch.issueDate = input.issueDate;
    if (input.reference !== undefined) patch.reference = input.reference;
    if (input.description !== undefined) patch.description = input.description;

    await tx
      .update(salesOrders)
      .set(patch)
      .where(
        and(
          eq(salesOrders.businessId, businessId),
          eq(salesOrders.id, orderId),
          isNull(salesOrders.deletedAt),
        ),
      );
  });

  return getSalesOrderById(businessId, orderId);
}

// ---------------------------------------------------------------------
// DELETE — bebas, tanpa lock (dokumen ini tidak terikat ke dokumen lain)
// ---------------------------------------------------------------------
export async function softDeleteSalesOrder(
  businessId: string,
  orderId: string,
): Promise<boolean> {
  const [updated] = await db
    .update(salesOrders)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(salesOrders.businessId, businessId),
        eq(salesOrders.id, orderId),
        isNull(salesOrders.deletedAt),
      ),
    )
    .returning({ id: salesOrders.id });
  return updated !== undefined;
}
