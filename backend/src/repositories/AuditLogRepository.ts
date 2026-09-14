/**
 * AuditLogRepository (Guide §3.2 + §7.2).
 *
 * Dipanggil oleh hook `onResponse` di AuthMiddleware untuk mencatat setiap
 * request non-GET yang berhasil. Tabel `audit_logs` bersifat append-only —
 * tidak ada update maupun delete di sini.
 */
import { and, desc, eq, count } from "drizzle-orm";
import db from "../db/index.js";
import { auditLogs, type AuditAction } from "../db/schema.js";

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
