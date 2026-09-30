import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getAccountById } from "../repositories/ChartOfAccountRepository.js";
import { getSupplierById } from "../repositories/ContactRepository.js";
import {
  createPurchaseQuote,
  getPurchaseQuoteById,
  listPurchaseQuotes,
  softDeletePurchaseQuote,
  updatePurchaseQuote,
  type PurchaseQuoteLineInput,
} from "../repositories/PurchaseQuoteRepository.js";
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
  CreatePurchaseQuoteSchema,
  PurchaseQuoteDetailResponseSchema,
  PurchaseQuoteIdParamsSchema,
  PurchaseQuoteListQuerySchema,
  PurchaseQuoteResponseSchema,
  UpdatePurchaseQuoteSchema,
} from "../schemas/PurchaseQuote.js";

export async function purchaseQuoteRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/purchase-quotes",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_QUOTE_READ)],
      schema: {
        tags: ["PurchaseQuotes"],
        operationId: "listPurchaseQuotes",
        summary: "Daftar penawaran pembelian",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: PurchaseQuoteListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(PurchaseQuoteResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q, status } = request.query;
      const { data, total } = await listPurchaseQuotes(
        request.params.businessId,
        { page, pageSize, q, status },
      );
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/purchase-quotes/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_QUOTE_READ)],
      schema: {
        tags: ["PurchaseQuotes"],
        operationId: "getPurchaseQuote",
        summary: "Detail penawaran + baris item + totalAmount",
        security: [{ bearerAuth: [] }],
        params: PurchaseQuoteIdParamsSchema,
        response: {
          200: createDataResponseSchema(PurchaseQuoteDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const quote = await getPurchaseQuoteById(
        request.params.businessId,
        request.params.id,
      );
      return quote
        ? sendData(reply, quote)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Penawaran tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/purchase-quotes",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_QUOTE_WRITE)],
      schema: {
        tags: ["PurchaseQuotes"],
        operationId: "createPurchaseQuote",
        summary: "Buat penawaran baru (non-posting, tanpa jurnal)",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreatePurchaseQuoteSchema,
        response: {
          201: createDataResponseSchema(PurchaseQuoteDetailResponseSchema),
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

      const supplier = await getSupplierById(businessId, body.supplierId);
      if (!supplier) {
        return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Supplier tidak ditemukan.");
      }

      const accountCheck = await checkExpenseAccounts(businessId, body.lines);
      if (accountCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);

      const quote = await createPurchaseQuote(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "purchase_quotes",
        entityId: quote.id,
        newValues: {
          quoteNumber: quote.quoteNumber,
          status: quote.status,
          totalAmount: quote.totalAmount,
        },
      };

      return sendData(reply, quote, 201);
    },
  );

  app.put(
    "/businesses/:businessId/purchase-quotes/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_QUOTE_WRITE)],
      schema: {
        tags: ["PurchaseQuotes"],
        operationId: "updatePurchaseQuote",
        summary: "Ubah penawaran (termasuk ganti status, bebas)",
        security: [{ bearerAuth: [] }],
        params: PurchaseQuoteIdParamsSchema,
        body: UpdatePurchaseQuoteSchema,
        response: {
          200: createDataResponseSchema(PurchaseQuoteDetailResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, id } = request.params;
      const body = request.body;

      const existing = await getPurchaseQuoteById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Penawaran tidak ditemukan.");
      }

      if (body.supplierId) {
        const supplier = await getSupplierById(businessId, body.supplierId);
        if (!supplier) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Supplier tidak ditemukan.");
        }
      }

      if (body.lines) {
        const accountCheck = await checkExpenseAccounts(businessId, body.lines);
        if (accountCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);
      }

      const updated = await updatePurchaseQuote(businessId, id, body);
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Penawaran tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "purchase_quotes",
        entityId: id,
        oldValues: {
          status: existing.status,
          totalAmount: existing.totalAmount,
        },
        newValues: {
          status: updated.status,
          totalAmount: updated.totalAmount,
        },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/purchase-quotes/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_QUOTE_DELETE)],
      schema: {
        tags: ["PurchaseQuotes"],
        operationId: "deletePurchaseQuote",
        summary: "Hapus penawaran (soft-delete, bebas)",
        security: [{ bearerAuth: [] }],
        params: PurchaseQuoteIdParamsSchema,
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
      const { businessId, id } = request.params;
      const existing = await getPurchaseQuoteById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Penawaran tidak ditemukan.");
      }

      const deleted = await softDeletePurchaseQuote(businessId, id);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Penawaran tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "purchase_quotes",
        entityId: id,
        oldValues: {
          quoteNumber: existing.quoteNumber,
          status: existing.status,
        },
      };

      return sendData(reply, { message: "Penawaran berhasil dihapus." });
    },
  );
}

/** Validasi akun baris: harus ada, milik bisnis ini, kategori Expense. */
async function checkExpenseAccounts(
  businessId: string,
  lines: PurchaseQuoteLineInput[],
): Promise<string | null> {
  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  for (const accountId of accountIds) {
    const account = await getAccountById(businessId, accountId);
    if (!account) return "Akun beban tidak ditemukan.";
    if (account.category !== "Expense") {
      return `Akun ${account.code} bukan akun beban (kategori Expense).`;
    }
  }
  return null;
}

export default purchaseQuoteRoutesPlugin;
