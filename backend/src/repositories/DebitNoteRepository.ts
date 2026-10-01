/**
 * DebitNoteRepository — Nota debet (retur pembelian / koreksi tagihan supplier).
 *
 * KEBALIKAN PERSIS CreditNoteRepository:
 * - DEBIT  : akun kontrol Accounts Payable bisnis (contactId = supplierId)
 *            -> mengurangi Utang Usaha supplier
 * - KREDIT : tiap account_id baris (kategori Expense)
 *
 * TANPA pajak, TANPA status tersimpan.
 * purchase_invoice_id NULLABLE dan MURNI INFORMATIF: kalau diisi wajib milik
 * supplier_id yang sama (validasi silang), tapi TIDAK mempengaruhi
 * balanceDue faktur itu (beda dari Withholding Tax Receipts / Payments).
 *
 * Create langsung posting jurnal, update repost kalau supplier/lines berubah,
 * delete soft-delete header + jurnalnya.
 */
import {
  and,
  asc,
  count,
  eq,
  ilike,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import db, { type Database } from "../db/index.js";
import {
  chartOfAccounts,
  contacts,
  debitNoteLines,
  debitNotes,
  journalEntries,
  journalEntryLines,
  purchaseInvoices,
} from "../db/schema.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

export const DEBIT_NOTE_SOURCE_MODULE = "debit_note";

/** Dilempar untuk kesalahan validasi domain — route memetakannya ke 400. */
export class DebitNoteValidationError extends Error {}

export interface DebitNoteLineInput {
  accountId: string;
  description?: string | null;
  quantity?: number;
  unitPrice: number;
}

export interface DebitNoteCreateInput {
  supplierId: string;
  date: string;
  debitNoteNumber?: string | null;
  purchaseInvoiceId?: string | null;
  description?: string | null;
  lines: DebitNoteLineInput[];
}

export interface DebitNoteUpdateInput {
  supplierId?: string;
  date?: string;
  debitNoteNumber?: string | null;
  purchaseInvoiceId?: string | null;
  description?: string | null;
  lines?: DebitNoteLineInput[];
}

export interface DebitNoteListOptions {
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

export interface DebitNoteLineRecord {
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

export interface DebitNoteRecord {
  id: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  purchaseInvoiceId: string | null;
  purchaseInvoiceReference: string | null;
  debitNoteNumber: string | null;
  date: string;
  description: string | null;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DebitNoteDetailRecord extends DebitNoteRecord {
  lines: DebitNoteLineRecord[];
}

// ---------------------------------------------------------------------
// Helper hitung uang — SELALU dalam sen (integer), hindari drift float.
// ---------------------------------------------------------------------
function computeLines(lines: DebitNoteLineInput[]): {
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

  const totalCents = computed.reduce(
    (sum, l) => sum + Math.round(Number(l.lineTotal) * 100),
    0,
  );
  return { computed, totalAmount: totalCents / 100 };
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeNumber(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// ---------------------------------------------------------------------
// VALIDASI SILANG: purchase_invoice_id harus milik supplier_id yang sama
// (dan masih aktif di bisnis ini). Dipanggil di dalam transaction.
// ---------------------------------------------------------------------
export async function assertPurchaseInvoiceBelongsToSupplier(
  tx: DbOrTx,
  businessId: string,
  purchaseInvoiceId: string,
  supplierId: string,
): Promise<void> {
  const [row] = await tx
    .select({
      id: purchaseInvoices.id,
      supplierId: purchaseInvoices.supplierId,
      reference: purchaseInvoices.reference,
    })
    .from(purchaseInvoices)
    .where(
      and(
        eq(purchaseInvoices.id, purchaseInvoiceId),
        eq(purchaseInvoices.businessId, businessId),
        isNull(purchaseInvoices.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new DebitNoteValidationError(
      "Purchase Invoice yang dipilih tidak ditemukan di bisnis ini.",
    );
  }

  if (row.supplierId !== supplierId) {
    throw new DebitNoteValidationError(
      "Purchase Invoice yang dipilih bukan milik supplier yang dipilih. " +
        "Nota debet hanya boleh merujuk faktur pembelian dari supplier yang sama.",
    );
  }
}

// ---------------------------------------------------------------------
// JURNAL: DEBIT akun kontrol AP, KREDIT tiap akun Expense baris.
// ---------------------------------------------------------------------
interface PostJournalInput {
  debitNoteId: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  debitNoteNumber: string | null;
  date: string;
  description: string | null;
  lines: ComputedLine[];
  totalAmount: number;
}

async function postDebitNoteJournal(
  tx: DbOrTx,
  input: PostJournalInput,
): Promise<string> {
  const apAccount = await findApControlAccount(input.businessId, tx);
  if (!apAccount) {
    throw new DebitNoteValidationError(
      "Akun kontrol Utang Usaha (Liability + kontrol) belum disiapkan atau tidak tunggal di bisnis ini.",
    );
  }

  // Seluruh perhitungan uang di sen supaya tidak ada selisih pembulatan.
  const creditCents = input.lines.reduce(
    (sum, l) => sum + Math.round(Number(l.lineTotal) * 100),
    0,
  );
  const debitCents = Math.round(input.totalAmount * 100);

  if (debitCents !== creditCents) {
    throw new DebitNoteValidationError(
      `Jurnal tidak balance (debit ${debitCents} != kredit ${creditCents} sen).`,
    );
  }

  const refLabel = input.debitNoteNumber ?? input.debitNoteId.slice(0, 8);
  const [entry] = await tx
    .insert(journalEntries)
    .values({
      businessId: input.businessId,
      entryDate: input.date,
      reference: input.debitNoteNumber,
      sourceModule: DEBIT_NOTE_SOURCE_MODULE,
      sourceId: input.debitNoteId,
      description: input.description ?? `Nota Debet ${refLabel}`,
    })
    .returning({ id: journalEntries.id });

  const lines: (typeof journalEntryLines.$inferInsert)[] = [];

  // DEBIT: akun kontrol AP — mengurangi utang ke supplier.
  lines.push({
    journalEntryId: entry.id,
    accountId: apAccount.id,
    contactId: input.supplierId,
    debit: (debitCents / 100).toFixed(2),
    credit: "0.00",
    description: `Utang ${input.supplierName} (${refLabel})`,
  });

  // KREDIT: tiap akun Expense dari baris item.
  for (const l of input.lines) {
    lines.push({
      journalEntryId: entry.id,
      accountId: l.accountId,
      contactId: input.supplierId,
      debit: "0.00",
      credit: l.lineTotal,
      description: l.description ?? `Retur ${refLabel}`,
    });
  }

  await tx.insert(journalEntryLines).values(lines);
  return entry.id;
}

async function findActiveJournalIds(
  tx: DbOrTx,
  debitNoteId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.sourceModule, DEBIT_NOTE_SOURCE_MODULE),
        eq(journalEntries.sourceId, debitNoteId),
        isNull(journalEntries.deletedAt),
      ),
    );
  return rows.map((r) => r.id);
}

async function softDeleteJournals(
  tx: DbOrTx,
  debitNoteId: string,
): Promise<void> {
  const ids = await findActiveJournalIds(tx, debitNoteId);
  for (const id of ids) {
    await tx
      .update(journalEntries)
      .set({ deletedAt: new Date() })
      .where(eq(journalEntries.id, id));
  }
}

// ---------------------------------------------------------------------
// Proyeksi record — WAJIB Number() eksplisit: driver mengembalikan
// numeric Postgres sebagai string.
// ---------------------------------------------------------------------
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
}): DebitNoteLineRecord {
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
    purchaseInvoiceId: string | null;
    purchaseInvoiceReference: string | null;
    debitNoteNumber: string | null;
    date: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  totalAmount: number,
): DebitNoteRecord {
  return { ...header, totalAmount };
}

const headerSelection = {
  id: debitNotes.id,
  businessId: debitNotes.businessId,
  supplierId: debitNotes.supplierId,
  supplierName: contacts.name,
  purchaseInvoiceId: debitNotes.purchaseInvoiceId,
  purchaseInvoiceReference: purchaseInvoices.reference,
  debitNoteNumber: debitNotes.debitNoteNumber,
  date: debitNotes.date,
  description: debitNotes.description,
  createdAt: debitNotes.createdAt,
  updatedAt: debitNotes.updatedAt,
};

// Cari akun kontrol AP — pola sama seperti PurchaseInvoiceRepository.
// Tidak pernah hardcode kode akun tertentu.
export async function findApControlAccount(
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
        eq(chartOfAccounts.category, "Liability"),
        eq(chartOfAccounts.isControlAccount, true),
        isNull(chartOfAccounts.deletedAt),
      ),
    )
    .orderBy(asc(chartOfAccounts.code));
  return rows.length === 1 ? rows[0] : null;
}

// ---------------------------------------------------------------------
// LIST — totalAmount dihitung real-time (TIDAK ada kolom total tersimpan).
// ---------------------------------------------------------------------
export async function listDebitNotes(
  businessId: string,
  opts: DebitNoteListOptions,
): Promise<{ data: DebitNoteRecord[]; total: number }> {
  const totals = db
    .select({
      noteId: debitNoteLines.debitNoteId,
      totalAmount:
        sql<string>`COALESCE(SUM(${debitNoteLines.lineTotal}), 0)`.as(
          "total_amount",
        ),
    })
    .from(debitNoteLines)
    .groupBy(debitNoteLines.debitNoteId)
    .as("t");

  const conditions = [
    eq(debitNotes.businessId, businessId),
    isNull(debitNotes.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(debitNotes.debitNoteNumber, pattern),
        ilike(debitNotes.description, pattern),
        ilike(contacts.name, pattern),
      )!,
    );
  }

  const where = and(...conditions);

  const baseQuery = db
    .select({
      ...headerSelection,
      totalAmount: totals.totalAmount,
    })
    .from(debitNotes)
    .innerJoin(contacts, eq(debitNotes.supplierId, contacts.id))
    .leftJoin(
      purchaseInvoices,
      eq(debitNotes.purchaseInvoiceId, purchaseInvoices.id),
    )
    .leftJoin(totals, eq(totals.noteId, debitNotes.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(debitNotes.date), asc(debitNotes.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(debitNotes)
      .innerJoin(contacts, eq(debitNotes.supplierId, contacts.id))
      .leftJoin(
        purchaseInvoices,
        eq(debitNotes.purchaseInvoiceId, purchaseInvoices.id),
      )
      .leftJoin(totals, eq(totals.noteId, debitNotes.id))
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

async function getLinesWithAccounts(
  tx: DbOrTx,
  debitNoteId: string,
): Promise<DebitNoteLineRecord[]> {
  const rows = await tx
    .select({
      id: debitNoteLines.id,
      accountId: debitNoteLines.accountId,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      description: debitNoteLines.description,
      quantity: debitNoteLines.quantity,
      unitPrice: debitNoteLines.unitPrice,
      lineTotal: debitNoteLines.lineTotal,
      sortOrder: debitNoteLines.sortOrder,
    })
    .from(debitNoteLines)
    .innerJoin(
      chartOfAccounts,
      eq(debitNoteLines.accountId, chartOfAccounts.id),
    )
    .where(eq(debitNoteLines.debitNoteId, debitNoteId))
    .orderBy(asc(debitNoteLines.sortOrder), asc(debitNoteLines.id));
  return rows.map(toLineRecord);
}

// ---------------------------------------------------------------------
// GET detail
// ---------------------------------------------------------------------
export async function getDebitNoteById(
  businessId: string,
  debitNoteId: string,
): Promise<DebitNoteDetailRecord | null> {
  const [header] = await db
    .select(headerSelection)
    .from(debitNotes)
    .innerJoin(contacts, eq(debitNotes.supplierId, contacts.id))
    .leftJoin(
      purchaseInvoices,
      eq(debitNotes.purchaseInvoiceId, purchaseInvoices.id),
    )
    .where(
      and(
        eq(debitNotes.businessId, businessId),
        eq(debitNotes.id, debitNoteId),
        isNull(debitNotes.deletedAt),
      ),
    )
    .limit(1);

  if (!header) return null;

  const lines = await getLinesWithAccounts(db, debitNoteId);
  const totalCents = lines.reduce(
    (sum, l) => sum + Math.round(l.lineTotal * 100),
    0,
  );
  return { ...toRecord(header, totalCents / 100), lines };
}

// ---------------------------------------------------------------------
// CREATE — header + lines + jurnal dalam SATU transaction.
// ---------------------------------------------------------------------
export async function createDebitNote(
  businessId: string,
  input: DebitNoteCreateInput & { supplierName: string },
): Promise<DebitNoteDetailRecord> {
  const { computed, totalAmount } = computeLines(input.lines);
  const purchaseInvoiceId = input.purchaseInvoiceId ?? null;

  const debitNoteId = await db.transaction(async (tx) => {
    if (purchaseInvoiceId) {
      await assertPurchaseInvoiceBelongsToSupplier(
        tx,
        businessId,
        purchaseInvoiceId,
        input.supplierId,
      );
    }

    const [header] = await tx
      .insert(debitNotes)
      .values({
        businessId,
        supplierId: input.supplierId,
        date: input.date,
        debitNoteNumber: normalizeNumber(input.debitNoteNumber),
        purchaseInvoiceId,
        description: input.description ?? null,
      })
      .returning({ id: debitNotes.id });

    await tx.insert(debitNoteLines).values(
      computed.map((l, i) => ({
        debitNoteId: header.id,
        accountId: l.accountId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        sortOrder: i,
      })),
    );

    await postDebitNoteJournal(tx, {
      debitNoteId: header.id,
      businessId,
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      debitNoteNumber: normalizeNumber(input.debitNoteNumber),
      date: input.date,
      description: input.description ?? null,
      lines: computed,
      totalAmount,
    });

    return header.id;
  });

  const detail = await getDebitNoteById(businessId, debitNoteId);
  if (!detail) throw new Error("Gagal mengambil nota debet setelah create.");
  return detail;
}

// ---------------------------------------------------------------------
// UPDATE — WAJIB repost jurnal kalau supplierId ATAU lines berubah.
//
// Field yang menentukan isi jurnal di modul ini:
//   1. supplierId  -> contactId baris AP + nama supplier di deskripsi
//   2. lines       -> akun Expense + nominal kredit per baris
//   3. date        -> entryDate jurnal (ikut disusun saat repost)
//   4. debitNoteNumber / description -> label jurnal
// Nomor 3-4 hanya ikut terbarui KALAU repost sudah terpicu (pola sama
// Credit Notes), sedangkan 1-2 SELALU memicu repost.
// purchaseInvoiceId TIDAK masuk jurnal (murni informatif) — tapi tetap
// divalidasi ulang bila berubah.
// ---------------------------------------------------------------------
export async function updateDebitNote(
  businessId: string,
  debitNoteId: string,
  input: DebitNoteUpdateInput & { supplierName: string },
): Promise<DebitNoteDetailRecord | null> {
  const existing = await getDebitNoteById(businessId, debitNoteId);
  if (!existing) return null;

  const supplierId = input.supplierId ?? existing.supplierId;
  const supplierChanged =
    input.supplierId !== undefined && input.supplierId !== existing.supplierId;
  const supplierName = supplierChanged ? input.supplierName : existing.supplierName;

  const nextDebitNoteNumber =
    input.debitNoteNumber === undefined
      ? existing.debitNoteNumber
      : normalizeNumber(input.debitNoteNumber);
  const nextDate = input.date ?? existing.date;
  const nextDescription =
    input.description === undefined
      ? existing.description
      : (input.description ?? null);
  const nextPurchaseInvoiceId =
    input.purchaseInvoiceId === undefined
      ? existing.purchaseInvoiceId
      : (input.purchaseInvoiceId ?? null);

  await db.transaction(async (tx) => {
    let journalLines: ComputedLine[] | null = null;
    let needsRepost = false;

    if (input.lines) {
      const { computed } = computeLines(input.lines);
      journalLines = computed;

      await tx
        .delete(debitNoteLines)
        .where(eq(debitNoteLines.debitNoteId, debitNoteId));

      await tx.insert(debitNoteLines).values(
        computed.map((l, i) => ({
          debitNoteId,
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

    if (supplierChanged) needsRepost = true;

    // Validasi silang dijalankan untuk nilai purchaseInvoiceId YANG AKAN
    // tersimpan — termasuk saat supplier diganti tanpa mengganti faktur
    // (faktur lama mendadak bukan milik supplier baru -> ditolak).
    if (nextPurchaseInvoiceId) {
      await assertPurchaseInvoiceBelongsToSupplier(
        tx,
        businessId,
        nextPurchaseInvoiceId,
        supplierId,
      );
    }

    await tx
      .update(debitNotes)
      .set({
        supplierId,
        date: nextDate,
        debitNoteNumber: nextDebitNoteNumber,
        purchaseInvoiceId: nextPurchaseInvoiceId,
        description: nextDescription,
        updatedAt: new Date(),
      })
      .where(eq(debitNotes.id, debitNoteId));

    if (needsRepost) {
      await softDeleteJournals(tx, debitNoteId);

      // Baris yang dipakai repost bisa berasal dari input baru (ComputedLine)
      // atau dari record tersimpan (angka) — diseragamkan ke ComputedLine.
      const lines: ComputedLine[] = journalLines
        ? journalLines
        : existing.lines.map((l) => ({
            accountId: l.accountId,
            description: l.description,
            quantity: Number(l.quantity).toFixed(4),
            unitPrice: Number(l.unitPrice).toFixed(2),
            lineTotal: Number(l.lineTotal).toFixed(2),
          }));

      const amount =
        lines.reduce(
          (sum, l) => sum + Math.round(Number(l.lineTotal) * 100),
          0,
        ) / 100;

      await postDebitNoteJournal(tx, {
        debitNoteId,
        businessId,
        supplierId,
        supplierName,
        debitNoteNumber: nextDebitNoteNumber,
        date: nextDate,
        description: nextDescription,
        lines,
        totalAmount: amount,
      });
    }
  });

  const updated = await getDebitNoteById(businessId, debitNoteId);
  if (!updated) throw new Error("Gagal mengambil nota debet setelah update.");
  return updated;
}

// ---------------------------------------------------------------------
// DELETE (soft) — header + jurnalnya, bebas tanpa lock.
// ---------------------------------------------------------------------
export async function softDeleteDebitNote(
  businessId: string,
  debitNoteId: string,
): Promise<boolean> {
  const existing = await getDebitNoteById(businessId, debitNoteId);
  if (!existing) return false;

  await db.transaction(async (tx) => {
    await tx
      .update(debitNotes)
      .set({ deletedAt: new Date() })
      .where(eq(debitNotes.id, debitNoteId));

    await softDeleteJournals(tx, debitNoteId);
  });

  return true;
}

// ---------------------------------------------------------------------
// COPY — duplikat jadi record baru (date = hari ini).
// Relasi purchaseInvoiceId divalidasi ULANG: nota debet baru tidak boleh
// merujuk faktur yang bukan milik supplier-nya (mis. faktur sudah dihapus).
// ---------------------------------------------------------------------
export async function copyDebitNote(
  businessId: string,
  debitNoteId: string,
): Promise<DebitNoteDetailRecord | null> {
  const existing = await getDebitNoteById(businessId, debitNoteId);
  if (!existing) return null;

  const { computed, totalAmount } = computeLines(
    existing.lines.map((l) => ({
      accountId: l.accountId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    })),
  );

  const newId = await db.transaction(async (tx) => {
    if (existing.purchaseInvoiceId) {
      await assertPurchaseInvoiceBelongsToSupplier(
        tx,
        businessId,
        existing.purchaseInvoiceId,
        existing.supplierId,
      );
    }

    const [header] = await tx
      .insert(debitNotes)
      .values({
        businessId,
        supplierId: existing.supplierId,
        date: todayString(),
        debitNoteNumber: existing.debitNoteNumber,
        purchaseInvoiceId: existing.purchaseInvoiceId,
        description: existing.description,
      })
      .returning({ id: debitNotes.id });

    await tx.insert(debitNoteLines).values(
      computed.map((l, i) => ({
        debitNoteId: header.id,
        accountId: l.accountId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        sortOrder: i,
      })),
    );

    await postDebitNoteJournal(tx, {
      debitNoteId: header.id,
      businessId,
      supplierId: existing.supplierId,
      supplierName: existing.supplierName,
      debitNoteNumber: existing.debitNoteNumber,
      date: todayString(),
      description: existing.description,
      lines: computed,
      totalAmount,
    });

    return header.id;
  });

  return getDebitNoteById(businessId, newId);
}
