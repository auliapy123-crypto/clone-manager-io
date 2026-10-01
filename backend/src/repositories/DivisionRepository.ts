/**
 * DivisionRepository — Modul Divisi/Departemen (MIRROR pola ProjectRepository,
 * TANPA Bagian C: Divisions murni label/tag pengelompokan — TIDAK ADA
 * perhitungan totalIncome/totalExpenses/netProfit).
 *
 * Checkpoint 1: CRUD dasar (delete sementara bebas tanpa lock — lock
 * ditambahkan di Checkpoint 2 setelah kolom division_id ada di 6 tabel).
 *
 * Catatan Arsitektur (sama dengan Projects):
 * - Divisi TIDAK bikin jurnal.
 * - status inactive menghilang dari dropdown transaksi BARU, dokumen lama
 *   yang masih tertandai tetap menampilkan tag-nya.
 */
import { and, asc, count, eq, ilike, isNull, or } from "drizzle-orm";
import db from "../db/index.js";
import {
  divisions,
  expenseClaims,
  journalEntries,
  payments,
  purchaseInvoices,
  receipts,
  salesInvoices,
  type DivisionStatus,
} from "../db/schema.js";
import { MANUAL_JOURNAL_SOURCE_MODULE } from "./JournalEntryRepository.js";

/** Error validasi Division (lock delete, tag divisi tidak valid) -> 400. */
export class DivisionValidationError extends Error {
  readonly statusCode = 400;
}

export interface DivisionRecord {
  id: string;
  businessId: string;
  name: string;
  code: string | null;
  status: DivisionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DivisionListOptions {
  page: number;
  pageSize: number;
  q?: string;
  status?: DivisionStatus;
}

export interface DivisionCreateInput {
  name: string;
  code?: string | null;
  status?: DivisionStatus;
}

export interface DivisionUpdateInput {
  name?: string;
  code?: string | null;
  status?: DivisionStatus;
}

function toRecord(row: {
  id: string;
  businessId: string;
  name: string;
  code: string | null;
  status: DivisionStatus;
  createdAt: Date;
  updatedAt: Date;
}): DivisionRecord {
  return { ...row, code: row.code ?? null };
}

export async function listDivisions(
  businessId: string,
  opts: DivisionListOptions,
): Promise<{ data: DivisionRecord[]; total: number }> {
  const conditions = [
    eq(divisions.businessId, businessId),
    isNull(divisions.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(ilike(divisions.name, pattern), ilike(divisions.code, pattern))!,
    );
  }

  if (opts.status) {
    conditions.push(eq(divisions.status, opts.status));
  }

  const where = and(...conditions);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: divisions.id,
        businessId: divisions.businessId,
        name: divisions.name,
        code: divisions.code,
        status: divisions.status,
        createdAt: divisions.createdAt,
        updatedAt: divisions.updatedAt,
      })
      .from(divisions)
      .where(where)
      .orderBy(asc(divisions.name))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db.select({ total: count() }).from(divisions).where(where),
  ]);

  return { data: rows.map(toRecord), total: totalRow?.total ?? 0 };
}

export async function getDivisionById(
  businessId: string,
  id: string,
): Promise<DivisionRecord | null> {
  const [row] = await db
    .select({
      id: divisions.id,
      businessId: divisions.businessId,
      name: divisions.name,
      code: divisions.code,
      status: divisions.status,
      createdAt: divisions.createdAt,
      updatedAt: divisions.updatedAt,
    })
    .from(divisions)
    .where(
      and(
        eq(divisions.id, id),
        eq(divisions.businessId, businessId),
        isNull(divisions.deletedAt),
      ),
    )
    .limit(1);

  return row ? toRecord(row) : null;
}

export async function createDivision(
  businessId: string,
  input: DivisionCreateInput,
): Promise<DivisionRecord> {
  const [created] = await db
    .insert(divisions)
    .values({
      businessId,
      name: input.name,
      code: input.code ?? null,
      status: input.status ?? "active",
    })
    .returning({ id: divisions.id });

  const record = await getDivisionById(businessId, created.id);
  if (!record) {
    throw new Error("Gagal mengambil data divisi yang baru dibuat");
  }
  return record;
}

export async function updateDivision(
  businessId: string,
  id: string,
  input: DivisionUpdateInput,
): Promise<DivisionRecord | null> {
  const existing = await getDivisionById(businessId, id);
  if (!existing) return null;

  const updateValues: Partial<typeof divisions.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateValues.name = input.name;
  if (input.code !== undefined) updateValues.code = input.code;
  if (input.status !== undefined) updateValues.status = input.status;

  await db
    .update(divisions)
    .set(updateValues)
    .where(
      and(
        eq(divisions.id, id),
        eq(divisions.businessId, businessId),
        isNull(divisions.deletedAt),
      ),
    );

  return getDivisionById(businessId, id);
}

/**
 * Checkpoint 1: delete sementara BEBAS tanpa lock. Checkpoint 2: diganti
 * implementasi ber-lock di bawah (menolak kalau masih ada dokumen aktif
 * bertag division_id di 6 tabel).
 */
export async function deleteDivision(
  businessId: string,
  id: string,
): Promise<boolean> {
  return deleteDivisionWithLock(businessId, id);
}

/**
 * Validasi penandaan divisi pada dokumen transaksi (MIRROR PERSIS
 * validateProjectAssignment; dipanggil dari repository/routes 6 modul).
 * `divisionId` = nilai yang dikirim body (undefined = tidak dikirim,
 * tidak divalidasi; null = lepas tag, selalu boleh). `currentDivisionId` =
 * tag yang SUDAH tersimpan di dokumen ini (khusus update) — kalau
 * divisionId baru SAMA dengan yang lama, boleh lolos walau divisinya
 * sekarang inactive (dokumen lama tidak boleh gagal diedit gara-gara
 * divisinya sudah tidak aktif).
 */
export async function validateDivisionAssignment(
  businessId: string,
  divisionId: string | null | undefined,
  currentDivisionId: string | null | undefined = null,
): Promise<string | null> {
  if (divisionId === undefined || divisionId === null) return null;

  const division = await getDivisionById(businessId, divisionId);
  if (!division) {
    return "Divisi tidak ditemukan atau bukan milik bisnis ini.";
  }
  if (division.status !== "active" && divisionId !== currentDivisionId) {
    return "Divisi harus berstatus aktif untuk ditandai pada dokumen ini.";
  }
  return null;
}

/** 6 tabel transaksi dokumen Divisions.md §4.2 yang punya kolom division_id. */
const DIVISION_TAGGED_TABLES = [
  { table: salesInvoices, label: "Sales Invoice" },
  { table: purchaseInvoices, label: "Purchase Invoice" },
  { table: receipts, label: "Receipt" },
  { table: payments, label: "Payment" },
  { table: expenseClaims, label: "Expense Claim" },
] as const;

/**
 * Checkpoint 2: soft-delete DENGAN lock — menolak (400) kalau masih ada
 * dokumen AKTIF di salah satu 6 tabel yang division_id-nya divisi ini,
 * termasuk jurnal manual aktif. MIRROR PERSIS deleteProject.
 */
export async function deleteDivisionWithLock(
  businessId: string,
  id: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: divisions.id })
      .from(divisions)
      .where(
        and(
          eq(divisions.id, id),
          eq(divisions.businessId, businessId),
          isNull(divisions.deletedAt),
        ),
      )
      .limit(1);
    if (!existing) return false;

    for (const { table, label } of DIVISION_TAGGED_TABLES) {
      const [row] = await tx
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.divisionId, id), isNull(table.deletedAt)))
        .limit(1);
      if (row) {
        throw new DivisionValidationError(
          `Divisi masih punya dokumen aktif (${label}), tidak bisa dihapus.`,
        );
      }
    }

    const [manualJournal] = await tx
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.divisionId, id),
          eq(journalEntries.sourceModule, MANUAL_JOURNAL_SOURCE_MODULE),
          isNull(journalEntries.deletedAt),
        ),
      )
      .limit(1);
    if (manualJournal) {
      throw new DivisionValidationError(
        "Divisi masih punya jurnal manual aktif, tidak bisa dihapus.",
      );
    }

    const rows = await tx
      .update(divisions)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(divisions.id, id),
          eq(divisions.businessId, businessId),
          isNull(divisions.deletedAt),
        ),
      )
      .returning({ id: divisions.id });

    return rows.length > 0;
  });
}
