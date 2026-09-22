/**
 * SalesInvoiceRepository — Faktur penjualan (revisi dokumen §3-§4).
 *
 * Beda dari modul master-data: TIDAK ADA status draft/issued/void yang
 * disimpan. Setiap create LANGSUNG posting jurnal (debit AR, kredit
 * Income per akun, kredit Tax Payable kalau ada pajak), update menyusun
 * ulang jurnal (soft-delete lama + buat baru), delete me-soft-delete
 * faktur + jurnalnya — semua dalam SATU database transaction.
 *
 * Status (Paid/Unpaid/Overdue) dan balanceDue DIHITUNG real-time saat
 * GET. balanceDue SELALU = invoiceAmount sampai modul Receipts/Credit
 * Notes ada (belum ada yang mengurangi).
 */
import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import db, { type Database } from "../db/index.js";
import {
  chartOfAccounts,
  contacts,
  journalEntries,
  journalEntryLines,
  salesInvoiceLines,
  salesInvoices,
} from "../db/schema.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

/** Penanda modul di journal_entries.source_module untuk faktur ini. */
export const SALES_INVOICE_SOURCE_MODULE = "sales_invoice";

export type ComputedInvoiceStatus = "Unpaid" | "Overdue" | "Paid";

export interface SalesInvoiceLineInput {
  accountId: string;
  description?: string | null;
  quantity?: number;
  unitPrice: number;
  taxRatePercent?: number;
}

export interface SalesInvoiceCreateInput {
  customerId: string;
  reference?: string;
  issueDate: string;
  dueDate?: string;
  billingAddress?: string | null;
  description?: string | null;
  lines: SalesInvoiceLineInput[];
}

export interface SalesInvoiceUpdateInput {
  customerId?: string;
  reference?: string | null;
  issueDate?: string;
  dueDate?: string | null;
  billingAddress?: string | null;
  description?: string | null;
  lines?: SalesInvoiceLineInput[];
}

export interface SalesInvoiceListOptions {
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
  taxRatePercent: string;
  taxAmount: string;
  lineTotal: string;
}

export interface SalesInvoiceLineRecord {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  taxRatePercent: number;
  taxAmount: number;
  lineTotal: number;
  sortOrder: number;
}

export interface SalesInvoiceRecord {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  reference: string | null;
  issueDate: string;
  dueDate: string | null;
  billingAddress: string | null;
  description: string | null;
  invoiceAmount: number;
  balanceDue: number;
  status: ComputedInvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesInvoiceDetailRecord extends SalesInvoiceRecord {
  lines: SalesInvoiceLineRecord[];
}

// ---------------------------------------------------------------------
// Helper uang: hitung dalam sen (integer) supaya tidak ada drift float.
// ---------------------------------------------------------------------
function computeLines(lines: SalesInvoiceLineInput[]): {
  computed: ComputedLine[];
  invoiceAmount: number;
} {
  const computed = lines.map((l) => {
    const qty = l.quantity ?? 1;
    const subtotalCents = Math.round(qty * l.unitPrice * 100);
    const rate = l.taxRatePercent ?? 0;
    const taxCents = Math.round((subtotalCents * rate) / 100);
    const totalCents = subtotalCents + taxCents;
    return {
      accountId: l.accountId,
      description: l.description?.trim() ? l.description.trim() : null,
      quantity: qty.toFixed(4),
      unitPrice: l.unitPrice.toFixed(2),
      subtotal: (subtotalCents / 100).toFixed(2),
      taxRatePercent: rate.toFixed(2),
      taxAmount: (taxCents / 100).toFixed(2),
      lineTotal: (totalCents / 100).toFixed(2),
    };
  });

  const invoiceAmount =
    computed.reduce((sum, l) => sum + Math.round(Number(l.lineTotal) * 100), 0) /
    100;
  return { computed, invoiceAmount };
}

/** Tanggal hari ini (UTC) sebagai YYYY-MM-DD — konsisten dengan CURRENT_DATE Neon. */
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

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Resolusi akun kontrol
// ---------------------------------------------------------------------
export interface ControlAccountRef {
  id: string;
  code: string;
  name: string;
}

/**
 * Akun kontrol Accounts Receivable = SATU-SATUNYA akun bisnis ini yang
 * kategori Asset + is_control_account. Persis satu; kalau nol/lebih dari
 * satu, lempar error yang jelas (data COA harus dibenahi dulu).
 */
export async function findArControlAccount(
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
        eq(chartOfAccounts.category, "Asset"),
        eq(chartOfAccounts.isControlAccount, true),
        isNull(chartOfAccounts.deletedAt),
      ),
    )
    .orderBy(asc(chartOfAccounts.code));
  return rows.length === 1 ? rows[0] : null;
}

/**
 * Akun Tax Payable = akun Liability berkode 2200 ("Utang Pajak" di seed
 * standar). Hanya dicari kalau faktur memang ada pajaknya.
 */
export async function findTaxPayableAccount(
  businessId: string,
  tx: DbOrTx = db,
): Promise<ControlAccountRef | null> {
  const [row] = await tx
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
        eq(chartOfAccounts.code, "2200"),
        isNull(chartOfAccounts.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------
// Jurnal
// ---------------------------------------------------------------------
interface PostJournalInput {
  invoiceId: string;
  businessId: string;
  customerId: string;
  customerName: string;
  reference: string | null;
  issueDate: string;
  description: string | null;
  lines: ComputedLine[];
  invoiceAmount: number;
}

/**
 * Membuat journal_entries + journal_entry_lines yang BALANCE
 * (total debit == total kredit, dicek dalam sen sebelum insert).
 * Mengembalikan id entri jurnal yang dibuat.
 */
async function postSalesJournal(
  tx: DbOrTx,
  input: PostJournalInput,
): Promise<string> {
  const arAccount = await findArControlAccount(input.businessId, tx);
  if (!arAccount) {
    throw new Error(
      "Akun kontrol Piutang Usaha (Asset + kontrol) tidak ditemukan atau tidak tunggal di bisnis ini.",
    );
  }

  const totalTaxCents = input.lines.reduce(
    (sum, l) => sum + Math.round(Number(l.taxAmount) * 100),
    0,
  );

  let taxAccount: ControlAccountRef | null = null;
  if (totalTaxCents > 0) {
    taxAccount = await findTaxPayableAccount(input.businessId, tx);
    if (!taxAccount) {
      throw new Error(
        "Faktur ada pajaknya tapi akun Utang Pajak (2200) tidak ditemukan di bisnis ini.",
      );
    }
  }

  // Agregasi kredit per akun Income (jumlahkan subtotal per account_id).
  const creditByAccount = new Map<string, number>();
  for (const l of input.lines) {
    const cents = Math.round(Number(l.subtotal) * 100);
    creditByAccount.set(l.accountId, (creditByAccount.get(l.accountId) ?? 0) + cents);
  }

  const debitCents = Math.round(input.invoiceAmount * 100);
  const creditCents =
    [...creditByAccount.values()].reduce((a, b) => a + b, 0) + totalTaxCents;
  if (debitCents !== creditCents) {
    throw new Error(
      `Jurnal tidak balance (debit ${debitCents} != kredit ${creditCents}).`,
    );
  }

  const refLabel = input.reference ?? input.invoiceId.slice(0, 8);
  const [entry] = await tx
    .insert(journalEntries)
    .values({
      businessId: input.businessId,
      entryDate: input.issueDate,
      reference: input.reference,
      sourceModule: SALES_INVOICE_SOURCE_MODULE,
      sourceId: input.invoiceId,
      description: input.description ?? `Sales Invoice ${refLabel}`,
    })
    .returning({ id: journalEntries.id });

  const lines: (typeof journalEntryLines.$inferInsert)[] = [
    {
      journalEntryId: entry.id,
      accountId: arAccount.id,
      contactId: input.customerId,
      debit: (debitCents / 100).toFixed(2),
      credit: "0.00",
      description: `Piutang ${input.customerName} (${refLabel})`,
    },
  ];
  for (const [accountId, cents] of creditByAccount) {
    lines.push({
      journalEntryId: entry.id,
      accountId,
      debit: "0.00",
      credit: (cents / 100).toFixed(2),
      description: `Penjualan ${refLabel}`,
    });
  }
  if (taxAccount && totalTaxCents > 0) {
    lines.push({
      journalEntryId: entry.id,
      accountId: taxAccount.id,
      debit: "0.00",
      credit: (totalTaxCents / 100).toFixed(2),
      description: `Pajak penjualan ${refLabel}`,
    });
  }

  await tx.insert(journalEntryLines).values(lines);
  return entry.id;
}

/** Id semua entri jurnal aktif milik faktur ini. */
async function findActiveJournalIds(
  tx: DbOrTx,
  invoiceId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.sourceModule, SALES_INVOICE_SOURCE_MODULE),
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

// ---------------------------------------------------------------------
// Proyeksi record
// ---------------------------------------------------------------------
function toLineRecord(row: {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  subtotal: string;
  taxRatePercent: string;
  taxAmount: string;
  lineTotal: string;
  sortOrder: number;
}): SalesInvoiceLineRecord {
  // Postgres numeric datang sebagai STRING — konversi eksplisit ke Number
  // supaya lolos serialisasi respons Zod (pola BankAccount/ChartOfAccount).
  return {
    id: row.id,
    accountId: row.accountId,
    accountCode: row.accountCode,
    accountName: row.accountName,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
    subtotal: Number(row.subtotal),
    taxRatePercent: Number(row.taxRatePercent),
    taxAmount: Number(row.taxAmount),
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
    reference: string | null;
    issueDate: string;
    dueDate: string | null;
    billingAddress: string | null;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  invoiceAmount: number,
): SalesInvoiceRecord {
  const balanceDue = invoiceAmount; // Belum ada Receipts/Credit Notes.
  return {
    ...header,
    invoiceAmount,
    balanceDue,
    status: computeInvoiceStatus(balanceDue, header.dueDate),
  };
}

// ---------------------------------------------------------------------
// LIST + GET
// ---------------------------------------------------------------------
export async function listSalesInvoices(
  businessId: string,
  opts: SalesInvoiceListOptions,
): Promise<{ data: SalesInvoiceRecord[]; total: number }> {
  const totals = db
    .select({
      invoiceId: salesInvoiceLines.salesInvoiceId,
      invoiceAmount:
        sql<string>`COALESCE(SUM(${salesInvoiceLines.lineTotal}), 0)`.as(
          "invoice_amount",
        ),
    })
    .from(salesInvoiceLines)
    .groupBy(salesInvoiceLines.salesInvoiceId)
    .as("t");

  const conditions = [
    eq(salesInvoices.businessId, businessId),
    isNull(salesInvoices.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(salesInvoices.reference, pattern),
        ilike(salesInvoices.description, pattern),
        ilike(contacts.name, pattern),
      )!,
    );
  }

  if (opts.status === "Paid") {
    conditions.push(sql`${totals.invoiceAmount} <= 0`);
  } else if (opts.status === "Overdue") {
    conditions.push(
      sql`${totals.invoiceAmount} > 0 AND "sales_invoices"."due_date" IS NOT NULL AND "sales_invoices"."due_date" < ${todayString()}`,
    );
  } else if (opts.status === "Unpaid") {
    conditions.push(
      sql`${totals.invoiceAmount} > 0 AND ("sales_invoices"."due_date" IS NULL OR "sales_invoices"."due_date" >= ${todayString()})`,
    );
  }

  const where = and(...conditions);

  const baseQuery = db
    .select({
      id: salesInvoices.id,
      businessId: salesInvoices.businessId,
      customerId: salesInvoices.customerId,
      customerName: contacts.name,
      reference: salesInvoices.reference,
      issueDate: salesInvoices.issueDate,
      dueDate: salesInvoices.dueDate,
      billingAddress: salesInvoices.billingAddress,
      description: salesInvoices.description,
      invoiceAmount: totals.invoiceAmount,
      createdAt: salesInvoices.createdAt,
      updatedAt: salesInvoices.updatedAt,
    })
    .from(salesInvoices)
    .innerJoin(contacts, eq(salesInvoices.customerId, contacts.id))
    .leftJoin(totals, eq(totals.invoiceId, salesInvoices.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(salesInvoices.issueDate), asc(salesInvoices.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(salesInvoices)
      .innerJoin(contacts, eq(salesInvoices.customerId, contacts.id))
      .leftJoin(totals, eq(totals.invoiceId, salesInvoices.id))
      .where(where),
  ]);

  return {
    data: rows.map((r) => {
      const { invoiceAmount, ...header } = r;
      return toRecord(header, Number(invoiceAmount ?? 0));
    }),
    total: totalRow?.total ?? 0,
  };
}

async function getLinesWithAccounts(
  tx: DbOrTx,
  invoiceId: string,
): Promise<SalesInvoiceLineRecord[]> {
  const rows = await tx
    .select({
      id: salesInvoiceLines.id,
      accountId: salesInvoiceLines.accountId,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      description: salesInvoiceLines.description,
      quantity: salesInvoiceLines.quantity,
      unitPrice: salesInvoiceLines.unitPrice,
      subtotal: salesInvoiceLines.subtotal,
      taxRatePercent: salesInvoiceLines.taxRatePercent,
      taxAmount: salesInvoiceLines.taxAmount,
      lineTotal: salesInvoiceLines.lineTotal,
      sortOrder: salesInvoiceLines.sortOrder,
    })
    .from(salesInvoiceLines)
    .innerJoin(
      chartOfAccounts,
      eq(salesInvoiceLines.accountId, chartOfAccounts.id),
    )
    .where(eq(salesInvoiceLines.salesInvoiceId, invoiceId))
    .orderBy(asc(salesInvoiceLines.sortOrder), asc(salesInvoiceLines.id));
  return rows.map(toLineRecord);
}

export async function getSalesInvoiceById(
  businessId: string,
  invoiceId: string,
): Promise<SalesInvoiceDetailRecord | null> {
  const [header] = await db
    .select({
      id: salesInvoices.id,
      businessId: salesInvoices.businessId,
      customerId: salesInvoices.customerId,
      customerName: contacts.name,
      reference: salesInvoices.reference,
      issueDate: salesInvoices.issueDate,
      dueDate: salesInvoices.dueDate,
      billingAddress: salesInvoices.billingAddress,
      description: salesInvoices.description,
      createdAt: salesInvoices.createdAt,
      updatedAt: salesInvoices.updatedAt,
    })
    .from(salesInvoices)
    .innerJoin(contacts, eq(salesInvoices.customerId, contacts.id))
    .where(
      and(
        eq(salesInvoices.businessId, businessId),
        eq(salesInvoices.id, invoiceId),
        isNull(salesInvoices.deletedAt),
      ),
    )
    .limit(1);

  if (!header) return null;

  const lines = await getLinesWithAccounts(db, invoiceId);
  const invoiceAmount = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  return { ...toRecord(header, invoiceAmount), lines };
}

// ---------------------------------------------------------------------
// CREATE — header + lines + jurnal dalam 1 transaction
// ---------------------------------------------------------------------
export async function createSalesInvoice(
  businessId: string,
  input: SalesInvoiceCreateInput & {
    customerName: string;
    dueDateResolved: string | null;
    billingAddressResolved: string | null;
  },
): Promise<SalesInvoiceDetailRecord> {
  const { computed, invoiceAmount } = computeLines(input.lines);

  const invoiceId = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(salesInvoices)
      .values({
        businessId,
        customerId: input.customerId,
        reference: input.reference,
        issueDate: input.issueDate,
        dueDate: input.dueDateResolved,
        billingAddress: input.billingAddressResolved,
        description: input.description ?? null,
      })
      .returning({ id: salesInvoices.id });

    await tx.insert(salesInvoiceLines).values(
      computed.map((l, i) => ({
        salesInvoiceId: header.id,
        accountId: l.accountId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        subtotal: l.subtotal,
        taxRatePercent: l.taxRatePercent,
        taxAmount: l.taxAmount,
        lineTotal: l.lineTotal,
        sortOrder: i,
      })),
    );

    await postSalesJournal(tx, {
      invoiceId: header.id,
      businessId,
      customerId: input.customerId,
      customerName: input.customerName,
      reference: input.reference ?? null,
      issueDate: input.issueDate,
      description: input.description ?? null,
      lines: computed,
      invoiceAmount,
    });

    return header.id;
  });

  const detail = await getSalesInvoiceById(businessId, invoiceId);
  if (!detail) throw new Error("Gagal mengambil faktur setelah create.");
  return detail;
}

/** Hitung dueDate/billingAddress default dari data customer. */
export function resolveInvoiceDefaults(
  issueDate: string,
  explicitDueDate: string | null | undefined,
  explicitBillingAddress: string | null | undefined,
  customer: { salesInvoiceDueDateDays: number | null; billingAddress: string | null },
): { dueDate: string | null; billingAddress: string | null } {
  // undefined = tidak dikirim -> ikut syarat customer; null/string = eksplisit.
  const dueDate =
    explicitDueDate === undefined
      ? customer.salesInvoiceDueDateDays != null
        ? addDays(issueDate, customer.salesInvoiceDueDateDays)
        : null
      : explicitDueDate;
  const billingAddress = explicitBillingAddress ?? customer.billingAddress ?? null;
  return { dueDate, billingAddress };
}

// ---------------------------------------------------------------------
// UPDATE — ganti data + susun ulang jurnal dalam 1 transaction
// ---------------------------------------------------------------------
export async function updateSalesInvoice(
  businessId: string,
  invoiceId: string,
  input: SalesInvoiceUpdateInput & {
    customerName: string;
    dueDateResolved?: string | null;
    billingAddressResolved?: string | null;
    resolveDefaults: boolean;
  },
): Promise<SalesInvoiceDetailRecord | null> {
  const existing = await getSalesInvoiceById(businessId, invoiceId);
  if (!existing) return null;

  const customerId = input.customerId ?? existing.customerId;
  const customerName =
    input.customerId && input.customerId !== existing.customerId
      ? input.customerName
      : existing.customerName;

  await db.transaction(async (tx) => {
    let journalLines: ComputedLine[] | null = null;
    let journalAmount = 0;

    if (input.lines) {
      const { computed } = computeLines(input.lines);
      await tx
        .delete(salesInvoiceLines)
        .where(eq(salesInvoiceLines.salesInvoiceId, invoiceId));
      await tx.insert(salesInvoiceLines).values(
        computed.map((l, i) => ({
          salesInvoiceId: invoiceId,
          accountId: l.accountId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          subtotal: l.subtotal,
          taxRatePercent: l.taxRatePercent,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
          sortOrder: i,
        })),
      );

      // Susun ulang jurnal: soft-delete yang lama, posting yang baru.
      await softDeleteJournals(tx, invoiceId);
      journalLines = computed;
      journalAmount = computed.reduce((s, l) => s + Number(l.lineTotal), 0);
      await postSalesJournal(tx, {
        invoiceId,
        businessId,
        customerId,
        customerName,
        reference: input.reference !== undefined ? input.reference : existing.reference,
        issueDate: input.issueDate ?? existing.issueDate,
        description:
          input.description !== undefined ? input.description : existing.description,
        lines: journalLines,
        invoiceAmount: journalAmount,
      });
    }

    const patch: Partial<{
      customerId: string;
      reference: string | null;
      issueDate: string;
      dueDate: string | null;
      billingAddress: string | null;
      description: string | null;
      updatedAt: Date;
    }> = { updatedAt: new Date() };
    if (input.customerId) patch.customerId = input.customerId;
    if (input.reference !== undefined) patch.reference = input.reference;
    if (input.issueDate) patch.issueDate = input.issueDate;
    if (input.resolveDefaults) {
      if (input.dueDate !== undefined) patch.dueDate = input.dueDateResolved ?? null;
      if (input.billingAddress !== undefined)
        patch.billingAddress = input.billingAddressResolved ?? null;
    } else {
      if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
      if (input.billingAddress !== undefined) patch.billingAddress = input.billingAddress;
    }
    if (input.description !== undefined) patch.description = input.description;

    await tx
      .update(salesInvoices)
      .set(patch)
      .where(
        and(
          eq(salesInvoices.businessId, businessId),
          eq(salesInvoices.id, invoiceId),
          isNull(salesInvoices.deletedAt),
        ),
      );
  });

  return getSalesInvoiceById(businessId, invoiceId);
}

// ---------------------------------------------------------------------
// DELETE — soft-delete faktur + jurnal terkait dalam 1 transaction
// ---------------------------------------------------------------------
export async function softDeleteSalesInvoice(
  businessId: string,
  invoiceId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [header] = await tx
      .select({ id: salesInvoices.id })
      .from(salesInvoices)
      .where(
        and(
          eq(salesInvoices.businessId, businessId),
          eq(salesInvoices.id, invoiceId),
          isNull(salesInvoices.deletedAt),
        ),
      )
      .limit(1);
    if (!header) return false;

    await softDeleteJournals(tx, invoiceId);
    await tx
      .update(salesInvoices)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(salesInvoices.id, invoiceId));
    return true;
  });
}
