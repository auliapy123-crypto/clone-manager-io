/**
 * ProjectRepository — Modul Proyek (Bagian A: CRUD Dasar).
 *
 * Catatan Arsitektur:
 * - Proyek itu sendiri TIDAK bikin jurnal.
 * - Untuk Bagian A: totalIncome, totalExpenses, dan netProfit SELALU 0
 *   (placeholder, akan diisi di Bagian B/C saat tagging transaksi aktif).
 * - delete: soft-delete tanpa validasi lock untuk Bagian A karena kolom
 *   project_id pada 6 tabel transaksi belum ada. Validasi lock akan
 *   diaktifkan di Bagian B.
 */
import { and, asc, count, eq, ilike, isNull, or } from "drizzle-orm";
import db from "../db/index.js";
import { contacts, projects, type ProjectStatus } from "../db/schema.js";

export interface ProjectRecord {
  id: string;
  businessId: string;
  name: string;
  code: string | null;
  customerId: string | null;
  customerName: string | null;
  status: ProjectStatus;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectListOptions {
  page: number;
  pageSize: number;
  q?: string;
  status?: ProjectStatus;
}

export interface ProjectCreateInput {
  name: string;
  code?: string | null;
  customerId?: string | null;
  status?: ProjectStatus;
}

export interface ProjectUpdateInput {
  name?: string;
  code?: string | null;
  customerId?: string | null;
  status?: ProjectStatus;
}

function toRecord(row: {
  id: string;
  businessId: string;
  name: string;
  code: string | null;
  customerId: string | null;
  customerName: string | null;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}): ProjectRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    code: row.code ?? null,
    customerId: row.customerId ?? null,
    customerName: row.customerName ?? null,
    status: row.status,
    totalIncome: Number(0),
    totalExpenses: Number(0),
    netProfit: Number(0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listProjects(
  businessId: string,
  opts: ProjectListOptions,
): Promise<{ data: ProjectRecord[]; total: number }> {
  const conditions = [
    eq(projects.businessId, businessId),
    isNull(projects.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(ilike(projects.name, pattern), ilike(projects.code, pattern))!,
    );
  }

  if (opts.status) {
    conditions.push(eq(projects.status, opts.status));
  }

  const where = and(...conditions);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: projects.id,
        businessId: projects.businessId,
        name: projects.name,
        code: projects.code,
        customerId: projects.customerId,
        customerName: contacts.name,
        status: projects.status,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .leftJoin(
        contacts,
        and(eq(projects.customerId, contacts.id), isNull(contacts.deletedAt)),
      )
      .where(where)
      .orderBy(asc(projects.name))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db.select({ total: count() }).from(projects).where(where),
  ]);

  return {
    data: rows.map(toRecord),
    total: totalRow?.total ?? 0,
  };
}

export async function getProjectById(
  businessId: string,
  id: string,
): Promise<ProjectRecord | null> {
  const [row] = await db
    .select({
      id: projects.id,
      businessId: projects.businessId,
      name: projects.name,
      code: projects.code,
      customerId: projects.customerId,
      customerName: contacts.name,
      status: projects.status,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .leftJoin(
      contacts,
      and(eq(projects.customerId, contacts.id), isNull(contacts.deletedAt)),
    )
    .where(
      and(
        eq(projects.id, id),
        eq(projects.businessId, businessId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);

  return row ? toRecord(row) : null;
}

export async function createProject(
  businessId: string,
  input: ProjectCreateInput,
): Promise<ProjectRecord> {
  const [created] = await db
    .insert(projects)
    .values({
      businessId,
      name: input.name,
      code: input.code ?? null,
      customerId: input.customerId ?? null,
      status: input.status ?? "active",
    })
    .returning({ id: projects.id });

  const record = await getProjectById(businessId, created.id);
  if (!record) {
    throw new Error("Gagal mengambil data proyek yang baru dibuat");
  }
  return record;
}

export async function updateProject(
  businessId: string,
  id: string,
  input: ProjectUpdateInput,
): Promise<ProjectRecord | null> {
  const existing = await getProjectById(businessId, id);
  if (!existing) return null;

  const updateValues: Partial<typeof projects.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateValues.name = input.name;
  if (input.code !== undefined) updateValues.code = input.code;
  if (input.customerId !== undefined) updateValues.customerId = input.customerId;
  if (input.status !== undefined) updateValues.status = input.status;

  await db
    .update(projects)
    .set(updateValues)
    .where(
      and(
        eq(projects.id, id),
        eq(projects.businessId, businessId),
        isNull(projects.deletedAt),
      ),
    );

  return getProjectById(businessId, id);
}

export async function deleteProject(
  businessId: string,
  id: string,
): Promise<boolean> {
  // Catatan Bagian A: Validasi lock terhadap 6 tabel transaksi akan diaktifkan
  // di Bagian B saat kolom project_id sudah ditambahkan ke tabel-tabel tersebut.
  const rows = await db
    .update(projects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(projects.id, id),
        eq(projects.businessId, businessId),
        isNull(projects.deletedAt),
      ),
    )
    .returning({ id: projects.id });

  return rows.length > 0;
}
