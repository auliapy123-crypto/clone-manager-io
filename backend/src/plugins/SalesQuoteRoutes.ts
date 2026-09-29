import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getCustomerById } from "../repositories/ContactRepository.js";
import {
  createSalesQuote,
  getSalesQuoteById,
  listSalesQuotes,
  softDeleteSalesQuote,
  updateSalesQuote,
} from "../repositories/SalesQuoteRepository.js";
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
  CreateSalesQuoteSchema,
  SalesQuoteDetailResponseSchema,
  SalesQuoteIdParamsSchema,
  SalesQuoteListQuerySchema,
  SalesQuoteResponseSchema,
  UpdateSalesQuoteSchema,
} from "../schemas/SalesQuote.js";

/**
 * Sales Quotes — dokumen penawaran harga NON-POSTING.
 *
 * TIDAK ADA jurnal, TANPA status, dan (sengaja) TANPA tombol konversi ke
 * Sales Order/Sales Invoice — beda dari Purchase Orders.
 */
export async function salesQuoteRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/sales-quotes",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_QUOTE_READ)],
      schema: {
        tags: ["SalesQuotes"],
        operationId: "listSalesQuotes",
        summary: "Daftar penawaran harga",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: SalesQuoteListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(SalesQuoteResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q } = request.query;
      const { data, total } = await listSalesQuotes(request.params.businessId, {
        page,
        pageSize,
        q,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/sales-quotes/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_QUOTE_READ)],
      schema: {
        tags: ["SalesQuotes"],
        operationId: "getSalesQuote",
        summary: "Detail penawaran + baris item + totalAmount/expiryDate",
        security: [{ bearerAuth: [] }],
        params: SalesQuoteIdParamsSchema,
        response: {
          200: createDataResponseSchema(SalesQuoteDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const quote = await getSalesQuoteById(
        request.params.businessId,
        request.params.id,
      );
      return quote
        ? sendData(reply, quote)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Penawaran tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/sales-quotes",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_QUOTE_WRITE)],
      schema: {
        tags: ["SalesQuotes"],
        operationId: "createSalesQuote",
        summary: "Buat penawaran baru (tanpa jurnal)",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateSalesQuoteSchema,
        response: {
          201: createDataResponseSchema(SalesQuoteDetailResponseSchema),
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

      const customer = await getCustomerById(businessId, body.customerId);
      if (!customer) {
        return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Pelanggan tidak ditemukan.");
      }

      const quote = await createSalesQuote(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "sales_quotes",
        entityId: quote.id,
        newValues: { reference: quote.reference, totalAmount: quote.totalAmount },
      };

      return sendData(reply, quote, 201);
    },
  );

  app.put(
    "/businesses/:businessId/sales-quotes/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_QUOTE_WRITE)],
      schema: {
        tags: ["SalesQuotes"],
        operationId: "updateSalesQuote",
        summary: "Ubah penawaran",
        security: [{ bearerAuth: [] }],
        params: SalesQuoteIdParamsSchema,
        body: UpdateSalesQuoteSchema,
        response: {
          200: createDataResponseSchema(SalesQuoteDetailResponseSchema),
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

      const existing = await getSalesQuoteById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Penawaran tidak ditemukan.");
      }

      if (body.customerId && body.customerId !== existing.customerId) {
        const customer = await getCustomerById(businessId, body.customerId);
        if (!customer) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Pelanggan tidak ditemukan.");
        }
      }

      const updated = await updateSalesQuote(businessId, id, body);
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Penawaran tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "sales_quotes",
        entityId: id,
        oldValues: { reference: existing.reference, customerId: existing.customerId },
        newValues: { reference: updated.reference, totalAmount: updated.totalAmount },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/sales-quotes/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_QUOTE_DELETE)],
      schema: {
        tags: ["SalesQuotes"],
        operationId: "deleteSalesQuote",
        summary: "Hapus penawaran (soft-delete, tanpa lock)",
        security: [{ bearerAuth: [] }],
        params: SalesQuoteIdParamsSchema,
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
      const existing = await getSalesQuoteById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Penawaran tidak ditemukan.");
      }

      const deleted = await softDeleteSalesQuote(businessId, id);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Penawaran tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "sales_quotes",
        entityId: id,
        oldValues: { reference: existing.reference, totalAmount: existing.totalAmount },
      };

      return sendData(reply, { message: "Penawaran berhasil dihapus." });
    },
  );
}

export default salesQuoteRoutesPlugin;
