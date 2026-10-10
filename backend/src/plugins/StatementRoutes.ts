/**
 * StatementRoutes — Customer/Supplier Statements (Report §12, Tahap 2b).
 *
 * READ-ONLY total: TIDAK ada endpoint tulis, TIDAK ada baris
 * `report_definitions`, TIDAK ada audit tulis, TIDAK posting jurnal.
 * Hanya butuh RBAC `report:read` (viewer boleh membuka laporan).
 */
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError } from "../libs/reply.js";
import {
  findStatementContact,
  getStatementDetail,
  listStatements,
} from "../repositories/StatementQueryRepository.js";
import {
  BadRequest,  createDataResponseSchema,
  Forbidden,
  InternalServerError,
  NotFound,
  Unauthorized,
} from "../schemas/globals.js";
import {
  isUnpaidStatement,
  isSupplierStatement,
  StatementContactParamsSchema,
  StatementDetailQuerySchema,
  StatementDetailResultSchema,
  StatementListQuerySchema,
  StatementListResponseSchema,
  StatementTypeParamsSchema,
  type StatementType,
} from "../schemas/Statement.js";

/** Parameter wajib berbeda per tipe (§12.2); satu tanggal vs periode from..to. */
function validateStatementParams(
  type: StatementType,
  asOfDate?: string,
  dateFrom?: string,
  dateTo?: string,
): string | null {
  if (isUnpaidStatement(type)) {
    if (!asOfDate) return "Tanggal (as of) wajib diisi untuk statement Unpaid Invoices.";
    return null;
  }
  if (!dateFrom || !dateTo) return "Dari dan Sampai wajib diisi untuk statement Transactions.";
  if (dateFrom > dateTo) return "Tanggal Dari tidak boleh lebih besar dari Sampai.";
  return null;
}

export async function statementRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [fastify.requireAuth, fastify.requireBusinessScopeParam];

  app.get(
    "/businesses/:businessId/statements/:type",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.REPORT_READ)],
      schema: {
        tags: ["Reports"],
        operationId: "listStatements",
        summary: "Daftar kontak statement (unpaid / transactions) — read-only, tanpa definisi",
        security: [{ bearerAuth: [] }],
        params: StatementTypeParamsSchema,
        querystring: StatementListQuerySchema,
        response: {
          200: StatementListResponseSchema,
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, type } = request.params;
      const { page, pageSize, q, asOfDate, dateFrom, dateTo } = request.query;
      const invalid = validateStatementParams(type, asOfDate, dateFrom, dateTo);
      if (invalid) return sendError(reply, 400, ErrorCode.BAD_REQUEST, invalid);

      const result = await listStatements(businessId, type, {
        asOfDate,
        dateFrom,
        dateTo,
        page,
        pageSize,
        q,
      });
      return reply.send({
        data: result.rows,
        pagination: {
          total: result.total,
          currentPage: page,
          totalPages: Math.ceil(result.total / pageSize),
          pageSize,
        },
        headerDate: result.headerDate,
        totals: result.totals,
      });
    },
  );

  app.get(
    "/businesses/:businessId/statements/:type/:contactId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.REPORT_READ)],
      schema: {
        tags: ["Reports"],
        operationId: "getStatementDetail",
        summary: "Detail statement satu kontak — read-only, tanpa definisi",
        security: [{ bearerAuth: [] }],
        params: StatementContactParamsSchema,
        querystring: StatementDetailQuerySchema,
        response: {
          200: createDataResponseSchema(StatementDetailResultSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, type, contactId } = request.params;
      const { asOfDate, dateFrom, dateTo } = request.query;
      const invalid = validateStatementParams(type, asOfDate, dateFrom, dateTo);
      if (invalid) return sendError(reply, 400, ErrorCode.BAD_REQUEST, invalid);

      // Kontak harus ada, satu bisnis, belum dihapus, dan berperan sesuai sisi
      // statement; kontak bisnis lain / peran salah -> 404, bukan 500 atau bocor.
      const contact = await findStatementContact(businessId, isSupplierStatement(type), contactId);
      if (!contact) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Kontak tidak ditemukan.");
      }

      const result = await getStatementDetail(businessId, type, contact, {
        asOfDate,
        dateFrom,
        dateTo,
      });
      return sendData(reply, result);
    },
  );
}

export default statementRoutesPlugin;
