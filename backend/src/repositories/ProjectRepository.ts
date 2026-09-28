/**
 * ProjectRepository — Modul Proyek (Bagian A: CRUD Dasar + Bagian B: tagging
 * + Bagian C: agregat keuangan real-time).
 *
 * Catatan Arsitektur:
 * - Proyek itu sendiri TIDAK bikin jurnal.
 * - totalIncome/totalExpenses/netProfit DIHITUNG dari jurnal milik dokumen
 *   yang di-tag proyek ini (lihat getProjectTotals): jurnal AKTIF dari
 *   sales_invoices/receipts (Revenue) + purchase_invoices/payments/
 *   expense_claims (Expense) yang project_id-nya proyek ini, DITAMBAH
 *   jurnal manual yang project_id-nya langsung proyek ini.
 * - delete: menolak kalau masih ada dokumen AKTIF di salah satu 6 tabel
 *   transaksi yang project_id-nya proyek ini (termasuk jurnal manual
 *   aktif).
 */
import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import db from "../db/index.js";
import {
  contacts,
  expenseClaims,
  journalEntries,
  payments,
  projects,
  purchaseInvoices,
  receipts,
  salesInvoices,
  type ProjectStatus,
} from "../db/schema.js";
import { MANUAL_JOURNAL_SOURCE_MODULE } from "./JournalEntryRepository.js";

/** Error validasi Project (lock delete, tag proyek tidak valid) -> 400. */
export class ProjectValidationError extends Error {
  readonly statusCode = 400;
}

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

function toRecord(
  row: {
    id: string;
    businessId: string;
    name: string;
    code: string | null;
    customerId: string | null;
    customerName: string | null;
    status: ProjectStatus;
    createdAt: Date;
    updatedAt: Date;
  },
  totals?: { income: number; expenses: number },
): ProjectRecord {
  // Numeric Postgres datang sebagai STRING — Number() eksplisit
  // (pelajaran #2). totals selalu ada dari getProjectTotals.
  const totalIncome = Number(totals?.income ?? 0);
  const totalExpenses = Number(totals?.expenses ?? 0);
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    code: row.code ?? null,
    customerId: row.customerId ?? null,
    customerName: row.customerName ?? null,
    status: row.status,
    totalIncome,
    totalExpenses,
    netProfit: totalIncome - totalExpenses,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Agregat keuangan per proyek dalam 1 query (GROUP BY project).
 *
 * Aturan hitung (keputusan desain, dicatat di Projects.md §4.3): jurnal
 * AKTIF (journal_entries.deleted_at IS NULL) dari dokumen sumber yang
 * project_id-nya proyek target dan dokumennya belum di-soft-delete —
 * dihubungkan lewat source_module + source_id — DITAMBAH jurnal manual
 * yang project_id-nya langsung proyek target. Dari situ:
 * - totalIncome = Σ(credit − debit) baris akun kategori 'Revenue'
 * - totalExpenses = Σ(debit − credit) baris akun kategori 'Expense'
 * Kategori lain (Asset/Liability/Equity) TIDAK dihitung.
 *
 * SQL ditulis mentah dengan nama tabel/kolom eksplisit (pelajaran #1:
 * interpolasi kolom Drizzle ke sql mentah tidak ter-qualify). Nilai
 * dinamis (businessId, daftar id) tetap jadi parameter query.
 */
export async function getProjectTotals(
  businessId: string,
  projectIds: string[],
): Promise<Map<string, { income: number; expenses: number }>> {
  const result = new Map<string, { income: number; expenses: number }>();
  if (projectIds.length === 0) return result;

  const executed = await db.execute(sql`
    SELECT agg.project_id AS project_id,
      COALESCE(SUM(CASE WHEN agg.category = 'Revenue' THEN agg.credit - agg.debit ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN agg.category = 'Expense' THEN agg.debit - agg.credit ELSE 0 END), 0) AS expenses
    FROM (
      SELECT si.project_id, l.credit, l.debit, coa.category, si.business_id AS biz
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.journal_entry_id
      JOIN sales_invoices si ON si.id = je.source_id
      JOIN chart_of_accounts coa ON coa.id = l.account_id
      WHERE je.source_module = 'sales_invoice' AND je.deleted_at IS NULL
        AND si.deleted_at IS NULL AND si.project_id IS NOT NULL AND coa.category = 'Revenue'
      UNION ALL
      SELECT r.project_id, l.credit, l.debit, coa.category, r.business_id AS biz
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.journal_entry_id
      JOIN receipts r ON r.id = je.source_id
      JOIN chart_of_accounts coa ON coa.id = l.account_id
      WHERE je.source_module = 'receipt' AND je.deleted_at IS NULL
        AND r.deleted_at IS NULL AND r.project_id IS NOT NULL AND coa.category = 'Revenue'
      UNION ALL
      SELECT pi.project_id, l.credit, l.debit, coa.category, pi.business_id AS biz
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.journal_entry_id
      JOIN purchase_invoices pi ON pi.id = je.source_id
      JOIN chart_of_accounts coa ON coa.id = l.account_id
      WHERE je.source_module = 'purchase_invoice' AND je.deleted_at IS NULL
        AND pi.deleted_at IS NULL AND pi.project_id IS NOT NULL AND coa.category = 'Expense'
      UNION ALL
      SELECT p.project_id, l.credit, l.debit, coa.category, p.business_id AS biz
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.journal_entry_id
      JOIN payments p ON p.id = je.source_id
      JOIN chart_of_accounts coa ON coa.id = l.account_id
      WHERE je.source_module = 'payment' AND je.deleted_at IS NULL
        AND p.deleted_at IS NULL AND p.project_id IS NOT NULL AND coa.category = 'Expense'
      UNION ALL
      SELECT ec.project_id, l.credit, l.debit, coa.category, ec.business_id AS biz
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.journal_entry_id
      JOIN expense_claims ec ON ec.id = je.source_id
      JOIN chart_of_accounts coa ON coa.id = l.account_id
      WHERE je.source_module = 'expense_claim' AND je.deleted_at IS NULL
        AND ec.deleted_at IS NULL AND ec.project_id IS NOT NULL AND coa.category = 'Expense'
      UNION ALL
      SELECT je.project_id, l.credit, l.debit, coa.category, je.business_id AS biz
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.journal_entry_id
      JOIN chart_of_accounts coa ON coa.id = l.account_id
      WHERE je.source_module = 'manual_journal' AND je.deleted_at IS NULL
        AND je.project_id IS NOT NULL
    ) agg
    WHERE agg.biz = ${businessId}
      AND agg.project_id IN (${sql.join(
        projectIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    GROUP BY agg.project_id
  `);
  const rows = executed.rows as unknown as {
    project_id: string;
    income: string;
    expenses: string;
  }[];

  for (const r of rows) {
    result.set(r.project_id, {
      income: Number(r.income),
      expenses: Number(r.expenses),
    });
  }
  return result;
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

  // 1 query agregat untuk SELURUH proyek di halaman ini (bukan per proyek).
  const totals = await getProjectTotals(
    businessId,
    rows.map((r) => r.id),
  );

  return {
    data: rows.map((r) => toRecord(r, totals.get(r.id))),
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

  if (!row) return null;

  const totals = await getProjectTotals(businessId, [row.id]);
  return toRecord(row, totals.get(row.id));
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

/**
 * Validasi penandaan proyek pada dokumen transaksi (dipanggil dari
 * repository ke-6 modul di §4.2 dokumen Projects). `projectId` = nilai yang
 * dikirim body (undefined = tidak dikirim, tidak divalidasi; null = lepas
 * tag, selalu boleh). `currentProjectId` = tag yang SUDAH tersimpan di
 * dokumen ini (khusus update) — kalau projectId baru SAMA dengan yang lama,
 * boleh lolos walau proyeknya sekarang inactive/completed (dokumen lama
 * tidak boleh gagal diedit gara-gara proyeknya sudah tidak aktif).
 */
export async function validateProjectAssignment(
  businessId: string,
  projectId: string | null | undefined,
  currentProjectId: string | null | undefined = null,
): Promise<string | null> {
  if (projectId === undefined || projectId === null) return null;

  const project = await getProjectById(businessId, projectId);
  if (!project) {
    return "Proyek tidak ditemukan atau bukan milik bisnis ini.";
  }
  if (project.status !== "active" && projectId !== currentProjectId) {
    return "Proyek harus berstatus aktif untuk ditandai pada dokumen ini.";
  }
  return null;
}

/** 6 tabel transaksi §4.2 dokumen Projects yang punya kolom project_id. */
const PROJECT_TAGGED_TABLES = [
  { table: salesInvoices, label: "Sales Invoice" },
  { table: purchaseInvoices, label: "Purchase Invoice" },
  { table: receipts, label: "Receipt" },
  { table: payments, label: "Payment" },
  { table: expenseClaims, label: "Expense Claim" },
] as const;

export async function deleteProject(
  businessId: string,
  id: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, id),
          eq(projects.businessId, businessId),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    if (!existing) return false;

    for (const { table, label } of PROJECT_TAGGED_TABLES) {
      const [row] = await tx
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.projectId, id), isNull(table.deletedAt)))
        .limit(1);
      if (row) {
        throw new ProjectValidationError(
          `Proyek masih punya dokumen aktif (${label}), tidak bisa dihapus.`,
        );
      }
    }

    const [manualJournal] = await tx
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.projectId, id),
          eq(journalEntries.sourceModule, MANUAL_JOURNAL_SOURCE_MODULE),
          isNull(journalEntries.deletedAt),
        ),
      )
      .limit(1);
    if (manualJournal) {
      throw new ProjectValidationError(
        "Proyek masih punya jurnal manual aktif, tidak bisa dihapus.",
      );
    }

    const rows = await tx
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
  });
}
