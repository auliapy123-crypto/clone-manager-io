/**
 * ChartOfAccountRoutes (Guide §3.2, §3.3, §7.2).
 *
 * Modul Chart of Accounts: CRUD akun (`/businesses/:businessId/accounts`).
 * businessId di sini datang dari PATH (sama seperti BusinessRoutes.ts),
 * makanya dipakai `requireBusinessScopeParam`, bukan `requireBusinessScope`.
 *
 * Route plugin biasa (TANPA fastify-plugin), didaftarkan di root path.
 * Setiap route WAJIB punya `operationId`.
 */
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { isPgUniqueViolation } from "../libs/safe-error.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import {
  AccountCreateSchema,
  AccountIdParamsSchema,
  AccountListQuerySchema,
  AccountResponseSchema,
  AccountUpdateSchema,
} from "../schemas/ChartOfAccount.js";
import { BusinessIdParamsSchema } from "../schemas/Business.js";
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
import {
  createAccount,
  getAccountById,
  listAccountsByBusiness,
  softDeleteAccount,
  updateAccount,
} from "../repositories/ChartOfAccountRepository.js";

export async function chartOfAccountRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  // ===================================================================
  // GET /businesses/:businessId/accounts — daftar akun (paginated)
  // ===================================================================
  app.get(
    "/businesses/:businessId/accounts",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.ACCOUNT_READ),
      ],
      schema: {
        tags: ["ChartOfAccounts"],
        operationId: "listAccounts",
        summary: "Daftar akun (chart of accounts) satu bisnis",
        description:
          "Mendukung pencarian bebas lewat query `q` (cocok di code/name) dan filter `category`.",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: AccountListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(AccountResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q, category } = request.query;

      const { data, total } = await listAccountsByBusiness(
        request.params.businessId,
        { page, pageSize, q, category },
      );

      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  // ===================================================================
  // POST /businesses/:businessId/accounts — buat akun baru
  // ===================================================================
  app.post(
    "/businesses/:businessId/accounts",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.ACCOUNT_WRITE),
      ],
      schema: {
        tags: ["ChartOfAccounts"],
        operationId: "createAccount",
        summary: "Buat akun baru",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: AccountCreateSchema,
        response: {
          201: createDataResponseSchema(AccountResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          409: Conflict,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;

      let account;
      try {
        account = await createAccount(businessId, request.body);
      } catch (error) {
        // Tanpa pre-check SELECT: dua request bersamaan dengan code sama
        // akan dijaga oleh UNIQUE constraint, bukan oleh cek aplikasi.
        if (isPgUniqueViolation(error)) {
          return sendError(
            reply,
            409,
            ErrorCode.CONFLICT,
            "Kode akun sudah dipakai di bisnis ini.",
          );
        }
        throw error;
      }

      request.audit = {
        action: "CREATE",
        entityType: "chart_of_accounts",
        entityId: account.id,
        newValues: { code: account.code, name: account.name },
      };

      return sendData(reply, account, 201);
    },
  );

  // ===================================================================
  // GET /businesses/:businessId/accounts/:accountId — detail satu akun
  // ===================================================================
  app.get(
    "/businesses/:businessId/accounts/:accountId",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.ACCOUNT_READ),
      ],
      schema: {
        tags: ["ChartOfAccounts"],
        operationId: "getAccount",
        summary: "Detail satu akun",
        security: [{ bearerAuth: [] }],
        params: AccountIdParamsSchema,
        response: {
          200: createDataResponseSchema(AccountResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, accountId } = request.params;
      const account = await getAccountById(businessId, accountId);

      if (!account) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "Akun tidak ditemukan.",
        );
      }

      return sendData(reply, account);
    },
  );

  // ===================================================================
  // PATCH /businesses/:businessId/accounts/:accountId — ubah akun
  // ===================================================================
  app.patch(
    "/businesses/:businessId/accounts/:accountId",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.ACCOUNT_WRITE),
      ],
      schema: {
        tags: ["ChartOfAccounts"],
        operationId: "updateAccount",
        summary: "Ubah data satu akun",
        security: [{ bearerAuth: [] }],
        params: AccountIdParamsSchema,
        body: AccountUpdateSchema,
        response: {
          200: createDataResponseSchema(AccountResponseSchema),
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
      const { businessId, accountId } = request.params;
      const oldValues = await getAccountById(businessId, accountId);

      let updated;
      try {
        updated = await updateAccount(businessId, accountId, request.body);
      } catch (error) {
        if (isPgUniqueViolation(error)) {
          return sendError(
            reply,
            409,
            ErrorCode.CONFLICT,
            "Kode akun sudah dipakai di bisnis ini.",
          );
        }
        throw error;
      }

      if (!updated) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "Akun tidak ditemukan.",
        );
      }

      request.audit = {
        action: "UPDATE",
        entityType: "chart_of_accounts",
        entityId: updated.id,
        oldValues: oldValues
          ? { code: oldValues.code, name: oldValues.name }
          : null,
        newValues: { code: updated.code, name: updated.name },
      };

      return sendData(reply, updated);
    },
  );

  // ===================================================================
  // DELETE /businesses/:businessId/accounts/:accountId — soft-delete akun
  // ===================================================================
  app.delete(
    "/businesses/:businessId/accounts/:accountId",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.ACCOUNT_WRITE),
      ],
      schema: {
        tags: ["ChartOfAccounts"],
        operationId: "deleteAccount",
        summary: "Hapus (soft-delete) satu akun",
        description:
          "Akun tidak dihapus permanen — hanya ditandai deleted_at supaya histori jurnal lama tetap valid.",
        security: [{ bearerAuth: [] }],
        params: AccountIdParamsSchema,
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
      const { businessId, accountId } = request.params;
      const existing = await getAccountById(businessId, accountId);

      const deleted = await softDeleteAccount(businessId, accountId);
      if (!deleted) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "Akun tidak ditemukan.",
        );
      }

      request.audit = {
        action: "DELETE",
        entityType: "chart_of_accounts",
        entityId: accountId,
        oldValues: existing ? { code: existing.code, name: existing.name } : null,
      };

      return sendData(reply, { message: "Akun berhasil dihapus." });
    },
  );
}

export default chartOfAccountRoutesPlugin;
