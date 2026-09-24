/**
 * PurchaseOrderRepository — pesanan pembelian (NON-POSTING).
 *
 * BEDA dari semua modul transaksi: TIDAK ADA logic jurnal sama sekali.
 * Murni CRUD header + lines dalam transaction data biasa.
 *
 * Field terhitung (real-time, tidak disimpan):
 * - totalOrderAmount = SUM(line_amount) baris PO.
 * - invoicedAmount   = SUM(invoiceAmount) Purchase Invoice AKTIF yang
 *   purchase_order_id-nya PO ini, dengan invoiceAmount dihitung persis
 *   seperti PurchaseInvoiceRepository (SUM subtotal baris invoice).
 * - status: Draft/Open | Partially Invoiced | Fully Invoiced/Closed.
 */
import { and, asc, count, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import db, { type Database } from "../db/index.js";
import {
  chartOfAccounts,
  contacts,
  purchaseInvoiceLines,
  purchaseInvoices,
  purchaseOrderLines,
  purchaseOrders,
} from "../db/schema.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

export type PurchaseOrderStatus =
  | "Draft/Open"
  | "Partially Invoiced"
  | "Fully Invoiced/Closed";

export interface PurchaseOrderLineInput {
  accountId: string;
  description?: string | null;
  quantity?: number;
  unitPrice: number;
}

export interface PurchaseOrderCreateInput {
  supplierId: string;
  reference?: string | null;
  date: string;
  billingAddress?: string | null;
  description?: string | null;
  lines: PurchaseOrderLineInput[];
}

export interface PurchaseOrderUpdateInput {
  supplierId?: string;
  reference?: string | null;
  date?: string;
  billingAddress?: string | null;
  description?: string | null;
  lines?: PurchaseOrderLineInput[];
}

export interface PurchaseOrderListOptions {
  page: number;
  pageSize: number;
  q?: string;
  status?: PurchaseOrderStatus;
  dateFrom?: string;
  dateTo?: string;
}

interface ComputedLine {
  accountId: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  lineAmount: string;
}

export interface PurchaseOrderLineRecord {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
  sortOrder: number;
}

export interface PurchaseOrderRecord {
  id: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  reference: string | null;
  date: string;
  billingAddress: string | null;
  description: string | null;
  totalOrderAmount: number;
  invoicedAmount: number;
  status: PurchaseOrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseOrderDetailRecord extends PurchaseOrderRecord {
  lines: PurchaseOrderLineRecord[];
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function computeLines(lines: PurchaseOrderLineInput[]): {
  computed: ComputedLine[];
  totalCents: number;
} {
  const computed = lines.map((l) => {
    const qty = l.quantity ?? 1;
    const amountCents = Math.round(qty * l.unitPrice * 100);
    return {
      accountId: l.accountId,
      description: l.description?.trim() ? l.description.trim() : null,
      quantity: qty.toFixed(4),
      unitPrice: l.unitPrice.toFixed(2),
      lineAmount: fromCents(amountCents),
    };
  });
  const totalCents = computed.reduce(
    (sum, l) => sum + toCents(Number(l.lineAmount)),
    0,
  );
  return { computed, totalCents };
}

export function computeOrderStatus(
  totalCents: number,
  invoicedCents: number,
): PurchaseOrderStatus {
  if (invoicedCents <= 0) return "Draft/Open";
  if (invoicedCents < totalCents) return "Partially Invoiced";
  return "Fully Invoiced/Closed";
}

/**
 * invoicedAmount (SEN) = SUM invoiceAmount semua Purchase Invoice AKTIF
 * yang purchase_order_id-nya PO ini. invoiceAmount per invoice dihitung
 * dengan cara yang SAMA seperti PurchaseInvoiceRepository
 * (SUM subtotal purchase_invoice_lines).
 */
async function getInvoicedAmountCents(
  tx: DbOrTx,
  businessId: string,
  purchaseOrderId: string,
): Promise<number> {
  const [row] = await tx
    .select({
      total: sql<string>`COALESCE(SUM(${purchaseInvoiceLines.subtotal}), 0)`,
    })
    .from(purchaseInvoiceLines)
    .innerJoin(
      purchaseInvoices,
      eq(purchaseInvoiceLines.purchaseInvoiceId, purchaseInvoices.id),
    )
    .where(
      and(
        eq(purchaseInvoices.businessId, businessId),
        eq(purchaseInvoices.purchaseOrderId, purchaseOrderId),
        isNull(purchaseInvoices.deletedAt),
      ),
    );
  return Math.round(Number(row?.total ?? 0) * 100);
}

/** True kalau PO ini dirujuk minimal 1 Purchase Invoice AKTIF. */
export async function hasActiveInvoices(
  businessId: string,
  purchaseOrderId: string,
  tx: DbOrTx = db,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: purchaseInvoices.id })
    .from(purchaseInvoices)
    .where(
      and(
        eq(purchaseInvoices.businessId, businessId),
        eq(purchaseInvoices.purchaseOrderId, purchaseOrderId),
        isNull(purchaseInvoices.deletedAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

function toLineRecord(row: {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  lineAmount: string;
  sortOrder: number;
}): PurchaseOrderLineRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    accountCode: row.accountCode,
    accountName: row.accountName,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
    lineAmount: Number(row.lineAmount),
    sortOrder: row.sortOrder,
  };
}

function toRecord(
  header: {
    id: string;
    businessId: string;
    supplierId: string;
    supplierName: string;
    reference: string | null;
    date: string;
    billingAddress: string | null;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  totalCents: number,
  invoicedCents: number,
): PurchaseOrderRecord {
  return {
    ...header,
    totalOrderAmount: totalCents / 100,
    invoicedAmount: invoicedCents / 100,
    status: computeOrderStatus(totalCents, invoicedCents),
  };
}

export async function listPurchaseOrders(
  businessId: string,
  opts: PurchaseOrderListOptions,
): Promise<{ data: PurchaseOrderRecord[]; total: number }> {
  const totals = db
    .select({
      orderId: purchaseOrderLines.purchaseOrderId,
      totalAmount: sql<string>`COALESCE(SUM(${purchaseOrderLines.lineAmount}), 0)`.as(
        "total_amount",
      ),
    })
    .from(purchaseOrderLines)
    .groupBy(purchaseOrderLines.purchaseOrderId)
    .as("t");

  const invoicedTotals = db
    .select({
      orderId: purchaseInvoices.purchaseOrderId,
      invoicedAmount:
        sql<string>`COALESCE(SUM(${purchaseInvoiceLines.subtotal}), 0)`.as(
          "invoiced_amount",
        ),
    })
    .from(purchaseInvoiceLines)
    .innerJoin(
      purchaseInvoices,
      eq(purchaseInvoiceLines.purchaseInvoiceId, purchaseInvoices.id),
    )
    .where(
      and(
        eq(purchaseInvoices.businessId, businessId),
        isNull(purchaseInvoices.deletedAt),
      ),
    )
    .groupBy(purchaseInvoices.purchaseOrderId)
    .as("it");

  const conditions = [
    eq(purchaseOrders.businessId, businessId),
    isNull(purchaseOrders.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(purchaseOrders.reference, pattern),
        ilike(purchaseOrders.description, pattern),
        ilike(contacts.name, pattern),
      )!,
    );
  }

  if (opts.dateFrom) {
    conditions.push(gte(purchaseOrders.date, opts.dateFrom));
  }
  if (opts.dateTo) {
    conditions.push(lte(purchaseOrders.date, opts.dateTo));
  }

  if (opts.status === "Draft/Open") {
    conditions.push(sql`COALESCE(${invoicedTotals.invoicedAmount}, 0) <= 0`);
  } else if (opts.status === "Partially Invoiced") {
    conditions.push(
      sql`COALESCE(${invoicedTotals.invoicedAmount}, 0) > 0 AND COALESCE(${invoicedTotals.invoicedAmount}, 0) < COALESCE(${totals.totalAmount}, 0)`,
    );
  } else if (opts.status === "Fully Invoiced/Closed") {
    conditions.push(
      sql`COALESCE(${invoicedTotals.invoicedAmount}, 0) > 0 AND COALESCE(${invoicedTotals.invoicedAmount}, 0) >= COALESCE(${totals.totalAmount}, 0)`,
    );
  }

  const where = and(...conditions);
  const baseQuery = db
    .select({
      id: purchaseOrders.id,
      businessId: purchaseOrders.businessId,
      supplierId: purchaseOrders.supplierId,
      supplierName: contacts.name,
      reference: purchaseOrders.reference,
      date: purchaseOrders.date,
      billingAddress: purchaseOrders.billingAddress,
      description: purchaseOrders.description,
      totalAmount: totals.totalAmount,
      invoicedAmount: invoicedTotals.invoicedAmount,
      createdAt: purchaseOrders.createdAt,
      updatedAt: purchaseOrders.updatedAt,
    })
    .from(purchaseOrders)
    .innerJoin(contacts, eq(purchaseOrders.supplierId, contacts.id))
    .leftJoin(totals, eq(totals.orderId, purchaseOrders.id))
    .leftJoin(invoicedTotals, eq(invoicedTotals.orderId, purchaseOrders.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(purchaseOrders.date), asc(purchaseOrders.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(purchaseOrders)
      .innerJoin(contacts, eq(purchaseOrders.supplierId, contacts.id))
      .leftJoin(totals, eq(totals.orderId, purchaseOrders.id))
      .leftJoin(invoicedTotals, eq(invoicedTotals.orderId, purchaseOrders.id))
      .where(where),
  ]);

  return {
    data: rows.map((r) => {
      const totalCents = Math.round(Number(r.totalAmount ?? 0) * 100);
      const invoicedCents = Math.round(Number(r.invoicedAmount ?? 0) * 100);
      return toRecord(
        {
          id: r.id,
          businessId: r.businessId,
          supplierId: r.supplierId,
          supplierName: r.supplierName,
          reference: r.reference,
          date: r.date,
          billingAddress: r.billingAddress,
          description: r.description,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        },
        totalCents,
        invoicedCents,
      );
    }),
    total: totalRow?.total ?? 0,
  };
}

async function getLinesWithAccounts(
  tx: DbOrTx,
  orderId: string,
): Promise<PurchaseOrderLineRecord[]> {
  const rows = await tx
    .select({
      id: purchaseOrderLines.id,
      accountId: purchaseOrderLines.accountId,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      description: purchaseOrderLines.description,
      quantity: purchaseOrderLines.quantity,
      unitPrice: purchaseOrderLines.unitPrice,
      lineAmount: purchaseOrderLines.lineAmount,
      sortOrder: purchaseOrderLines.sortOrder,
    })
    .from(purchaseOrderLines)
    .innerJoin(chartOfAccounts, eq(purchaseOrderLines.accountId, chartOfAccounts.id))
    .where(eq(purchaseOrderLines.purchaseOrderId, orderId))
    .orderBy(asc(purchaseOrderLines.sortOrder), asc(purchaseOrderLines.id));
  return rows.map(toLineRecord);
}

export async function getPurchaseOrderById(
  businessId: string,
  orderId: string,
): Promise<PurchaseOrderDetailRecord | null> {
  const [header] = await db
    .select({
      id: purchaseOrders.id,
      businessId: purchaseOrders.businessId,
      supplierId: purchaseOrders.supplierId,
      supplierName: contacts.name,
      reference: purchaseOrders.reference,
      date: purchaseOrders.date,
      billingAddress: purchaseOrders.billingAddress,
      description: purchaseOrders.description,
      createdAt: purchaseOrders.createdAt,
      updatedAt: purchaseOrders.updatedAt,
    })
    .from(purchaseOrders)
    .innerJoin(contacts, eq(purchaseOrders.supplierId, contacts.id))
    .where(
      and(
        eq(purchaseOrders.businessId, businessId),
        eq(purchaseOrders.id, orderId),
        isNull(purchaseOrders.deletedAt),
      ),
    )
    .limit(1);

  if (!header) return null;
  const lines = await getLinesWithAccounts(db, orderId);
  const totalCents = lines.reduce((sum, l) => sum + toCents(l.lineAmount), 0);
  const invoicedCents = await getInvoicedAmountCents(db, businessId, orderId);
  return { ...toRecord(header, totalCents, invoicedCents), lines };
}

export async function createPurchaseOrder(
  businessId: string,
  input: PurchaseOrderCreateInput,
): Promise<PurchaseOrderDetailRecord> {
  const { computed } = computeLines(input.lines);

  const orderId = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(purchaseOrders)
      .values({
        businessId,
        supplierId: input.supplierId,
        reference: input.reference ?? null,
        date: input.date,
        billingAddress: input.billingAddress ?? null,
        description: input.description ?? null,
      })
      .returning({ id: purchaseOrders.id });

    await tx.insert(purchaseOrderLines).values(
      computed.map((l, i) => ({
        purchaseOrderId: header.id,
        accountId: l.accountId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineAmount: l.lineAmount,
        sortOrder: i,
      })),
    );
    return header.id;
  });

  const detail = await getPurchaseOrderById(businessId, orderId);
  if (!detail) throw new Error("Gagal mengambil PO setelah create.");
  return detail;
}

export async function updatePurchaseOrder(
  businessId: string,
  orderId: string,
  input: PurchaseOrderUpdateInput,
): Promise<PurchaseOrderDetailRecord | null> {
  const existing = await getPurchaseOrderById(businessId, orderId);
  if (!existing) return null;

  await db.transaction(async (tx) => {
    if (input.lines) {
      const { computed } = computeLines(input.lines);
      await tx
        .delete(purchaseOrderLines)
        .where(eq(purchaseOrderLines.purchaseOrderId, orderId));
      await tx.insert(purchaseOrderLines).values(
        computed.map((l, i) => ({
          purchaseOrderId: orderId,
          accountId: l.accountId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineAmount: l.lineAmount,
          sortOrder: i,
        })),
      );
    }

    const patch: Partial<typeof purchaseOrders.$inferInsert> & {
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (input.supplierId) patch.supplierId = input.supplierId;
    if (input.reference !== undefined) patch.reference = input.reference;
    if (input.date) patch.date = input.date;
    if (input.billingAddress !== undefined) patch.billingAddress = input.billingAddress;
    if (input.description !== undefined) patch.description = input.description;

    await tx
      .update(purchaseOrders)
      .set(patch)
      .where(
        and(
          eq(purchaseOrders.businessId, businessId),
          eq(purchaseOrders.id, orderId),
          isNull(purchaseOrders.deletedAt),
        ),
      );
  });

  return getPurchaseOrderById(businessId, orderId);
}

export async function softDeletePurchaseOrder(
  businessId: string,
  orderId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [header] = await tx
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.businessId, businessId),
          eq(purchaseOrders.id, orderId),
          isNull(purchaseOrders.deletedAt),
        ),
      )
      .limit(1);
    if (!header) return false;

    if (await hasActiveInvoices(businessId, orderId, tx)) {
      throw new Error(
        "PO ini sudah memiliki Purchase Invoice terkait dan tidak bisa dihapus.",
      );
    }

    await tx
      .update(purchaseOrders)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(purchaseOrders.id, orderId));
    return true;
  });
}
