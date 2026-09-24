import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getBankAccountById } from "../repositories/BankAccountRepository.js";
import {
  createBankReconciliation,
  getBankReconciliationById,
  listBankReconciliations,
  softDeleteBankReconciliation,
  updateBankReconciliation,
} from "../repositories/BankReconciliationRepository.js";
import { BusinessIdParamsSchema } from "../schemas/Business.js";
import {
  CreateBankReconciliationSchema,
  BankReconciliationDetailResponseSchema,
  BankReconciliationIdParamsSchema,
  BankReconciliationListQuerySchema,
  BankReconciliationResponseSchema,
  UpdateBankReconciliationSchema,
} from "../schemas/BankReconciliation.js";
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

export async function bankReconciliationRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/bank-reconciliations",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.BANK_RECONCILIATION_READ)],
      schema: {
        tags: ["BankReconciliations"],
        operationId: "listBankReconciliations",
        summary: "Daftar lembar rekonsiliasi bank",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: BankReconciliationListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(BankReconciliationResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q } = request.query;
      const { data, total } = await listBankReconciliations(request.params.businessId, {
        page,
        pageSize,
        q,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/bank-reconciliations/:reconciliationId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.BANK_RECONCILIATION_READ)],
      schema: {
        tags: ["BankReconciliations"],
        operationId: "getBankReconciliation",
        summary: "Detail lembar rekonsiliasi + bookBalance/discrepancy/status",
        security: [{ bearerAuth: [] }],
        params: BankReconciliationIdParamsSchema,
        response: {
          200: createDataResponseSchema(BankReconciliationDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const reconciliation = await getBankReconciliationById(
        request.params.businessId,
        request.params.reconciliationId,
      );
      return reconciliation
        ? sendData(reply, reconciliation)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Rekonsiliasi tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/bank-reconciliations",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.BANK_RECONCILIATION_WRITE)],
      schema: {
        tags: ["BankReconciliations"],
        operationId: "createBankReconciliation",
        summary: "Buat lembar rekonsiliasi baru",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateBankReconciliationSchema,
        response: {
          201: createDataResponseSchema(BankReconciliationDetailResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;
      const body = request.body;

      const bankCheck = await checkBankAccount(businessId, body.bankAccountId);
      if (bankCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, bankCheck);

      const reconciliation = await createBankReconciliation(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "bank_reconciliations",
        entityId: reconciliation.id,
        newValues: {
          date: reconciliation.date,
          bankAccountId: reconciliation.bankAccountId,
          statementBalance: reconciliation.statementBalance,
        },
      };

      return sendData(reply, reconciliation, 201);
    },
  );

  app.put(
    "/businesses/:businessId/bank-reconciliations/:reconciliationId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.BANK_RECONCILIATION_WRITE)],
      schema: {
        tags: ["BankReconciliations"],
        operationId: "updateBankReconciliation",
        summary: "Ubah lembar rekonsiliasi",
        security: [{ bearerAuth: [] }],
        params: BankReconciliationIdParamsSchema,
        body: UpdateBankReconciliationSchema,
        response: {
          200: createDataResponseSchema(BankReconciliationDetailResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, reconciliationId } = request.params;
      const body = request.body;

      const existing = await getBankReconciliationById(businessId, reconciliationId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Rekonsiliasi tidak ditemukan.");
      }

      if (body.bankAccountId) {
        const bankCheck = await checkBankAccount(businessId, body.bankAccountId);
        if (bankCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, bankCheck);
      }

      const updated = await updateBankReconciliation(businessId, reconciliationId, body);
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Rekonsiliasi tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "bank_reconciliations",
        entityId: reconciliationId,
        oldValues: {
          date: existing.date,
          bankAccountId: existing.bankAccountId,
          statementBalance: existing.statementBalance,
        },
        newValues: {
          date: updated.date,
          bankAccountId: updated.bankAccountId,
          statementBalance: updated.statementBalance,
        },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/bank-reconciliations/:reconciliationId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.BANK_RECONCILIATION_DELETE)],
      schema: {
        tags: ["BankReconciliations"],
        operationId: "deleteBankReconciliation",
        summary: "Soft-delete lembar rekonsiliasi",
        security: [{ bearerAuth: [] }],
        params: BankReconciliationIdParamsSchema,
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
      const { businessId, reconciliationId } = request.params;
      const existing = await getBankReconciliationById(businessId, reconciliationId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Rekonsiliasi tidak ditemukan.");
      }

      const deleted = await softDeleteBankReconciliation(businessId, reconciliationId);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Rekonsiliasi tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "bank_reconciliations",
        entityId: reconciliationId,
        oldValues: { date: existing.date, bankAccountId: existing.bankAccountId },
      };

      return sendData(reply, { message: "Rekonsiliasi berhasil dihapus." });
    },
  );
}

async function checkBankAccount(
  businessId: string,
  bankAccountId: string,
): Promise<string | null> {
  const bank = await getBankAccountById(businessId, bankAccountId);
  if (!bank) return "Rekening bank/kas tidak ditemukan.";
  if (bank.status !== "active") return "Rekening bank/kas tidak aktif.";
  return null;
}

export default bankReconciliationRoutesPlugin;
