/**
 * CreditNoteRepository — Nota kredit (retur/koreksi pengurangan tagihan).
 *
 * Beda dari Sales Invoice: jurnal TERBALIK
 * - DEBIT: tiap account_id baris (kategori Revenue)
 * - KREDIT: akun kontrol Accounts Receivable
 * Ini mengurangi piutang pelanggan (kebalikan dari Sales Invoice).
 *
 * TANPA pajak, TANPA link ke sales_invoice spesifik.
 * Create langsung posting jurnal, update repost, delete soft-delete semua.
 */
import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import db, { type Database } from "../db/index.js";
import {
  chartOfAccounts,
  contacts,
  creditNoteLines,
  creditNotes,
  journalEntries,
  journalEntryLines,
} from "../db/schema.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

export const CREDIT_NOTE_SOURCE_MODULE = "credit_note";

export interface CreditNoteLineInput {
  accountId: string;
  description?: string | null;
  quantity?: number;
  unitPrice: number;
}

export interface CreditNoteCreateInput {
  customerId: string;
  issueDate: string;
  reference?: string;
  description?: string | null;
  lines: CreditNoteLineInput[];
}

export interface CreditNoteUpdateInput {
  customerId?: string;
  issueDate?: string;
  reference?: string | null;
  description?: string | null;
  lines?: CreditNoteLineInput[];
}

export interface CreditNoteListOptions {
  page: number;
  pageSize: number;
  q?: string;
}

interface ComputedLine {
  accountId: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface CreditNoteLineRecord {
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

export interface CreditNoteRecord {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  reference: string | null;
  issueDate: string;
  description: string | null;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditNoteDetailRecord extends CreditNoteRecord {
  lines: CreditNoteLineRecord[];
}

// Helper: hitung dalam sen (integer)
function computeLines(lines: CreditNoteLineInput[]): {
  computed: ComputedLine[];
  totalAmount: number;
} {
  const computed = lines.map((l) => {
    const qty = l.quantity ?? 1;
    const lineTotalCents = Math.round(qty * l.unitPrice * 100);
    return {
      accountId: l.accountId,
      description: l.description?.trim() ? l.description.trim() : null,
      quantity: qty.toFixed(4),
      unitPrice: l.unitPrice.toFixed(2),
      lineTotal: (lineTotalCents / 100).toFixed(2),
    };
  });

  const totalAmount =
    computed.reduce((sum, l) => sum + Math.round(Number(l.lineTotal) * 100), 0) /
    100;
  return { computed, totalAmount };
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

// Cari akun kontrol AR (pola sama seperti SalesInvoiceRepository)
export async function findArControlAccount(
  businessId: string,
  tx: DbOrTx = db,
): Promise<{ id: string; code: string; name: string } | null> {
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

// Post jurnal: DEBIT Revenue per baris, KREDIT AR
async function postCreditNoteJournal(
  tx: DbOrTx,
  input: {
    creditNoteId: string;
    businessId: string;
    customerId: string;
    customerName: string;
    reference: string | null;
    issueDate: string;
    description: string | null;
    lines: ComputedLine[];
    totalAmount: number;
  },
): Promise<string> {
  const arAccount = await findArControlAccount(input.businessId, tx);
  if (!arAccount) {
    throw new Error(
      "Akun kontrol Piutang Usaha (Asset + kontrol) tidak ditemukan atau tidak tunggal di bisnis ini.",
    );
  }

  const debitCents = Math.round(input.totalAmount * 100);
  const creditCents = debitCents; // WAJIB balance

  if (debitCents !== creditCents) {
    throw new Error(
      `Jurnal tidak balance (debit ${debitCents} != kredit ${creditCents}).`,
    );
  }

  const refLabel = input.reference ?? input.creditNoteId.slice(0, 8);
  const [entry] = await tx
    .insert(journalEntries)
    .values({
      businessId: input.businessId,
      entryDate: input.issueDate,
      reference: input.reference,
      sourceModule: CREDIT_NOTE_SOURCE_MODULE,
      sourceId: input.creditNoteId,
      description: input.description ?? `Nota Kredit ${refLabel}`,
    })
    .returning({ id: journalEntries.id });

  const lines: (typeof journalEntryLines.$inferInsert)[] = [];

  // DEBIT: tiap akun Revenue dari baris
  for (const l of input.lines) {
    lines.push({
      journalEntryId: entry.id,
      accountId: l.accountId,
      contactId: input.customerId,
      debit: l.lineTotal,
      credit: "0.00",
      description: `Retur ${refLabel}`,
    });
  }

  // KREDIT: akun kontrol AR
  lines.push({
    journalEntryId: entry.id,
    accountId: arAccount.id,
    contactId: input.customerId,
    debit: "0.00",
    credit: (debitCents / 100).toFixed(2),
    description: `Piutang ${input.customerName} (${refLabel})`,
  });

  await tx.insert(journalEntryLines).values(lines);
  return entry.id;
}

// Cari semua jurnal aktif milik credit note ini
async function findActiveJournalIds(
  tx: DbOrTx,
  creditNoteId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.sourceModule, CREDIT_NOTE_SOURCE_MODULE),
        eq(journalEntries.sourceId, creditNoteId),
        isNull(journalEntries.deletedAt),
      ),
    );
  return rows.map((r) => r.id);
}

// Soft-delete semua jurnal
async function softDeleteJournals(tx: DbOrTx, creditNoteId: string): Promise<void> {
  const ids = await findActiveJournalIds(tx, creditNoteId);
  for (const id of ids) {
    await tx
      .update(journalEntries)
      .set({ deletedAt: new Date() })
      .where(eq(journalEntries.id, id));
  }
}

// Proyeksi record
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
}): CreditNoteLineRecord {
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
    customerId: string;
    customerName: string;
    reference: string | null;
    issueDate: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  totalAmount: number,
): CreditNoteRecord {
  return {
    ...header,
    totalAmount,
  };
}

// LIST
export async function listCreditNotes(
  businessId: string,
  opts: CreditNoteListOptions,
): Promise<{ data: CreditNoteRecord[]; total: number }> {
  const totals = db
    .select({
      noteId: creditNoteLines.creditNoteId,
      totalAmount: sql<string>`COALESCE(SUM(${creditNoteLines.lineTotal}), 0)`.as(
        "total_amount",
      ),
    })
    .from(creditNoteLines)
    .groupBy(creditNoteLines.creditNoteId)
    .as("t");

  const conditions = [
    eq(creditNotes.businessId, businessId),
    isNull(creditNotes.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(creditNotes.reference, pattern),
        ilike(creditNotes.description, pattern),
        ilike(contacts.name, pattern),
      )!,
    );
  }

  const where = and(...conditions);

  const baseQuery = db
    .select({
      id: creditNotes.id,
      businessId: creditNotes.businessId,
      customerId: creditNotes.customerId,
      customerName: contacts.name,
      reference: creditNotes.reference,
      issueDate: creditNotes.issueDate,
      description: creditNotes.description,
      totalAmount: totals.totalAmount,
      createdAt: creditNotes.createdAt,
      updatedAt: creditNotes.updatedAt,
    })
    .from(creditNotes)
    .innerJoin(contacts, eq(creditNotes.customerId, contacts.id))
    .leftJoin(totals, eq(totals.noteId, creditNotes.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(creditNotes.issueDate), asc(creditNotes.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(creditNotes)
      .innerJoin(contacts, eq(creditNotes.customerId, contacts.id))
      .leftJoin(totals, eq(totals.noteId, creditNotes.id))
      .where(where),
  ]);

  return {
    data: rows.map((r) => {
      const { totalAmount, ...header } = r;
      return toRecord(header, Number(totalAmount ?? 0));
    }),
    total: totalRow?.total ?? 0,
  };
}

// GET baris + akun
async function getLinesWithAccounts(
  tx: DbOrTx,
  creditNoteId: string,
): Promise<CreditNoteLineRecord[]> {
  const rows = await tx
    .select({
      id: creditNoteLines.id,
      accountId: creditNoteLines.accountId,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      description: creditNoteLines.description,
      quantity: creditNoteLines.quantity,
      unitPrice: creditNoteLines.unitPrice,
      lineTotal: creditNoteLines.lineTotal,
      sortOrder: creditNoteLines.sortOrder,
    })
    .from(creditNoteLines)
    .innerJoin(
      chartOfAccounts,
      eq(creditNoteLines.accountId, chartOfAccounts.id),
    )
    .where(eq(creditNoteLines.creditNoteId, creditNoteId))
    .orderBy(asc(creditNoteLines.sortOrder), asc(creditNoteLines.id));
  return rows.map(toLineRecord);
}

// GET detail
export async function getCreditNoteById(
  businessId: string,
  creditNoteId: string,
): Promise<CreditNoteDetailRecord | null> {
  const [header] = await db
    .select({
      id: creditNotes.id,
      businessId: creditNotes.businessId,
      customerId: creditNotes.customerId,
      customerName: contacts.name,
      reference: creditNotes.reference,
      issueDate: creditNotes.issueDate,
      description: creditNotes.description,
      createdAt: creditNotes.createdAt,
      updatedAt: creditNotes.updatedAt,
    })
    .from(creditNotes)
    .innerJoin(contacts, eq(creditNotes.customerId, contacts.id))
    .where(
      and(
        eq(creditNotes.businessId, businessId),
        eq(creditNotes.id, creditNoteId),
        isNull(creditNotes.deletedAt),
      ),
    )
    .limit(1);

  if (!header) return null;

  const lines = await getLinesWithAccounts(db, creditNoteId);
  const totalAmount = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  return { ...toRecord(header, totalAmount), lines };
}

// CREATE
export async function createCreditNote(
  businessId: string,
  input: CreditNoteCreateInput & { customerName: string },
): Promise<CreditNoteDetailRecord> {
  const { computed, totalAmount } = computeLines(input.lines);

  const creditNoteId = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(creditNotes)
      .values({
        businessId,
        customerId: input.customerId,
        issueDate: input.issueDate,
        reference: input.reference ?? null,
        description: input.description ?? null,
      })
      .returning({ id: creditNotes.id });

    await tx.insert(creditNoteLines).values(
      computed.map((l, i) => ({
        creditNoteId: header.id,
        accountId: l.accountId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        sortOrder: i,
      })),
    );

    await postCreditNoteJournal(tx, {
      creditNoteId: header.id,
      businessId,
      customerId: input.customerId,
      customerName: input.customerName,
      reference: input.reference ?? null,
      issueDate: input.issueDate,
      description: input.description ?? null,
      lines: computed,
      totalAmount,
    });

    return header.id;
  });

  const detail = await getCreditNoteById(businessId, creditNoteId);
  if (!detail) throw new Error("Gagal mengambil nota kredit setelah create.");
  return detail;
}

// UPDATE — repost jurnal jika customer_id atau lines berubah
export async function updateCreditNote(
  businessId: string,
  creditNoteId: string,
  input: CreditNoteUpdateInput & { customerName: string },
): Promise<CreditNoteDetailRecord | null> {
  const existing = await getCreditNoteById(businessId, creditNoteId);
  if (!existing) return null;

  const customerId = input.customerId ?? existing.customerId;
  const customerName =
    input.customerId && input.customerId !== existing.customerId
      ? input.customerName
      : existing.customerName;

  await db.transaction(async (tx) => {
    let journalLines: ComputedLine[] | null = null;
    let journalAmount = 0;
    let needsRepost = false;

    // Cek apakah lines berubah atau customer berubah
    if (input.lines) {
      const { computed } = computeLines(input.lines);
      journalLines = computed;
      journalAmount = computed.reduce(
        (sum, l) => sum + Math.round(Number(l.lineTotal) * 100),
        0,
      ) / 100;

      await tx
        .delete(creditNoteLines)
        .where(eq(creditNoteLines.creditNoteId, creditNoteId));

      await tx.insert(creditNoteLines).values(
        computed.map((l, i) => ({
          creditNoteId,
          accountId: l.accountId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          sortOrder: i,
        })),
      );

      needsRepost = true;
    }

    // Cek apakah customer berubah
    if (input.customerId && input.customerId !== existing.customerId) {
      needsRepost = true;
    }

    // Update header
    const updateData: Record<string, unknown> = {};
    if (input.customerId) updateData.customerId = input.customerId;
    if (input.issueDate) updateData.issueDate = input.issueDate;
    if ("reference" in input) updateData.reference = input.reference ?? null;
    if ("description" in input) updateData.description = input.description ?? null;
    updateData.updatedAt = new Date();

    if (Object.keys(updateData).length > 0) {
      await tx
        .update(creditNotes)
        .set(updateData)
        .where(eq(creditNotes.id, creditNoteId));
    }

    // Repost jurnal jika ada perubahan
    if (needsRepost) {
      await softDeleteJournals(tx, creditNoteId);

      const lines = journalLines ?? existing.lines;
      const amount =
        journalAmount ||
        lines.reduce((sum, l) => sum + Number(l.lineTotal), 0);

      await postCreditNoteJournal(tx, {
        creditNoteId,
        businessId,
        customerId,
        customerName,
        reference: input.reference ?? existing.reference,
        issueDate: input.issueDate ?? existing.issueDate,
        description: input.description ?? existing.description,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          description: l.description,
          quantity: l.quantity.toString(),
          unitPrice: l.unitPrice.toString(),
          lineTotal: l.lineTotal.toString(),
        })),
        totalAmount: amount,
      });
    }
  });

  const updated = await getCreditNoteById(businessId, creditNoteId);
  if (!updated) throw new Error("Gagal mengambil nota kredit setelah update.");
  return updated;
}

// DELETE (soft)
export async function softDeleteCreditNote(
  businessId: string,
  creditNoteId: string,
): Promise<boolean> {
  const existing = await getCreditNoteById(businessId, creditNoteId);
  if (!existing) return false;

  await db.transaction(async (tx) => {
    await tx
      .update(creditNotes)
      .set({ deletedAt: new Date() })
      .where(eq(creditNotes.id, creditNoteId));

    await softDeleteJournals(tx, creditNoteId);
  });

  return true;
}
