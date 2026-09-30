/**
 * PurchaseQuoteRepository — penawaran pembelian (NON-POSTING).
 *
 * BEDA dari Purchase Orders: status DISIMPAN apa adanya dari input
 * (Draft/Accepted/Rejected), tanpa validasi transisi, dan TANPA
 * kaitan dengan invoice turunan — jadi delete bebas tanpa lock.
 *
 * TIDAK ADA logic jurnal sama sekali (murni CRUD header + lines).
 *
 * Field terhitung (real-time, tidak disimpan):
 * - totalAmount = SUM(line_total) baris penawaran (= subtotal, TANPA pajak).
 */
import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import db, { type Database } from "../db/index.js";
import {
  chartOfAccounts,
  contacts,
  purchaseQuoteLines,
  purchaseQuotes,
} from "../db/schema.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

export type PurchaseQuoteStatus = "Draft" | "Accepted" | "Rejected";

export const PURCHASE_QUOTE_STATUSES: readonly PurchaseQuoteStatus[] = [
  "Draft",
  "Accepted",
  "Rejected",
];

export interface PurchaseQuoteLineInput {
  accountId: string;
  description?: string | null;
  quantity?: number;
  unitPrice: number;
}

export interface PurchaseQuoteCreateInput {
  supplierId: string;
  date: string;
  quoteNumber?: string | null;
  description?: string | null;
  status?: PurchaseQuoteStatus;
  lines: PurchaseQuoteLineInput[];
}

export interface PurchaseQuoteUpdateInput {
  supplierId?: string;
  date?: string;
  quoteNumber?: string | null;
  description?: string | null;
  status?: PurchaseQuoteStatus;
  lines?: PurchaseQuoteLineInput[];
}

export interface PurchaseQuoteListOptions {
  page: number;
  pageSize: number;
  q?: string;
  status?: PurchaseQuoteStatus;
}

interface ComputedLine {
  accountId: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface PurchaseQuoteLineRecord {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
}

export interface PurchaseQuoteRecord {
  id: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  date: string;
  quoteNumber: string | null;
  description: string | null;
  status: PurchaseQuoteStatus;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseQuoteDetailRecord extends PurchaseQuoteRecord {
  lines: PurchaseQuoteLineRecord[];
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function computeLines(lines: PurchaseQuoteLineInput[]): {
  computed: ComputedLine[];
  totalCents: number;
} {
  const computed = lines.map((l) => {
    const qty = l.quantity ?? 1;
    const lineCents = Math.round(qty * l.unitPrice * 100);
    return {
      accountId: l.accountId,
      description: l.description?.trim() ? l.description.trim() : null,
      quantity: qty.toFixed(4),
      unitPrice: l.unitPrice.toFixed(2),
      lineTotal: fromCents(lineCents),
    };
  });
  const totalCents = computed.reduce(
    (sum, l) => sum + toCents(Number(l.lineTotal)),
    0,
  );
  return { computed, totalCents };
}

function normalizeStatus(value: string): PurchaseQuoteStatus {
  return (PURCHASE_QUOTE_STATUSES as readonly string[]).includes(value)
    ? (value as PurchaseQuoteStatus)
    : "Draft";
}

function toLineRecord(row: {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  sortOrder: number;
}): PurchaseQuoteLineRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    accountCode: row.accountCode,
    accountName: row.accountName,
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
    supplierId: string;
    supplierName: string;
    date: string;
    quoteNumber: string | null;
    description: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  },
  totalCents: number,
): PurchaseQuoteRecord {
  return {
    ...header,
    status: normalizeStatus(header.status),
    totalAmount: totalCents / 100,
  };
}

// LIST — totalAmount dihitung real-time dari SUM(line_total)
export async function listPurchaseQuotes(
  businessId: string,
  opts: PurchaseQuoteListOptions,
): Promise<{ data: PurchaseQuoteRecord[]; total: number }> {
  const totals = db
    .select({
      quoteId: purchaseQuoteLines.purchaseQuoteId,
      totalAmount: sql<string>`COALESCE(SUM(${purchaseQuoteLines.lineTotal}), 0)`.as(
        "total_amount",
      ),
    })
    .from(purchaseQuoteLines)
    .groupBy(purchaseQuoteLines.purchaseQuoteId)
    .as("t");

  const conditions = [
    eq(purchaseQuotes.businessId, businessId),
    isNull(purchaseQuotes.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(purchaseQuotes.quoteNumber, pattern),
        ilike(purchaseQuotes.description, pattern),
        ilike(contacts.name, pattern),
      )!,
    );
  }

  if (opts.status) {
    conditions.push(eq(purchaseQuotes.status, opts.status));
  }

  const where = and(...conditions);

  const baseQuery = db
    .select({
      id: purchaseQuotes.id,
      businessId: purchaseQuotes.businessId,
      supplierId: purchaseQuotes.supplierId,
      supplierName: contacts.name,
      date: purchaseQuotes.date,
      quoteNumber: purchaseQuotes.quoteNumber,
      description: purchaseQuotes.description,
      status: purchaseQuotes.status,
      totalAmount: totals.totalAmount,
      createdAt: purchaseQuotes.createdAt,
      updatedAt: purchaseQuotes.updatedAt,
    })
    .from(purchaseQuotes)
    .innerJoin(contacts, eq(purchaseQuotes.supplierId, contacts.id))
    .leftJoin(totals, eq(totals.quoteId, purchaseQuotes.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(purchaseQuotes.date), asc(purchaseQuotes.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(purchaseQuotes)
      .innerJoin(contacts, eq(purchaseQuotes.supplierId, contacts.id))
      .leftJoin(totals, eq(totals.quoteId, purchaseQuotes.id))
      .where(where),
  ]);

  return {
    data: rows.map((r) => {
      const { totalAmount, ...header } = r;
      return toRecord(header, Math.round(Number(totalAmount ?? 0) * 100));
    }),
    total: totalRow?.total ?? 0,
  };
}

async function getLinesWithAccounts(
  tx: DbOrTx,
  quoteId: string,
): Promise<PurchaseQuoteLineRecord[]> {
  const rows = await tx
    .select({
      id: purchaseQuoteLines.id,
      accountId: purchaseQuoteLines.accountId,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      description: purchaseQuoteLines.description,
      quantity: purchaseQuoteLines.quantity,
      unitPrice: purchaseQuoteLines.unitPrice,
      lineTotal: purchaseQuoteLines.lineTotal,
      sortOrder: purchaseQuoteLines.sortOrder,
    })
    .from(purchaseQuoteLines)
    .innerJoin(
      chartOfAccounts,
      eq(purchaseQuoteLines.accountId, chartOfAccounts.id),
    )
    .where(eq(purchaseQuoteLines.purchaseQuoteId, quoteId))
    .orderBy(asc(purchaseQuoteLines.sortOrder), asc(purchaseQuoteLines.id));
  return rows.map(toLineRecord);
}

export async function getPurchaseQuoteById(
  businessId: string,
  quoteId: string,
): Promise<PurchaseQuoteDetailRecord | null> {
  const [header] = await db
    .select({
      id: purchaseQuotes.id,
      businessId: purchaseQuotes.businessId,
      supplierId: purchaseQuotes.supplierId,
      supplierName: contacts.name,
      date: purchaseQuotes.date,
      quoteNumber: purchaseQuotes.quoteNumber,
      description: purchaseQuotes.description,
      status: purchaseQuotes.status,
      createdAt: purchaseQuotes.createdAt,
      updatedAt: purchaseQuotes.updatedAt,
    })
    .from(purchaseQuotes)
    .innerJoin(contacts, eq(purchaseQuotes.supplierId, contacts.id))
    .where(
      and(
        eq(purchaseQuotes.businessId, businessId),
        eq(purchaseQuotes.id, quoteId),
        isNull(purchaseQuotes.deletedAt),
      ),
    )
    .limit(1);

  if (!header) return null;

  const lines = await getLinesWithAccounts(db, quoteId);
  const totalCents = lines.reduce((sum, l) => sum + toCents(l.lineTotal), 0);
  return { ...toRecord(header, totalCents), lines };
}

export async function createPurchaseQuote(
  businessId: string,
  input: PurchaseQuoteCreateInput,
): Promise<PurchaseQuoteDetailRecord> {
  const { computed } = computeLines(input.lines);

  const quoteId = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(purchaseQuotes)
      .values({
        businessId,
        supplierId: input.supplierId,
        date: input.date,
        quoteNumber: input.quoteNumber ?? null,
        description: input.description ?? null,
        status: input.status ?? "Draft",
      })
      .returning({ id: purchaseQuotes.id });

    await tx.insert(purchaseQuoteLines).values(
      computed.map((l, i) => ({
        purchaseQuoteId: header.id,
        accountId: l.accountId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        sortOrder: i,
      })),
    );
    return header.id;
  });

  const detail = await getPurchaseQuoteById(businessId, quoteId);
  if (!detail) throw new Error("Gagal mengambil penawaran setelah create.");
  return detail;
}

export async function updatePurchaseQuote(
  businessId: string,
  quoteId: string,
  input: PurchaseQuoteUpdateInput,
): Promise<PurchaseQuoteDetailRecord | null> {
  const existing = await getPurchaseQuoteById(businessId, quoteId);
  if (!existing) return null;

  await db.transaction(async (tx) => {
    if (input.lines) {
      const { computed } = computeLines(input.lines);
      await tx
        .delete(purchaseQuoteLines)
        .where(eq(purchaseQuoteLines.purchaseQuoteId, quoteId));
      await tx.insert(purchaseQuoteLines).values(
        computed.map((l, i) => ({
          purchaseQuoteId: quoteId,
          accountId: l.accountId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          sortOrder: i,
        })),
      );
    }

    const patch: Partial<typeof purchaseQuotes.$inferInsert> & {
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (input.supplierId) patch.supplierId = input.supplierId;
    if (input.date) patch.date = input.date;
    if (input.quoteNumber !== undefined) patch.quoteNumber = input.quoteNumber;
    if (input.description !== undefined) patch.description = input.description;
    if (input.status) patch.status = input.status;

    await tx
      .update(purchaseQuotes)
      .set(patch)
      .where(
        and(
          eq(purchaseQuotes.businessId, businessId),
          eq(purchaseQuotes.id, quoteId),
          isNull(purchaseQuotes.deletedAt),
        ),
      );
  });

  return getPurchaseQuoteById(businessId, quoteId);
}

/** Soft-delete — bebas, tanpa lock (tidak ada dokumen turunan). */
export async function softDeletePurchaseQuote(
  businessId: string,
  quoteId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [header] = await tx
      .select({ id: purchaseQuotes.id })
      .from(purchaseQuotes)
      .where(
        and(
          eq(purchaseQuotes.businessId, businessId),
          eq(purchaseQuotes.id, quoteId),
          isNull(purchaseQuotes.deletedAt),
        ),
      )
      .limit(1);
    if (!header) return false;

    await tx
      .update(purchaseQuotes)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(purchaseQuotes.id, quoteId));
    return true;
  });
}
