import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

/**
 * History (Jejak Audit) — MURNI READ-ONLY di atas tabel audit_logs yang
 * sudah ada. TIDAK ADA create/update/delete dari modul ini.
 *
 * Struktur tabel ASLI di Neon (terverifikasi): id, business_id (nullable),
 * user_id (nullable), action (CREATE/UPDATE/DELETE), entity_type,
 * entity_id, old_values (jsonb, nullable), new_values (jsonb, nullable),
 * created_at.
 */
export const HistoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
  userId: z.string().uuid().optional(),
  action: z.enum(["CREATE", "UPDATE", "DELETE"]).optional(),
});

export const HistoryIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid(),
});

export const HistoryEntryResponseSchema = z.object({
  id: z.string(),
  businessId: z.string().nullable(),
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  userEmail: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  createdAt: z.date(),
});

export const HistoryDetailResponseSchema = HistoryEntryResponseSchema.extend({
  oldValues: z.record(z.string(), z.unknown()).nullable(),
  newValues: z.record(z.string(), z.unknown()).nullable(),
});
