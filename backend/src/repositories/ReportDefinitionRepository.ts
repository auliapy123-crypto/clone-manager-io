/**
 * ReportDefinitionRepository — CRUD definisi laporan tersimpan (soft-delete).
 * Isi laporan TIDAK disimpan; dihitung ReportQueryRepository saat dibuka.
 */
import { and, asc, count, eq, ilike, isNull } from "drizzle-orm";
import db from "../db/index.js";
import {
  reportDefinitions,
  chartOfAccounts,
  customFieldDefinitions,
  type ReportType,
} from "../db/schema.js";
import { CreateReportDefinitionSchema, REPORT_NAMES } from "../schemas/ReportDefinition.js";
import type {
  CreateReportDefinitionInput,
  UpdateReportDefinitionInput,
} from "../schemas/ReportDefinition.js";

export interface ReportDefinitionRecord {
  id: string;
  businessId: string;
  type: ReportType;
  title: string;
  description: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  asOfDate: string | null;
  accountId: string | null;
  customFieldId: string | null;
  sortBy: string | null;
  showInvoices: boolean;
  accountingMethod: string;
  showAccountCodes: boolean;
  excludeZeroBalances: boolean;
  footer: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toRecord(row: typeof reportDefinitions.$inferSelect): ReportDefinitionRecord {
  let customFieldId: string | null = null;
  if (row.type === "sales_invoice_totals_by_custom_field") {
    try { customFieldId = JSON.parse(row.description ?? "{}").customFieldId ?? null; } catch { /* result validation rejects invalid stored parameters */ }
  }
  return {
    id: row.id,
    businessId: row.businessId,
    type: row.type,
    title: row.title,
    description: row.type === "sales_invoice_totals_by_custom_field" ? null : row.description ?? null,
    customFieldId,
    // kolom date di Drizzle mode string -> sudah "YYYY-MM-DD"
    dateFrom: row.dateFrom ?? null,
    dateTo: row.dateTo ?? null,
    asOfDate: row.asOfDate ?? null,
    accountId: row.accountId ?? null,
    sortBy: row.sortBy ?? null,
    showInvoices: row.showInvoices ?? false,
    accountingMethod: row.accountingMethod,
    showAccountCodes: row.showAccountCodes,
    excludeZeroBalances: row.excludeZeroBalances,
    footer: row.footer ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listReportDefinitions(
  businessId: string,
  opts: { page: number; pageSize: number; q?: string; type?: ReportType },
): Promise<{ data: ReportDefinitionRecord[]; total: number }> {
  const conditions = [
    eq(reportDefinitions.businessId, businessId),
    isNull(reportDefinitions.deletedAt),
  ];
  if (opts.type) conditions.push(eq(reportDefinitions.type, opts.type));
  if (opts.q) conditions.push(ilike(reportDefinitions.title, `%${opts.q}%`));
  const where = and(...conditions);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(reportDefinitions)
      .where(where)
      .orderBy(asc(reportDefinitions.title))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db.select({ total: count() }).from(reportDefinitions).where(where),
  ]);
  return { data: rows.map(toRecord), total: totalRow?.total ?? 0 };
}

export async function getReportDefinitionById(
  businessId: string,
  id: string,
): Promise<ReportDefinitionRecord | null> {
  const [row] = await db
    .select()
    .from(reportDefinitions)
    .where(
      and(
        eq(reportDefinitions.id, id),
        eq(reportDefinitions.businessId, businessId),
        isNull(reportDefinitions.deletedAt),
      ),
    )
    .limit(1);
  return row ? toRecord(row) : null;
}

export async function createReportDefinition(
  businessId: string,
  input: CreateReportDefinitionInput,
): Promise<ReportDefinitionRecord> {
  const title = (input.title || REPORT_NAMES[input.type as keyof typeof REPORT_NAMES] || input.type).trim();
  await validateReportCustomField(businessId, input.customFieldId);
  const [created] = await db
    .insert(reportDefinitions)
    .values({
      businessId,
      type: input.type,
      title,
      description: input.customFieldId ? JSON.stringify({ customFieldId: input.customFieldId }) : input.description ?? null,
      // Field tanggal yang tidak relevan untuk tipe DIABAIKAN (Report.md §3).
      dateFrom:
        input.dateFrom,
      dateTo: input.dateTo,
      asOfDate: input.asOfDate,
      accountId: input.accountId,
      sortBy: input.sortBy,
      showInvoices: input.showInvoices,
      accountingMethod: input.accountingMethod,
      showAccountCodes: input.showAccountCodes ?? false,
      excludeZeroBalances: input.excludeZeroBalances ?? false,
      footer: input.footer ?? null,
    })
    .returning({ id: reportDefinitions.id });
  const record = await getReportDefinitionById(businessId, created.id);
  if (!record) throw new Error("Gagal mengambil definisi laporan yang baru dibuat.");
  return record;
}

export async function updateReportDefinition(
  businessId: string,
  id: string,
  input: UpdateReportDefinitionInput,
): Promise<ReportDefinitionRecord | null> {
  const existing = await getReportDefinitionById(businessId, id);
  if (!existing) return null;

  const parsed = CreateReportDefinitionSchema.safeParse({ ...existing, ...input });
  if (!parsed.success) throw Object.assign(new Error(parsed.error.issues[0].message), { statusCode: 400 });
  await validateReportAccount(businessId, parsed.data.accountId);
  await validateReportCustomField(businessId, parsed.data.customFieldId);
  const { customFieldId, ...parameters } = parsed.data;
  const updateValues = { ...parameters,
    description: customFieldId ? JSON.stringify({ customFieldId }) : parameters.description,
    updatedAt: new Date() };

  await db
    .update(reportDefinitions)
    .set(updateValues)
    .where(
      and(
        eq(reportDefinitions.id, id),
        eq(reportDefinitions.businessId, businessId),
        isNull(reportDefinitions.deletedAt),
      ),
    );
  return getReportDefinitionById(businessId, id);
}

export async function validateReportAccount(businessId: string, accountId: string | null | undefined) {
  if (!accountId) return;
  const [account] = await db.select({ id: chartOfAccounts.id }).from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.businessId, businessId), isNull(chartOfAccounts.deletedAt))).limit(1);
  if (!account) throw Object.assign(new Error("Akun tidak ditemukan dalam bisnis ini."), { statusCode: 400 });
}

export async function validateReportCustomField(businessId: string, id: string | null | undefined) {
  if (!id) return null;
  const [field] = await db.select({ label: customFieldDefinitions.label, fieldType: customFieldDefinitions.fieldType })
    .from(customFieldDefinitions).where(and(eq(customFieldDefinitions.id, id),
      eq(customFieldDefinitions.businessId, businessId), eq(customFieldDefinitions.entityType, "sales_invoice"),
      isNull(customFieldDefinitions.deletedAt))).limit(1);
  if (!field) throw Object.assign(new Error("Custom Field faktur penjualan tidak ditemukan dalam bisnis ini."), { statusCode: 400 });
  return field;
}

export async function deleteReportDefinition(
  businessId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .update(reportDefinitions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(reportDefinitions.id, id),
        eq(reportDefinitions.businessId, businessId),
        isNull(reportDefinitions.deletedAt),
      ),
    )
    .returning({ id: reportDefinitions.id });
  return rows.length > 0;
}
