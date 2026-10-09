import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import {
  computeBalanceSheet,
  computeProfitAndLoss,
  computeTrialBalance,
  computeGeneralLedgerSummary,
  computeGeneralLedgerTransactions,
  computeAgedReceivables,
  computeAgedPayables,
  computeContactSummary,
  computeSalesInvoiceTotalsByCustomer,
  computeSalesInvoiceTotalsByItem,
  computeSalesInvoiceTotalsByCustomField,
  computeBillableTimeSummary,
  computeReceiptsPaymentsSummary,
} from "../repositories/ReportQueryRepository.js";
import {
  createReportDefinition,
  deleteReportDefinition,
  getReportDefinitionById,
  listReportDefinitions,
  updateReportDefinition,
  validateReportAccount,
  validateReportCustomField,
} from "../repositories/ReportDefinitionRepository.js";
import { BusinessIdParamsSchema } from "../schemas/Business.js";
import {
  BadRequest,
  createDataResponseSchema,
  createPaginatedResponseSchema,
  Forbidden,
  InternalServerError,
  MessageResponseSchema,
  NotFound,
  Unauthorized,
} from "../schemas/globals.js";
import {
  CreateReportDefinitionSchema,
  ReportDefinitionIdParamsSchema,
  ReportDefinitionListQuerySchema,
  ReportDefinitionResponseSchema,
  ReportResultSchema,
  UpdateReportDefinitionSchema,
} from "../schemas/ReportDefinition.js";

export async function reportRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/report-definitions",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.REPORT_READ),
      ],
      schema: {
        tags: ["Reports"],
        operationId: "listReportDefinitions",
        summary: "Daftar definisi laporan tersimpan per bisnis",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: ReportDefinitionListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(ReportDefinitionResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q, type } = request.query;
      const { data, total } = await listReportDefinitions(
        request.params.businessId,
        { page, pageSize, q, type },
      );
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.post(
    "/businesses/:businessId/report-definitions",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.REPORT_WRITE),
      ],
      schema: {
        tags: ["Reports"],
        operationId: "createReportDefinition",
        summary: "Buat definisi laporan baru",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateReportDefinitionSchema,
        response: {
          201: createDataResponseSchema(ReportDefinitionResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const definition = await createReportDefinition(
        request.params.businessId,
        request.body,
      );
      request.audit = {
        action: "CREATE",
        entityType: "report_definitions",
        entityId: definition.id,
        newValues: { type: definition.type, title: definition.title },
      };
      return sendData(reply, definition, 201);
    },
  );

  app.get(
    "/businesses/:businessId/report-definitions/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.REPORT_READ),
      ],
      schema: {
        tags: ["Reports"],
        operationId: "getReportDefinition",
        summary: "Detail definisi laporan",
        security: [{ bearerAuth: [] }],
        params: ReportDefinitionIdParamsSchema,
        response: {
          200: createDataResponseSchema(ReportDefinitionResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const definition = await getReportDefinitionById(
        request.params.businessId,
        request.params.id,
      );
      return definition
        ? sendData(reply, definition)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Definisi laporan tidak ditemukan.");
    },
  );

  app.put(
    "/businesses/:businessId/report-definitions/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.REPORT_WRITE),
      ],
      schema: {
        tags: ["Reports"],
        operationId: "updateReportDefinition",
        summary: "Perbarui definisi laporan",
        security: [{ bearerAuth: [] }],
        params: ReportDefinitionIdParamsSchema,
        body: UpdateReportDefinitionSchema,
        response: {
          200: createDataResponseSchema(ReportDefinitionResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const updated = await updateReportDefinition(
        request.params.businessId,
        request.params.id,
        request.body,
      );
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Definisi laporan tidak ditemukan.");
      }
      request.audit = {
        action: "UPDATE",
        entityType: "report_definitions",
        entityId: updated.id,
        newValues: { type: updated.type, title: updated.title },
      };
      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/report-definitions/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.REPORT_WRITE),
      ],
      schema: {
        tags: ["Reports"],
        operationId: "deleteReportDefinition",
        summary: "Hapus definisi laporan (soft-delete)",
        security: [{ bearerAuth: [] }],
        params: ReportDefinitionIdParamsSchema,
        response: {
          200: MessageResponseSchema,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const deleted = await deleteReportDefinition(
        request.params.businessId,
        request.params.id,
      );
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Definisi laporan tidak ditemukan.");
      }
      request.audit = {
        action: "DELETE",
        entityType: "report_definitions",
        entityId: request.params.id,
      };
      return sendData(reply, { message: "Definisi laporan berhasil dihapus." });
    },
  );

  app.get(
    "/businesses/:businessId/report-definitions/:id/result",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.REPORT_READ),
      ],
      schema: {
        tags: ["Reports"],
        operationId: "getReportResult",
        summary: "Hitung isi laporan saat itu juga dari buku besar",
        security: [{ bearerAuth: [] }],
        params: ReportDefinitionIdParamsSchema,
        response: {
          200: createDataResponseSchema(ReportResultSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const definition = await getReportDefinitionById(
        request.params.businessId,
        request.params.id,
      );
      if (!definition) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Definisi laporan tidak ditemukan.");
      }

      // Validasi ulang parameter per tipe (definisi lama bisa inkonsisten).
      const validation = CreateReportDefinitionSchema.safeParse(definition);
      if (!validation.success) return sendError(reply, 400, ErrorCode.BAD_REQUEST, validation.error.issues[0].message);
      if (definition.type === "general_ledger_summary") {
        return sendData(reply, await computeGeneralLedgerSummary(request.params.businessId, definition.title,
          definition.dateFrom!, definition.dateTo!, definition.excludeZeroBalances));
      }
      if (definition.type === "general_ledger_transactions") {
        await validateReportAccount(request.params.businessId, definition.accountId);
        return sendData(reply, await computeGeneralLedgerTransactions(request.params.businessId, definition.title,
          definition.dateFrom!, definition.dateTo!, definition.accountId));
      }
      if (definition.type === "aged_receivables") {
        return sendData(reply, await computeAgedReceivables(request.params.businessId, definition.title,
          definition.asOfDate!, definition.sortBy ?? "total", definition.showInvoices));
      }
      if (definition.type === "aged_payables") {
        return sendData(reply, await computeAgedPayables(request.params.businessId, definition.title,
          definition.asOfDate!, definition.sortBy ?? "total", definition.showInvoices));
      }
      if (definition.type === "customer_summary" || definition.type === "supplier_summary") {
        return sendData(reply, await computeContactSummary(request.params.businessId, definition.title,
          definition.dateFrom!, definition.dateTo!, definition.type === "supplier_summary"));
      }
      if (definition.type === "sales_invoice_totals_by_customer") {
        return sendData(reply, await computeSalesInvoiceTotalsByCustomer(request.params.businessId, definition.title,
          definition.dateFrom!, definition.dateTo!));
      }
      if (definition.type === "sales_invoice_totals_by_item") {
        return sendData(reply, await computeSalesInvoiceTotalsByItem(request.params.businessId, definition.title,
          definition.dateFrom!, definition.dateTo!));
      }
      if (definition.type === "sales_invoice_totals_by_custom_field") {
        const field = await validateReportCustomField(request.params.businessId, validation.data.customFieldId);
        return sendData(reply, await computeSalesInvoiceTotalsByCustomField(request.params.businessId, definition.title,
          definition.dateFrom!, definition.dateTo!, validation.data.customFieldId!, field!.fieldType, field!.label));
      }
      if (definition.type === "billable_time_summary") {
        return sendData(reply, await computeBillableTimeSummary(request.params.businessId, definition.title,
          definition.dateFrom!, definition.dateTo!));
      }
      if (definition.type === "receipts_payments_summary") {
        return sendData(reply, await computeReceiptsPaymentsSummary(request.params.businessId, definition.title,
          definition.dateFrom!, definition.dateTo!, definition.showAccountCodes, definition.excludeZeroBalances, definition.footer));
      }
      if (
        definition.type === "trial_balance" ||
        definition.type === "profit_and_loss"
      ) {
        if (!definition.dateFrom || !definition.dateTo) {
          return sendError(
            reply,
            400,
            ErrorCode.BAD_REQUEST,
            "Definisi TB/P&L wajib punya tanggal From dan To.",
          );
        }
        if (definition.dateFrom > definition.dateTo) {
          return sendError(
            reply,
            400,
            ErrorCode.BAD_REQUEST,
            "Tanggal From tidak boleh lebih besar dari To.",
          );
        }
      }
      if (definition.type === "balance_sheet" && !definition.asOfDate) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "Definisi Balance Sheet wajib punya tanggal as-of.",
        );
      }

      const result =
        definition.type === "trial_balance"
          ? await computeTrialBalance(
              request.params.businessId,
              definition.title,
              definition.dateFrom!,
              definition.dateTo!,
              definition.showAccountCodes,
              definition.excludeZeroBalances,
              definition.footer,
            )
          : definition.type === "profit_and_loss"
            ? await computeProfitAndLoss(
                request.params.businessId,
                definition.title,
                definition.dateFrom!,
                definition.dateTo!,
                definition.showAccountCodes,
                definition.excludeZeroBalances,
                definition.footer,
              )
            : await computeBalanceSheet(
                request.params.businessId,
                definition.title,
                definition.asOfDate!,
                definition.showAccountCodes,
                definition.excludeZeroBalances,
                definition.footer,
              );

      return sendData(reply, result);
    },
  );
}

export default reportRoutesPlugin;
