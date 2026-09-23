import { and, asc, count, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import db, { type Database } from "../db/index.js";
import {
  chartOfAccounts,
  contacts,
  journalEntries,
  journalEntryLines,
  paymentLines,
  payments,
  purchaseInvoiceLines,
  purchaseInvoices,
} from "../db/schema.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

export const PURCHASE_INVOICE_SOURCE_MODULE = "purchase_invoice";

export type ComputedInvoiceStatus = "Unpaid" | "Overdue" | "Paid";

export interface PurchaseInvoiceLineInput {
  accountId: string;
  description?: string | null;
  quantity?: number;
  unitPrice: number;
}

export interface PurchaseInvoiceCreateInput {
  supplierId: string;
  reference?: string;
  issueDate: string;
  dueDate?: string;
  description?: string | null;
  quoteNumber?: string | null;
  orderNumber?: string | null;
  lines: PurchaseInvoiceLineInput[];
}

export interface PurchaseInvoiceUpdateInput {
  supplierId?: string;
  reference?: string | null;
  issueDate?: string;
  dueDate?: string | null;
  description?: string | null;
  quoteNumber?: string | null;
  orderNumber?: string | null;
  lines?: PurchaseInvoiceLineInput[];
}

export interface PurchaseInvoiceListOptions {
  page: number;
  pageSize: number;
  q?: string;
  status?: ComputedInvoiceStatus;
}

interface ComputedLine {
  accountId: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  subtotal: string;
}

export interface PurchaseInvoiceLineRecord {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  sortOrder: number;
}

export interface PurchaseInvoiceRecord {
  id: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  reference: string | null;
  issueDate: string;
  dueDate: string | null;
  description: string | null;
  quoteNumber: string | null;
  orderNumber: string | null;
  invoiceAmount: number;
  balanceDue: number;
  status: ComputedInvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseInvoiceDetailRecord extends PurchaseInvoiceRecord {
  lines: PurchaseInvoiceLineRecord[];
}

function computeLines(lines: PurchaseInvoiceLineInput[]): {
  computed: ComputedLine[];
  invoiceAmount: number;
} {
  const computed = lines.map((l) => {
    const qty = l.quantity ?? 1;
    const subtotalCents = Math.round(qty * l.unitPrice * 100);
    return {
      accountId: l.accountId,
      description: l.description?.trim() ? l.description.trim() : null,
      quantity: qty.toFixed(4),
      unitPrice: l.unitPrice.toFixed(2),
      subtotal: (subtotalCents / 100).toFixed(2),
    };
  });

  const invoiceAmount =
    computed.reduce((sum, l) => sum + Math.round(Number(l.subtotal) * 100), 0) / 100;
  return { computed, invoiceAmount };
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function computeInvoiceStatus(
  invoiceAmount: number,
  dueDate: string | null,
): ComputedInvoiceStatus {
  if (invoiceAmount <= 0) return "Paid";
  if (dueDate && dueDate < todayString()) return "Overdue";
  return "Unpaid";
}

export interface ControlAccountRef {
  id: string;
  code: string;
  name: string;
}

export async function findApControlAccount(
  businessId: string,
  tx: DbOrTx = db,
): Promise<ControlAccountRef | null> {
  const rows = await tx
    .select({
      id: chartOfAccounts.id,
      code: chartOfAccounts.code,
      name: chartOfAccounts.name,
    })
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.businessId, businessId),
        eq(chartOfAccounts.category, "Liability"),
        eq(chartOfAccounts.isControlAccount, true),
        isNull(chartOfAccounts.deletedAt),
      ),
    )
    .orderBy(asc(chartOfAccounts.code));
  return rows.length === 1 ? rows[0] : null;
}

interface PostJournalInput {
  invoiceId: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  reference: string | null;
  issueDate: string;
  description: string | null;
  lines: ComputedLine[];
  invoiceAmount: number;
}

async function postPurchaseJournal(
  tx: DbOrTx,
  input: PostJournalInput,
): Promise<string> {
  const apAccount = await findApControlAccount(input.businessId, tx);
  if (!apAccount) {
    throw new Error(
      "Akun kontrol Utang Usaha (Liability + kontrol) tidak ditemukan di bisnis ini.",
    );
  }

  // Kredit total ke Accounts Payable
  // Debit per baris ke akun Expense
  const totalCents = Math.round(input.invoiceAmount * 100);
  const refLabel = input.reference ?? input.invoiceId.slice(0, 8);

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      businessId: input.businessId,
      entryDate: input.issueDate,
      reference: input.reference,
      sourceModule: PURCHASE_INVOICE_SOURCE_MODULE,
      sourceId: input.invoiceId,
      description: input.description ?? `Purchase Invoice ${refLabel}`,
    })
    .returning({ id: journalEntries.id });

  const lines: (typeof journalEntryLines.$inferInsert)[] = [
    {
      journalEntryId: entry.id,
      accountId: apAccount.id,
      contactId: input.supplierId,
      debit: "0.00",
      credit: (totalCents / 100).toFixed(2),
      description: `Utang ke ${input.supplierName} (${refLabel})`,
    },
  ];

  for (const l of input.lines) {
    lines.push({
      journalEntryId: entry.id,
      accountId: l.accountId,
      debit: l.subtotal,
      credit: "0.00",
      description: l.description ?? `Pembelian ${refLabel}`,
    });
  }

  await tx.insert(journalEntryLines).values(lines);
  return entry.id;
}

async function findActiveJournalIds(
  tx: DbOrTx,
  invoiceId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.sourceModule, PURCHASE_INVOICE_SOURCE_MODULE),
        eq(journalEntries.sourceId, invoiceId),
        isNull(journalEntries.deletedAt),
      ),
    );
  return rows.map((r) => r.id);
}

async function softDeleteJournals(tx: DbOrTx, invoiceId: string): Promise<void> {
  const ids = await findActiveJournalIds(tx, invoiceId);
  for (const id of ids) {
    await tx
      .update(journalEntries)
      .set({ deletedAt: new Date() })
      .where(eq(journalEntries.id, id));
  }
}

function toLineRecord(row: {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  subtotal: string;
  sortOrder: number;
}): PurchaseInvoiceLineRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    accountCode: row.accountCode,
    accountName: row.accountName,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
    subtotal: Number(row.subtotal),
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
    issueDate: string;
    dueDate: string | null;
    description: string | null;
    quoteNumber: string | null;
    orderNumber: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  invoiceAmount: number,
  paidAmount: number,
): PurchaseInvoiceRecord {
  const balanceDue = Math.round((invoiceAmount - paidAmount) * 100) / 100;
  return {
    ...header,
    invoiceAmount,
    balanceDue,
    status: computeInvoiceStatus(balanceDue, header.dueDate),
  };
}

/**
 * Total yang sudah dialokasikan Payment ke satu Purchase Invoice (baris
 * payment_lines yang purchase_invoice_id-nya invoice ini, payment
 * header-nya belum di-soft-delete). Dipakai buat balanceDue live.
 */
async function getPaidAmount(
  tx: DbOrTx,
  invoiceId: string,
  excludePaymentId?: string,
): Promise<number> {
  const conditions = [
    eq(paymentLines.purchaseInvoiceId, invoiceId),
    isNull(payments.deletedAt),
  ];
  if (excludePaymentId) {
    conditions.push(ne(payments.id, excludePaymentId));
  }
  const [row] = await tx
    .select({
      paidAmount: sql<string>`COALESCE(SUM(${paymentLines.amount}), 0)`,
    })
    .from(paymentLines)
    .innerJoin(payments, eq(paymentLines.paymentId, payments.id))
    .where(and(...conditions));
  return Number(row?.paidAmount ?? 0);
}

/**
 * Info yang dibutuhkan PaymentRepository buat memvalidasi alokasi baris
 * Payment ke Purchase Invoice: pemilik (supplierId) dan balanceDue SAAT INI
 * (opsional exclude satu payment tertentu — dipakai saat update payment itu
 * sendiri, supaya alokasi lama payment ini tidak dihitung dobel).
 */
export async function getPurchaseInvoiceAllocationInfo(
  businessId: string,
  invoiceId: string,
  opts: { tx?: DbOrTx; excludePaymentId?: string } = {},
): Promise<{ supplierId: string; balanceDue: number } | null> {
  const tx = opts.tx ?? db;
  const [header] = await tx
    .select({
      supplierId: purchaseInvoices.supplierId,
    })
    .from(purchaseInvoices)
    .where(
      and(
        eq(purchaseInvoices.businessId, businessId),
        eq(purchaseInvoices.id, invoiceId),
        isNull(purchaseInvoices.deletedAt),
      ),
    )
    .limit(1);
  if (!header) return null;

  const [amountRow] = await tx
    .select({
      invoiceAmount: sql<string>`COALESCE(SUM(${purchaseInvoiceLines.subtotal}), 0)`,
    })
    .from(purchaseInvoiceLines)
    .where(eq(purchaseInvoiceLines.purchaseInvoiceId, invoiceId));
  const invoiceAmount = Number(amountRow?.invoiceAmount ?? 0);
  const paidAmount = await getPaidAmount(tx, invoiceId, opts.excludePaymentId);

  return {
    supplierId: header.supplierId,
    balanceDue: Math.round((invoiceAmount - paidAmount) * 100) / 100,
  };
}

export async function listPurchaseInvoices(
  businessId: string,
  opts: PurchaseInvoiceListOptions,
): Promise<{ data: PurchaseInvoiceRecord[]; total: number }> {
  const totals = db
    .select({
      invoiceId: purchaseInvoiceLines.purchaseInvoiceId,
      invoiceAmount:
        sql<string>`COALESCE(SUM(${purchaseInvoiceLines.subtotal}), 0)`.as(
          "invoice_amount",
        ),
    })
    .from(purchaseInvoiceLines)
    .groupBy(purchaseInvoiceLines.purchaseInvoiceId)
    .as("t");

  const paidTotals = db
    .select({
      invoiceId: paymentLines.purchaseInvoiceId,
      paidAmount: sql<string>`COALESCE(SUM(${paymentLines.amount}), 0)`.as(
        "paid_amount",
      ),
    })
    .from(paymentLines)
    .innerJoin(payments, eq(paymentLines.paymentId, payments.id))
    .where(isNull(payments.deletedAt))
    .groupBy(paymentLines.purchaseInvoiceId)
    .as("pt");

  const balanceDueExpr = sql`(${totals.invoiceAmount} - COALESCE(${paidTotals.paidAmount}, 0))`;

  const conditions = [
    eq(purchaseInvoices.businessId, businessId),
    isNull(purchaseInvoices.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(purchaseInvoices.reference, pattern),
        ilike(purchaseInvoices.description, pattern),
        ilike(contacts.name, pattern),
      )!,
    );
  }

  if (opts.status === "Paid") {
    conditions.push(sql`${balanceDueExpr} <= 0`);
  } else if (opts.status === "Overdue") {
    conditions.push(
      sql`${balanceDueExpr} > 0 AND "purchase_invoices"."due_date" IS NOT NULL AND "purchase_invoices"."due_date" < ${todayString()}`,
    );
  } else if (opts.status === "Unpaid") {
    conditions.push(
      sql`${balanceDueExpr} > 0 AND ("purchase_invoices"."due_date" IS NULL OR "purchase_invoices"."due_date" >= ${todayString()})`,
    );
  }

  const where = and(...conditions);
  const baseQuery = db
    .select({
      id: purchaseInvoices.id,
      businessId: purchaseInvoices.businessId,
      supplierId: purchaseInvoices.supplierId,
      supplierName: contacts.name,
      reference: purchaseInvoices.reference,
      issueDate: purchaseInvoices.issueDate,
      dueDate: purchaseInvoices.dueDate,
      description: purchaseInvoices.description,
      quoteNumber: purchaseInvoices.quoteNumber,
      orderNumber: purchaseInvoices.orderNumber,
      invoiceAmount: totals.invoiceAmount,
      paidAmount: paidTotals.paidAmount,
      createdAt: purchaseInvoices.createdAt,
      updatedAt: purchaseInvoices.updatedAt,
    })
    .from(purchaseInvoices)
    .innerJoin(contacts, eq(purchaseInvoices.supplierId, contacts.id))
    .leftJoin(totals, eq(totals.invoiceId, purchaseInvoices.id))
    .leftJoin(paidTotals, eq(paidTotals.invoiceId, purchaseInvoices.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(purchaseInvoices.issueDate), asc(purchaseInvoices.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(purchaseInvoices)
      .innerJoin(contacts, eq(purchaseInvoices.supplierId, contacts.id))
      .leftJoin(totals, eq(totals.invoiceId, purchaseInvoices.id))
      .leftJoin(paidTotals, eq(paidTotals.invoiceId, purchaseInvoices.id))
      .where(where),
  ]);

  return {
    data: rows.map((r) => {
      const { invoiceAmount, paidAmount, ...header } = r;
      return toRecord(header, Number(invoiceAmount ?? 0), Number(paidAmount ?? 0));
    }),
    total: totalRow?.total ?? 0,
  };
}

async function getLinesWithAccounts(
  tx: DbOrTx,
  invoiceId: string,
): Promise<PurchaseInvoiceLineRecord[]> {
  const rows = await tx
    .select({
      id: purchaseInvoiceLines.id,
      accountId: purchaseInvoiceLines.accountId,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      description: purchaseInvoiceLines.description,
      quantity: purchaseInvoiceLines.quantity,
      unitPrice: purchaseInvoiceLines.unitPrice,
      subtotal: purchaseInvoiceLines.subtotal,
      sortOrder: purchaseInvoiceLines.sortOrder,
    })
    .from(purchaseInvoiceLines)
    .innerJoin(
      chartOfAccounts,
      eq(purchaseInvoiceLines.accountId, chartOfAccounts.id),
    )
    .where(eq(purchaseInvoiceLines.purchaseInvoiceId, invoiceId))
    .orderBy(asc(purchaseInvoiceLines.sortOrder), asc(purchaseInvoiceLines.id));
  return rows.map(toLineRecord);
}

export async function getPurchaseInvoiceById(
  businessId: string,
  invoiceId: string,
): Promise<PurchaseInvoiceDetailRecord | null> {
  const [header] = await db
    .select({
      id: purchaseInvoices.id,
      businessId: purchaseInvoices.businessId,
      supplierId: purchaseInvoices.supplierId,
      supplierName: contacts.name,
      reference: purchaseInvoices.reference,
      issueDate: purchaseInvoices.issueDate,
      dueDate: purchaseInvoices.dueDate,
      description: purchaseInvoices.description,
      quoteNumber: purchaseInvoices.quoteNumber,
      orderNumber: purchaseInvoices.orderNumber,
      createdAt: purchaseInvoices.createdAt,
      updatedAt: purchaseInvoices.updatedAt,
    })
    .from(purchaseInvoices)
    .innerJoin(contacts, eq(purchaseInvoices.supplierId, contacts.id))
    .where(
      and(
        eq(purchaseInvoices.businessId, businessId),
        eq(purchaseInvoices.id, invoiceId),
        isNull(purchaseInvoices.deletedAt),
      ),
    )
    .limit(1);

  if (!header) return null;
  const lines = await getLinesWithAccounts(db, invoiceId);
  const invoiceAmount = lines.reduce((sum, l) => sum + l.subtotal, 0);
  const paidAmount = await getPaidAmount(db, invoiceId);
  return { ...toRecord(header, invoiceAmount, paidAmount), lines };
}

export async function createPurchaseInvoice(
  businessId: string,
  input: PurchaseInvoiceCreateInput & { supplierName: string },
): Promise<PurchaseInvoiceDetailRecord> {
  const { computed, invoiceAmount } = computeLines(input.lines);
  const invoiceId = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(purchaseInvoices)
      .values({
        businessId,
        supplierId: input.supplierId,
        reference: input.reference,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        description: input.description,
        quoteNumber: input.quoteNumber,
        orderNumber: input.orderNumber,
      })
      .returning({ id: purchaseInvoices.id });

    await tx.insert(purchaseInvoiceLines).values(
      computed.map((l, i) => ({
        purchaseInvoiceId: header.id,
        accountId: l.accountId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        subtotal: l.subtotal,
        sortOrder: i,
      })),
    );

    await postPurchaseJournal(tx, {
      invoiceId: header.id,
      businessId,
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      reference: input.reference ?? null,
      issueDate: input.issueDate,
      description: input.description ?? null,
      lines: computed,
      invoiceAmount,
    });
    return header.id;
  });

  const detail = await getPurchaseInvoiceById(businessId, invoiceId);
  if (!detail) throw new Error("Gagal mengambil faktur setelah create.");
  return detail;
}

export async function updatePurchaseInvoice(
  businessId: string,
  invoiceId: string,
  input: PurchaseInvoiceUpdateInput & { supplierName: string },
): Promise<PurchaseInvoiceDetailRecord | null> {
  const existing = await getPurchaseInvoiceById(businessId, invoiceId);
  if (!existing) return null;

  const supplierIdChanged =
    input.supplierId !== undefined && input.supplierId !== existing.supplierId;
  const linesChanged = input.lines !== undefined;
  const needsJournalRepost = supplierIdChanged || linesChanged;

  await db.transaction(async (tx) => {
    let linesToUse = existing.lines;

    if (linesChanged) {
      const { computed } = computeLines(input.lines!);
      await tx
        .delete(purchaseInvoiceLines)
        .where(eq(purchaseInvoiceLines.purchaseInvoiceId, invoiceId));
      await tx.insert(purchaseInvoiceLines).values(
        computed.map((l, i) => ({
          purchaseInvoiceId: invoiceId,
          accountId: l.accountId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          subtotal: l.subtotal,
          sortOrder: i,
        })),
      );
      linesToUse = computed.map((l, i) => ({
        id: "",
        accountId: l.accountId,
        accountCode: "",
        accountName: "",
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        subtotal: Number(l.subtotal),
        sortOrder: i,
      }));
    }

    if (needsJournalRepost) {
      await softDeleteJournals(tx, invoiceId);
      const journalAmount = linesToUse.reduce(
        (s, l) => s + Number(l.subtotal),
        0,
      );
      const computedLinesForJournal = linesToUse.map((l) => ({
        accountId: l.accountId,
        description: l.description,
        quantity: String(l.quantity),
        unitPrice: String(l.unitPrice),
        subtotal: String(l.subtotal),
      }));

      await postPurchaseJournal(tx, {
        invoiceId,
        businessId,
        supplierId: input.supplierId ?? existing.supplierId,
        supplierName:
          input.supplierId && input.supplierId !== existing.supplierId
            ? input.supplierName
            : existing.supplierName,
        reference:
          input.reference !== undefined
            ? input.reference
            : existing.reference,
        issueDate: input.issueDate ?? existing.issueDate,
        description:
          input.description !== undefined
            ? input.description
            : existing.description,
        lines: computedLinesForJournal,
        invoiceAmount: journalAmount,
      });
    }

    const patch: any = { updatedAt: new Date() };
    if (input.supplierId) patch.supplierId = input.supplierId;
    if (input.reference !== undefined) patch.reference = input.reference;
    if (input.issueDate) patch.issueDate = input.issueDate;
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
    if (input.description !== undefined) patch.description = input.description;
    if (input.quoteNumber !== undefined) patch.quoteNumber = input.quoteNumber;
    if (input.orderNumber !== undefined) patch.orderNumber = input.orderNumber;

    await tx
      .update(purchaseInvoices)
      .set(patch)
      .where(
        and(
          eq(purchaseInvoices.businessId, businessId),
          eq(purchaseInvoices.id, invoiceId),
          isNull(purchaseInvoices.deletedAt),
        ),
      );
  });

  return getPurchaseInvoiceById(businessId, invoiceId);
}

export async function softDeletePurchaseInvoice(
  businessId: string,
  invoiceId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [header] = await tx
      .select({ id: purchaseInvoices.id })
      .from(purchaseInvoices)
      .where(
        and(
          eq(purchaseInvoices.businessId, businessId),
          eq(purchaseInvoices.id, invoiceId),
          isNull(purchaseInvoices.deletedAt),
        ),
      )
      .limit(1);
    if (!header) return false;

    await softDeleteJournals(tx, invoiceId);
    await tx
      .update(purchaseInvoices)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(purchaseInvoices.id, invoiceId));
    return true;
  });
}
