import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getAccountById } from "../repositories/ChartOfAccountRepository.js";
import { getContactById } from "../repositories/ContactRepository.js";
import {
  createExpenseClaim,
  getExpenseClaimById,
  listExpenseClaims,
  softDeleteExpenseClaim,
  updateExpenseClaim,
} from "../repositories/ExpenseClaimRepository.js";
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
  CreateExpenseClaimSchema,
  ExpenseClaimDetailResponseSchema,
  ExpenseClaimIdParamsSchema,
  ExpenseClaimListQuerySchema,
  ExpenseClaimResponseSchema,
  UpdateExpenseClaimSchema,
} from "../schemas/ExpenseClaim.js";

const ALLOWED_LINE_CATEGORIES = new Set(["Asset", "Expense"]);

export async function expenseClaimRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/expense-claims",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.EXPENSE_CLAIM_READ)],
      schema: {
        tags: ["ExpenseClaims"],
        operationId: "listExpenseClaims",
        summary: "Daftar klaim biaya",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: ExpenseClaimListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(ExpenseClaimResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q, status, payerContactId } = request.query;
      const { data, total } = await listExpenseClaims(request.params.businessId, {
        page,
        pageSize,
        q, status, payerContactId,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/expense-claims/:expenseClaimId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.EXPENSE_CLAIM_READ)],
      schema: {
        tags: ["ExpenseClaims"],
        operationId: "getExpenseClaim",
        summary: "Detail klaim biaya + baris item",
        security: [{ bearerAuth: [] }],
        params: ExpenseClaimIdParamsSchema,
        response: {
          200: createDataResponseSchema(ExpenseClaimDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const expenseClaim = await getExpenseClaimById(
        request.params.businessId,
        request.params.expenseClaimId,
      );
      return expenseClaim
        ? sendData(reply, expenseClaim)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Klaim biaya tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/expense-claims",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.EXPENSE_CLAIM_WRITE)],
      schema: {
        tags: ["ExpenseClaims"],
        operationId: "createExpenseClaim",
        summary: "Buat klaim biaya + langsung posting jurnal",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateExpenseClaimSchema,
        response: {
          201: createDataResponseSchema(ExpenseClaimDetailResponseSchema),
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

      const contact = await getContactById(businessId, body.payerContactId);
      if (!contact) {
        return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Kontak (Payer) tidak ditemukan.");
      }

      const accountCheck = await checkExpenseClaimLineAccounts(
        businessId,
        body.lines.map((l) => l.accountId),
      );
      if (accountCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);

      const expenseClaim = await createExpenseClaim(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "expense_claims",
        entityId: expenseClaim.id,
        newValues: { reference: expenseClaim.reference, claimAmount: expenseClaim.claimAmount },
      };

      return sendData(reply, expenseClaim, 201);
    },
  );

  app.put(
    "/businesses/:businessId/expense-claims/:expenseClaimId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.EXPENSE_CLAIM_WRITE)],
      schema: {
        tags: ["ExpenseClaims"],
        operationId: "updateExpenseClaim",
        summary: "Ubah klaim biaya, susun ulang jurnal bila payer/baris berubah",
        security: [{ bearerAuth: [] }],
        params: ExpenseClaimIdParamsSchema,
        body: UpdateExpenseClaimSchema,
        response: {
          200: createDataResponseSchema(ExpenseClaimDetailResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, expenseClaimId } = request.params;
      const body = request.body;

      const existing = await getExpenseClaimById(businessId, expenseClaimId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Klaim biaya tidak ditemukan.");
      }

      if (body.payerContactId) {
        const contact = await getContactById(businessId, body.payerContactId);
        if (!contact) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Kontak (Payer) tidak ditemukan.");
        }
      }

      if (body.lines) {
        const accountCheck = await checkExpenseClaimLineAccounts(
          businessId,
          body.lines.map((l) => l.accountId),
        );
        if (accountCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);
      }

      const updated = await updateExpenseClaim(businessId, expenseClaimId, body);
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Klaim biaya tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "expense_claims",
        entityId: expenseClaimId,
        oldValues: { reference: existing.reference, payerContactId: existing.payerContactId },
        newValues: {
          reference: updated.reference,
          payerContactId: updated.payerContactId,
          claimAmount: updated.claimAmount,
        },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/expense-claims/:expenseClaimId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.EXPENSE_CLAIM_DELETE)],
      schema: {
        tags: ["ExpenseClaims"],
        operationId: "deleteExpenseClaim",
        summary: "Soft-delete klaim biaya + jurnal terkait",
        security: [{ bearerAuth: [] }],
        params: ExpenseClaimIdParamsSchema,
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
      const { businessId, expenseClaimId } = request.params;
      const existing = await getExpenseClaimById(businessId, expenseClaimId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Klaim biaya tidak ditemukan.");
      }

      const deleted = await softDeleteExpenseClaim(businessId, expenseClaimId);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Klaim biaya tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "expense_claims",
        entityId: expenseClaimId,
        oldValues: { reference: existing.reference },
      };

      return sendData(reply, { message: "Klaim biaya berhasil dihapus." });
    },
  );
}

async function checkExpenseClaimLineAccounts(
  businessId: string,
  accountIds: string[],
): Promise<string | null> {
  for (const accountId of [...new Set(accountIds)]) {
    const account = await getAccountById(businessId, accountId);
    if (!account) return "Akun baris item tidak ditemukan.";
    if (!ALLOWED_LINE_CATEGORIES.has(account.category)) {
      return `Akun ${account.code} harus kategori Expense/Asset untuk baris klaim biaya (${account.category}).`;
    }
  }
  return null;
}

export default expenseClaimRoutesPlugin;
