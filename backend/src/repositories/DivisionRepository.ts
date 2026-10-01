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
import { divisions, type DivisionStatus } from "../db/schema.js";

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
 * Checkpoint 1: delete sementara BEBAS tanpa lock. Checkpoint 2 (setelah
 * kolom division_id ada di 6 tabel) mengganti implementasi ini dengan
 * versi yang menolak hapus kalau masih ada dokumen aktif bertag.
 */
export async function deleteDivision(
  businessId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
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
}
