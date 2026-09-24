/**
 * JournalEntryRepository — Buku Besar / General Ledger view + jurnal manual.
 *
 * BEDA dari semua modul transaksi: TIDAK ADA tabel baru. Modul ini murni
 * CRUD TERBATAS di atas journal_entries/journal_entry_lines:
 * - LIST/GET: semua jurnal (manual + otomatis), read-only.
 * - CREATE: selalu source_module='manual_journal', source_id=null.
 * - UPDATE/DELETE: DITOLAK kalau jurnal berasal dari modul lain
 *   (sourceModule != 'manual_journal') — jurnal otomatis hanya boleh
 *   diubah/dihapus lewat dokumen sumbernya.
 *
 * Catatan skema: journal_entry_lines TIDAK PUNYA deleted_at (ikut lewat
 * header-nya), jadi update me-replace baris lama dengan baris baru
 * (delete + insert, pola invoice-lines), bukan soft-delete per baris.
 */
import { and, asc, count, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import db, { type Database } from "../db/index.js";
import {
  chartOfAccounts,
  contacts,
  journalEntries,
  journalEntryLines,
} from "../db/schema.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

export const MANUAL_JOURNAL_SOURCE_MODULE = "manual_journal";

export interface JournalEntryLineInput {
  accountId: string;
  contactId?: string | null;
  debit?: number;
  credit?: number;
  description?: string | null;
}

export interface JournalEntryCreateInput {
  entryDate: string;
  reference?: string | null;
  description?: string | null;
  lines: JournalEntryLineInput[];
}

export interface JournalEntryUpdateInput {
  entryDate?: string;
  reference?: string | null;
  description?: string | null;
  lines?: JournalEntryLineInput[];
}

export interface JournalEntryListOptions {
  page: number;
  pageSize: number;
  q?: string;
  sourceModule?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface JournalEntryLineRecord {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  contactId: string | null;
  contactName: string | null;
  debit: number;
  credit: number;
  description: string | null;
}

export interface JournalEntryRecord {
  id: string;
  businessId: string;
  entryDate: string;
  reference: string | null;
  sourceModule: string;
  sourceId: string | null;
  description: string | null;
  isManual: boolean;
  totalDebit: number;
  totalCredit: number;
}

export interface JournalEntryDetailRecord extends JournalEntryRecord {
  lines: JournalEntryLineRecord[];
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

interface NormalizedLine {
  accountId: string;
  contactId: string | null;
  description: string | null;
  debitCents: number;
  creditCents: number;
}

/**
 * Normalisasi + validasi double-entry dalam SEN (pelajaran #4).
 * Tiap baris tepat satu sisi > 0, total debit == total kredit.
 */
function normalizeLines(lines: JournalEntryLineInput[]): {
  normalized: NormalizedLine[];
  totalCents: number;
} {
  if (lines.length < 2) {
    throw new Error("Jurnal manual wajib punya minimal 2 baris.");
  }
  const normalized = lines.map((l, i) => {
    const debitCents = toCents(l.debit ?? 0);
    const creditCents = toCents(l.credit ?? 0);
    if (debitCents < 0 || creditCents < 0) {
      throw new Error(`Baris #${i + 1}: nominal tidak boleh negatif.`);
    }
    const filled = (debitCents > 0 ? 1 : 0) + (creditCents > 0 ? 1 : 0);
    if (filled !== 1) {
      throw new Error(
        `Baris #${i + 1}: isi tepat satu dari debit ATAU kredit.`,
      );
    }
    return {
      accountId: l.accountId,
      contactId: l.contactId ?? null,
      description: l.description?.trim() ? l.description.trim() : null,
      debitCents,
      creditCents,
    };
  });

  const totalDebit = normalized.reduce((s, l) => s + l.debitCents, 0);
  const totalCredit = normalized.reduce((s, l) => s + l.creditCents, 0);
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Jurnal tidak balance (debit ${totalDebit / 100} != kredit ${totalCredit / 100}).`,
    );
  }
  return { normalized, totalCents: totalDebit };
}

function toLineRecord(row: {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  contactId: string | null;
  contactName: string | null;
  debit: string;
  credit: string;
  description: string | null;
}): JournalEntryLineRecord {
  // numeric Postgres datang sebagai STRING — Number() eksplisit (pelajaran #2).
  return {
    id: row.id,
    accountId: row.accountId,
    accountCode: row.accountCode,
    accountName: row.accountName,
    contactId: row.contactId,
    contactName: row.contactName,
    debit: Number(row.debit),
    credit: Number(row.credit),
    description: row.description,
  };
}

function toRecord(header: {
  id: string;
  businessId: string;
  entryDate: string;
  reference: string | null;
  sourceModule: string;
  sourceId: string | null;
  description: string | null;
  totalDebit: string | number | null;
  totalCredit: string | number | null;
}): JournalEntryRecord {
  return {
    id: header.id,
    businessId: header.businessId,
    entryDate: header.entryDate,
    reference: header.reference,
    sourceModule: header.sourceModule,
    sourceId: header.sourceId,
    description: header.description,
    isManual: header.sourceModule === MANUAL_JOURNAL_SOURCE_MODULE,
    totalDebit: Number(header.totalDebit ?? 0),
    totalCredit: Number(header.totalCredit ?? 0),
  };
}

function buildListConditions(businessId: string, opts: JournalEntryListOptions) {
  const conditions = [
    eq(journalEntries.businessId, businessId),
    isNull(journalEntries.deletedAt),
  ];
  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(journalEntries.reference, pattern),
        ilike(journalEntries.description, pattern),
      )!,
    );
  }
  if (opts.sourceModule) {
    conditions.push(eq(journalEntries.sourceModule, opts.sourceModule));
  }
  if (opts.dateFrom) {
    conditions.push(gte(journalEntries.entryDate, opts.dateFrom));
  }
  if (opts.dateTo) {
    conditions.push(lte(journalEntries.entryDate, opts.dateTo));
  }
  return conditions;
}

export async function listJournalEntries(
  businessId: string,
  opts: JournalEntryListOptions,
): Promise<{ data: JournalEntryRecord[]; total: number }> {
  const totals = db
    .select({
      entryId: journalEntryLines.journalEntryId,
      totalDebit: sql<string>`COALESCE(SUM(${journalEntryLines.debit}), 0)`.as("total_debit"),
      totalCredit: sql<string>`COALESCE(SUM(${journalEntryLines.credit}), 0)`.as("total_credit"),
    })
    .from(journalEntryLines)
    .groupBy(journalEntryLines.journalEntryId)
    .as("t");

  const where = and(...buildListConditions(businessId, opts));
  const baseQuery = db
    .select({
      id: journalEntries.id,
      businessId: journalEntries.businessId,
      entryDate: journalEntries.entryDate,
      reference: journalEntries.reference,
      sourceModule: journalEntries.sourceModule,
      sourceId: journalEntries.sourceId,
      description: journalEntries.description,
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
    })
    .from(journalEntries)
    .leftJoin(totals, eq(totals.entryId, journalEntries.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(desc(journalEntries.entryDate), asc(journalEntries.id))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(journalEntries)
      .where(where),
  ]);

  return {
    data: rows.map((r) => toRecord(r)),
    total: totalRow?.total ?? 0,
  };
}

async function getLinesWithAccounts(
  tx: DbOrTx,
  entryId: string,
): Promise<JournalEntryLineRecord[]> {
  const rows = await tx
    .select({
      id: journalEntryLines.id,
      accountId: journalEntryLines.accountId,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      contactId: journalEntryLines.contactId,
      contactName: contacts.name,
      debit: journalEntryLines.debit,
      credit: journalEntryLines.credit,
      description: journalEntryLines.description,
    })
    .from(journalEntryLines)
    .innerJoin(chartOfAccounts, eq(journalEntryLines.accountId, chartOfAccounts.id))
    .leftJoin(contacts, eq(journalEntryLines.contactId, contacts.id))
    .where(eq(journalEntryLines.journalEntryId, entryId))
    .orderBy(asc(journalEntryLines.id));
  return rows.map(toLineRecord);
}

export async function getJournalEntryById(
  businessId: string,
  entryId: string,
): Promise<JournalEntryDetailRecord | null> {
  const [header] = await db
    .select({
      id: journalEntries.id,
      businessId: journalEntries.businessId,
      entryDate: journalEntries.entryDate,
      reference: journalEntries.reference,
      sourceModule: journalEntries.sourceModule,
      sourceId: journalEntries.sourceId,
      description: journalEntries.description,
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.businessId, businessId),
        eq(journalEntries.id, entryId),
        isNull(journalEntries.deletedAt),
      ),
    )
    .limit(1);

  if (!header) return null;
  const lines = await getLinesWithAccounts(db, entryId);
  const totalCents = lines.reduce((s, l) => s + toCents(l.debit), 0);
  const totalCreditCents = lines.reduce((s, l) => s + toCents(l.credit), 0);
  return {
    ...toRecord({
      ...header,
      totalDebit: fromCents(totalCents),
      totalCredit: fromCents(totalCreditCents),
    }),
    lines,
  };
}

export async function createManualJournalEntry(
  businessId: string,
  input: JournalEntryCreateInput,
): Promise<JournalEntryDetailRecord> {
  const { normalized } = normalizeLines(input.lines);

  const entryId = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(journalEntries)
      .values({
        businessId,
        entryDate: input.entryDate,
        reference: input.reference ?? null,
        sourceModule: MANUAL_JOURNAL_SOURCE_MODULE,
        sourceId: null,
        description: input.description ?? null,
      })
      .returning({ id: journalEntries.id });

    await tx.insert(journalEntryLines).values(
      normalized.map((l) => ({
        journalEntryId: header.id,
        accountId: l.accountId,
        contactId: l.contactId,
        debit: fromCents(l.debitCents),
        credit: fromCents(l.creditCents),
        description: l.description,
      })),
    );
    return header.id;
  });

  const detail = await getJournalEntryById(businessId, entryId);
  if (!detail) throw new Error("Gagal mengambil jurnal setelah create.");
  return detail;
}

export async function updateManualJournalEntry(
  businessId: string,
  entryId: string,
  input: JournalEntryUpdateInput,
): Promise<JournalEntryDetailRecord | null> {
  const existing = await getJournalEntryById(businessId, entryId);
  if (!existing) return null;
  if (!existing.isManual) {
    throw new Error(
      "Jurnal ini berasal dari modul lain, edit lewat dokumen sumbernya.",
    );
  }

  const normalized = input.lines ? normalizeLines(input.lines).normalized : null;

  await db.transaction(async (tx) => {
    if (normalized) {
      // Baris anak ikut header-nya (tanpa deletedAt): replace, pola invoice-lines.
      await tx.delete(journalEntryLines).where(eq(journalEntryLines.journalEntryId, entryId));
      await tx.insert(journalEntryLines).values(
        normalized.map((l) => ({
          journalEntryId: entryId,
          accountId: l.accountId,
          contactId: l.contactId,
          debit: fromCents(l.debitCents),
          credit: fromCents(l.creditCents),
          description: l.description,
        })),
      );
    }

    const patch: Partial<typeof journalEntries.$inferInsert> = {};
    if (input.entryDate) patch.entryDate = input.entryDate;
    if (input.reference !== undefined) patch.reference = input.reference;
    if (input.description !== undefined) patch.description = input.description;

    if (Object.keys(patch).length > 0) {
      await tx
        .update(journalEntries)
        .set(patch)
        .where(
          and(
            eq(journalEntries.businessId, businessId),
            eq(journalEntries.id, entryId),
            isNull(journalEntries.deletedAt),
          ),
        );
    }
  });

  return getJournalEntryById(businessId, entryId);
}

export async function softDeleteManualJournalEntry(
  businessId: string,
  entryId: string,
): Promise<boolean> {
  const existing = await getJournalEntryById(businessId, entryId);
  if (!existing) return false;
  if (!existing.isManual) {
    throw new Error(
      "Jurnal ini berasal dari modul lain, hapus lewat dokumen sumbernya.",
    );
  }

  // Header saja — baris ikut lewat header-nya (tanpa deletedAt).
  const rows = await db
    .update(journalEntries)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(journalEntries.businessId, businessId),
        eq(journalEntries.id, entryId),
        isNull(journalEntries.deletedAt),
      ),
    )
    .returning({ id: journalEntries.id });
  return rows.length > 0;
}
