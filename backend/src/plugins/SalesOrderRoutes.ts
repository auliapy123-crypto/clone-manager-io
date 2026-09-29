import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getCustomerById } from "../repositories/ContactRepository.js";
import {
  createSalesOrder,
  getSalesOrderById,
  listSalesOrders,
  softDeleteSalesOrder,
  updateSalesOrder,
} from "../repositories/SalesOrderRepository.js";
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
  CreateSalesOrderSchema,
  SalesOrderDetailResponseSchema,
  SalesOrderIdParamsSchema,
  SalesOrderListQuerySchema,
  SalesOrderResponseSchema,
  UpdateSalesOrderSchema,
} from "../schemas/SalesOrder.js";

/**
 * Sales Orders — pesanan penjualan resmi dari pelanggan, NON-POSTING.
 *
 * TIDAK ADA jurnal, TANPA status, dan (sengaja) TANPA tombol konversi ke
 * Sales Invoice — sama seperti Sales Quotes, cuma lebih sedikit field
 * (TANPA validForDays/expiryDate, TANPA billingAddress).
 */
export async function salesOrderRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/sales-orders",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_ORDER_READ)],
      schema: {
        tags: ["SalesOrders"],
        operationId: "listSalesOrders",
        summary: "Daftar pesanan penjualan",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: SalesOrderListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(SalesOrderResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q } = request.query;
      const { data, total } = await listSalesOrders(request.params.businessId, {
        page,
        pageSize,
        q,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/sales-orders/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_ORDER_READ)],
      schema: {
        tags: ["SalesOrders"],
        operationId: "getSalesOrder",
        summary: "Detail pesanan + baris item + totalAmount",
        security: [{ bearerAuth: [] }],
        params: SalesOrderIdParamsSchema,
        response: {
          200: createDataResponseSchema(SalesOrderDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const order = await getSalesOrderById(
        request.params.businessId,
        request.params.id,
      );
      return order
        ? sendData(reply, order)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Pesanan tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/sales-orders",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_ORDER_WRITE)],
      schema: {
        tags: ["SalesOrders"],
        operationId: "createSalesOrder",
        summary: "Buat pesanan baru (tanpa jurnal)",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateSalesOrderSchema,
        response: {
          201: createDataResponseSchema(SalesOrderDetailResponseSchema),
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

      const order = await createSalesOrder(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "sales_orders",
        entityId: order.id,
        newValues: { reference: order.reference, totalAmount: order.totalAmount },
      };

      return sendData(reply, order, 201);
    },
  );

  app.put(
    "/businesses/:businessId/sales-orders/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_ORDER_WRITE)],
      schema: {
        tags: ["SalesOrders"],
        operationId: "updateSalesOrder",
        summary: "Ubah pesanan",
        security: [{ bearerAuth: [] }],
        params: SalesOrderIdParamsSchema,
        body: UpdateSalesOrderSchema,
        response: {
          200: createDataResponseSchema(SalesOrderDetailResponseSchema),
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

      const existing = await getSalesOrderById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Pesanan tidak ditemukan.");
      }

      if (body.customerId && body.customerId !== existing.customerId) {
        const customer = await getCustomerById(businessId, body.customerId);
        if (!customer) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Pelanggan tidak ditemukan.");
        }
      }

      const updated = await updateSalesOrder(businessId, id, body);
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Pesanan tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "sales_orders",
        entityId: id,
        oldValues: { reference: existing.reference, customerId: existing.customerId },
        newValues: { reference: updated.reference, totalAmount: updated.totalAmount },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/sales-orders/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_ORDER_DELETE)],
      schema: {
        tags: ["SalesOrders"],
        operationId: "deleteSalesOrder",
        summary: "Hapus pesanan (soft-delete, tanpa lock)",
        security: [{ bearerAuth: [] }],
        params: SalesOrderIdParamsSchema,
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
      const existing = await getSalesOrderById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Pesanan tidak ditemukan.");
      }

      const deleted = await softDeleteSalesOrder(businessId, id);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Pesanan tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "sales_orders",
        entityId: id,
        oldValues: { reference: existing.reference, totalAmount: existing.totalAmount },
      };

      return sendData(reply, { message: "Pesanan berhasil dihapus." });
    },
  );
}

export default salesOrderRoutesPlugin;
