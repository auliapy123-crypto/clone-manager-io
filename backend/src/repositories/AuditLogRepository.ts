/**
 * AuditLogRepository (Guide §3.2 + §7.2).
 *
 * Dipanggil oleh hook `onResponse` di AuthMiddleware untuk mencatat setiap
 * request non-GET yang berhasil. Tabel `audit_logs` bersifat append-only —
 * tidak ada update maupun delete di sini.
 */
import { and, desc, eq, count, gte, lte } from "drizzle-orm";
import db from "../db/index.js";
import { auditLogs, users, type AuditAction } from "../db/schema.js";

export interface AuditLogInput {
  businessId: string | null;
  userId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

export async function createAuditLog(input: AuditLogInput): Promise<void> {
  await db.insert(auditLogs).values({
    businessId: input.businessId,
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    oldValues: input.oldValues ?? null,
    newValues: input.newValues ?? null,
  });
}

export async function listAuditLogsByBusiness(
  businessId: string,
  opts: { page: number; pageSize: number },
) {
  const where = eq(auditLogs.businessId, businessId);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db.select({ total: count() }).from(auditLogs).where(where),
  ]);

  return {
    data: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    total: totalRow?.total ?? 0,
  };
}

export async function getAuditLogsForEntity(
  businessId: string,
  entityType: string,
  entityId: string,
) {
  const rows = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.businessId, businessId),
        eq(auditLogs.entityType, entityType),
        eq(auditLogs.entityId, entityId),
      ),
    )
    .orderBy(desc(auditLogs.createdAt));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------
// History (modul read-only) — baca audit_logs dengan nama/email user
// (LEFT JOIN users; user_id bisa NULL) + filter opsional. Struktur
// tabel terverifikasi langsung di Neon (bukan asumsi).
// ---------------------------------------------------------------------
export interface HistoryFilters {
  dateFrom?: string; // YYYY-MM-DD (inklusif, 00:00 lokal server)
  dateTo?: string; // YYYY-MM-DD (inklusif, sampai 23:59:59.999)
  entityType?: string;
  userId?: string;
  action?: AuditAction;
}

export interface HistoryListOptions {
  page: number;
  pageSize: number;
  filters: HistoryFilters;
}

export interface HistoryEntryRecord {
  id: string;
  businessId: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
}

export interface HistoryDetailRecord extends HistoryEntryRecord {
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
}

const historySelection = {
  id: auditLogs.id,
  businessId: auditLogs.businessId,
  userId: auditLogs.userId,
  userName: users.name,
  userEmail: users.email,
  action: auditLogs.action,
  entityType: auditLogs.entityType,
  entityId: auditLogs.entityId,
  createdAt: auditLogs.createdAt,
};

export async function listHistory(
  businessId: string,
  opts: HistoryListOptions,
): Promise<{ data: HistoryEntryRecord[]; total: number }> {
  const { filters } = opts;
  const conditions = [eq(auditLogs.businessId, businessId)];
  if (filters.dateFrom) {
    conditions.push(gte(auditLogs.createdAt, new Date(`${filters.dateFrom}T00:00:00`)));
  }
  if (filters.dateTo) {
    conditions.push(lte(auditLogs.createdAt, new Date(`${filters.dateTo}T23:59:59.999`)));
  }
  if (filters.entityType) {
    conditions.push(eq(auditLogs.entityType, filters.entityType));
  }
  if (filters.userId) {
    conditions.push(eq(auditLogs.userId, filters.userId));
  }
  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action));
  }

  const where = and(...conditions);
  const baseQuery = db
    .select(historySelection)
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(desc(auditLogs.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    // Count tanpa join: filter tidak menyentuh users dan LEFT JOIN ke
    // users.id (unique) tidak mengubah jumlah baris.
    db.select({ total: count() }).from(auditLogs).where(where),
  ]);

  return { data: rows, total: totalRow?.total ?? 0 };
}

export async function getHistoryDetail(
  businessId: string,
  entryId: string,
): Promise<HistoryDetailRecord | null> {
  const [row] = await db
    .select({
      ...historySelection,
      oldValues: auditLogs.oldValues,
      newValues: auditLogs.newValues,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(
      and(
        eq(auditLogs.businessId, businessId),
        eq(auditLogs.id, entryId),
      ),
    )
    .limit(1);

  return row ?? null;
}
