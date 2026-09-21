import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import {
  createBankAccount,
  getBankAccountById,
  hasJournalEntries,
  isCoaInUse,
  listBankAccounts,
  softDeleteBankAccount,
  updateBankAccount,
  updateBankAccountStatus,
} from "../repositories/BankAccountRepository.js";
import { getAccountById } from "../repositories/ChartOfAccountRepository.js";
import { BusinessIdParamsSchema } from "../schemas/Business.js";
import {
  BankAccountListQuerySchema,
  BankAccountResponseSchema,
  BankAccountIdParamsSchema,
  CreateBankAccountSchema,
  UpdateBankAccountSchema,
} from "../schemas/BankAccount.js";
import {
  BadRequest,
  Conflict,
  createDataResponseSchema,
  createPaginatedResponseSchema,
  Forbidden,
  InternalServerError,
  MessageResponseSchema,
  NotFound,
  Unauthorized,
} from "../schemas/globals.js";
import { z } from "zod";

export async function bankAccountRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/bank-accounts",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.BANK_ACCOUNT_READ)],
      schema: {
        tags: ["BankAccounts"],
        operationId: "listBankAccounts",
        summary: "Daftar rekening kas & bank",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: BankAccountListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(BankAccountResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q, accountType, status } = request.query;
      const { data, total } = await listBankAccounts(request.params.businessId, {
        page,
        pageSize,
        q,
        accountType,
        status,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.post(
    "/businesses/:businessId/bank-accounts",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.BANK_ACCOUNT_WRITE)],
      schema: {
        tags: ["BankAccounts"],
        operationId: "createBankAccount",
        summary: "Buat rekening kas / bank baru",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateBankAccountSchema,
        response: {
          201: createDataResponseSchema(BankAccountResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          409: Conflict,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;
      const body = request.body;

      // Validasi COA: harus milik bisnis yang sama dan kategori Asset
      const coa = await getAccountById(businessId, body.accountId);
      if (!coa) {
        return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Akun COA tidak ditemukan.");
      }
      if (coa.category !== "Asset") {
        return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Akun COA harus ber kategori Asset.");
      }

      // Validasi: 1 COA hanya boleh 1 rekening aktif
      if (await isCoaInUse(businessId, body.accountId)) {
        return sendError(reply, 409, ErrorCode.CONFLICT, "Akun COA sudah digunakan oleh rekening lain.");
      }

      const account = await createBankAccount(businessId, body);
      request.audit = {
        action: "CREATE",
        entityType: "bank_accounts",
        entityId: account.id,
        newValues: { name: account.name, accountType: account.accountType },
      };

      return sendData(reply, account, 201);
    },
  );

  app.get(
    "/businesses/:businessId/bank-accounts/:bankAccountId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.BANK_ACCOUNT_READ)],
      schema: {
        tags: ["BankAccounts"],
        operationId: "getBankAccount",
        summary: "Ambil detail rekening kas/bank",
        security: [{ bearerAuth: [] }],
        params: BankAccountIdParamsSchema,
        response: {
          200: createDataResponseSchema(BankAccountResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const account = await getBankAccountById(request.params.businessId, request.params.bankAccountId);
      return account ? sendData(reply, account) : sendError(reply, 404, ErrorCode.NOT_FOUND, "Rekening tidak ditemukan.");
    },
  );

  app.put(
    "/businesses/:businessId/bank-accounts/:bankAccountId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.BANK_ACCOUNT_WRITE)],
      schema: {
        tags: ["BankAccounts"],
        operationId: "updateBankAccount",
        summary: "Perbarui data rekening kas/bank",
        security: [{ bearerAuth: [] }],
        params: BankAccountIdParamsSchema,
        body: UpdateBankAccountSchema,
        response: {
          200: createDataResponseSchema(BankAccountResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          409: Conflict,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, bankAccountId } = request.params;
      const oldValues = await getBankAccountById(businessId, bankAccountId);
      if (!oldValues) return sendError(reply, 404, ErrorCode.NOT_FOUND, "Rekening tidak ditemukan.");

      const body = request.body;
      if (body.accountId) {
        const coa = await getAccountById(businessId, body.accountId);
        if (!coa) return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Akun COA tidak ditemukan.");
        if (coa.category !== "Asset") {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Akun COA harus ber kategori Asset.");
        }
        if (await isCoaInUse(businessId, body.accountId, bankAccountId)) {
          return sendError(reply, 409, ErrorCode.CONFLICT, "Akun COA sudah digunakan oleh rekening lain.");
        }
      }

      const updated = await updateBankAccount(businessId, bankAccountId, body);
      if (!updated) return sendError(reply, 404, ErrorCode.NOT_FOUND, "Rekening tidak ditemukan.");

      request.audit = {
        action: "UPDATE",
        entityType: "bank_accounts",
        entityId: bankAccountId,
        oldValues: { name: oldValues.name },
        newValues: { name: updated.name },
      };

      return sendData(reply, updated);
    },
  );

  app.patch(
    "/businesses/:businessId/bank-accounts/:bankAccountId/status",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.BANK_ACCOUNT_WRITE)],
      schema: {
        tags: ["BankAccounts"],
        operationId: "updateBankAccountStatus",
        summary: "Ubah status rekening (active/archived)",
        security: [{ bearerAuth: [] }],
        params: BankAccountIdParamsSchema,
        body: z.object({ status: z.enum(["active", "archived"]) }),
        response: {
          200: createDataResponseSchema(BankAccountResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, bankAccountId } = request.params;
      const existing = await getBankAccountById(businessId, bankAccountId);
      if (!existing) return sendError(reply, 404, ErrorCode.NOT_FOUND, "Rekening tidak ditemukan.");

      const updated = await updateBankAccountStatus(businessId, bankAccountId, request.body.status);
      if (!updated) return sendError(reply, 404, ErrorCode.NOT_FOUND, "Rekening tidak ditemukan.");

      request.audit = {
        action: "UPDATE",
        entityType: "bank_accounts",
        entityId: bankAccountId,
        oldValues: { status: existing.status },
        newValues: { status: updated.status },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/bank-accounts/:bankAccountId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.BANK_ACCOUNT_DELETE)],
      schema: {
        tags: ["BankAccounts"],
        operationId: "deleteBankAccount",
        summary: "Soft-delete rekening kas/bank",
        security: [{ bearerAuth: [] }],
        params: BankAccountIdParamsSchema,
        response: {
          200: MessageResponseSchema,
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, bankAccountId } = request.params;
      const existing = await getBankAccountById(businessId, bankAccountId);
      if (!existing) return sendError(reply, 404, ErrorCode.NOT_FOUND, "Rekening tidak ditemukan.");

      // Deletion guard: tolak jika akun COA terkait sudah ada jurnal
      if (await hasJournalEntries(existing.accountId)) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "Akun kas/bank tidak dapat dihapus karena sudah memiliki transaksi. Silakan arsipkan akun.",
        );
      }

      const deleted = await softDeleteBankAccount(businessId, bankAccountId);
      if (!deleted) return sendError(reply, 404, ErrorCode.NOT_FOUND, "Rekening tidak ditemukan.");

      request.audit = {
        action: "DELETE",
        entityType: "bank_accounts",
        entityId: bankAccountId,
        oldValues: { name: existing.name },
      };

      return sendData(reply, { message: "Rekening kas/bank berhasil dihapus." });
    },
  );
}

export default bankAccountRoutesPlugin;
