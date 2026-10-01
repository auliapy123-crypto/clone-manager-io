import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import {
  getHistoryDetail,
  listHistory,
  type HistoryFilters,
} from "../repositories/AuditLogRepository.js";
import { BusinessIdParamsSchema } from "../schemas/Business.js";
import {
  createDataResponseSchema,
  createPaginatedResponseSchema,
  Forbidden,
  InternalServerError,
  NotFound,
  Unauthorized,
} from "../schemas/globals.js";
import {
  HistoryDetailResponseSchema,
  HistoryEntryResponseSchema,
  HistoryIdParamsSchema,
  HistoryListQuerySchema,
} from "../schemas/History.js";

/**
 * History (jejak audit) — MURNI READ-ONLY di atas tabel audit_logs yang
 * sudah ada. TIDAK ADA create/update/delete (append-only), GET saja dan
 * boleh semua role (admin/accountant/viewer). Tidak ada audit log baru
 * dari modul ini — membaca jejak tidak menulis jejak.
 */
export async function historyRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/history",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.HISTORY_READ),
      ],
      schema: {
        tags: ["History"],
        operationId: "listHistory",
        summary: "Daftar jejak audit (filter tanggal/modul/user/aksi)",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: HistoryListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(HistoryEntryResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, dateFrom, dateTo, entityType, userId, action } =
        request.query;
      const filters: HistoryFilters = {
        dateFrom,
        dateTo,
        entityType,
        userId,
        action,
      };
      const { data, total } = await listHistory(request.params.businessId, {
        page,
        pageSize,
        filters,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/history/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.HISTORY_READ),
      ],
      schema: {
        tags: ["History"],
        operationId: "getHistoryDetail",
        summary: "Detail 1 jejak audit (old_values/new_values lengkap)",
        security: [{ bearerAuth: [] }],
        params: HistoryIdParamsSchema,
        response: {
          200: createDataResponseSchema(HistoryDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const entry = await getHistoryDetail(
        request.params.businessId,
        request.params.id,
      );
      return entry
        ? sendData(reply, entry)
        : sendError(
            reply,
            404,
            ErrorCode.NOT_FOUND,
            "Jejak audit tidak ditemukan.",
          );
    },
  );
}

export default historyRoutesPlugin;
