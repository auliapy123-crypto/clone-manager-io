import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getAccountById } from "../repositories/ChartOfAccountRepository.js";
import { getSupplierById } from "../repositories/ContactRepository.js";
import {
  createPurchaseOrder,
  getPurchaseOrderById,
  hasActiveInvoices,
  listPurchaseOrders,
  softDeletePurchaseOrder,
  updatePurchaseOrder,
  type PurchaseOrderLineInput,
} from "../repositories/PurchaseOrderRepository.js";
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
  CreatePurchaseOrderSchema,
  PurchaseOrderDetailResponseSchema,
  PurchaseOrderIdParamsSchema,
  PurchaseOrderListQuerySchema,
  PurchaseOrderResponseSchema,
  UpdatePurchaseOrderSchema,
} from "../schemas/PurchaseOrder.js";

export async function purchaseOrderRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/purchase-orders",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_ORDER_READ)],
      schema: {
        tags: ["PurchaseOrders"],
        operationId: "listPurchaseOrders",
        summary: "Daftar pesanan pembelian",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: PurchaseOrderListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(PurchaseOrderResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q, status, dateFrom, dateTo } = request.query;
      const { data, total } = await listPurchaseOrders(request.params.businessId, {
        page,
        pageSize,
        q,
        status,
        dateFrom,
        dateTo,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/purchase-orders/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_ORDER_READ)],
      schema: {
        tags: ["PurchaseOrders"],
        operationId: "getPurchaseOrder",
        summary: "Detail PO + baris item + status penagihan",
        security: [{ bearerAuth: [] }],
        params: PurchaseOrderIdParamsSchema,
        response: {
          200: createDataResponseSchema(PurchaseOrderDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const order = await getPurchaseOrderById(
        request.params.businessId,
        request.params.id,
      );
      return order
        ? sendData(reply, order)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "PO tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/purchase-orders",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_ORDER_WRITE)],
      schema: {
        tags: ["PurchaseOrders"],
        operationId: "createPurchaseOrder",
        summary: "Buat PO baru (tanpa jurnal)",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreatePurchaseOrderSchema,
        response: {
          201: createDataResponseSchema(PurchaseOrderDetailResponseSchema),
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

      const order = await createPurchaseOrder(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "purchase_orders",
        entityId: order.id,
        newValues: { reference: order.reference, totalOrderAmount: order.totalOrderAmount },
      };

      return sendData(reply, order, 201);
    },
  );

  app.put(
    "/businesses/:businessId/purchase-orders/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_ORDER_WRITE)],
      schema: {
        tags: ["PurchaseOrders"],
        operationId: "updatePurchaseOrder",
        summary: "Ubah PO",
        security: [{ bearerAuth: [] }],
        params: PurchaseOrderIdParamsSchema,
        body: UpdatePurchaseOrderSchema,
        response: {
          200: createDataResponseSchema(PurchaseOrderDetailResponseSchema),
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

      const existing = await getPurchaseOrderById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "PO tidak ditemukan.");
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

      const updated = await updatePurchaseOrder(businessId, id, body);
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "PO tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "purchase_orders",
        entityId: id,
        oldValues: { reference: existing.reference },
        newValues: { reference: updated.reference, totalOrderAmount: updated.totalOrderAmount },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/purchase-orders/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_ORDER_DELETE)],
      schema: {
        tags: ["PurchaseOrders"],
        operationId: "deletePurchaseOrder",
        summary: "Hapus PO (tolak kalau sudah ada invoice terkait)",
        security: [{ bearerAuth: [] }],
        params: PurchaseOrderIdParamsSchema,
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
      const { businessId, id } = request.params;
      const existing = await getPurchaseOrderById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "PO tidak ditemukan.");
      }

      if (await hasActiveInvoices(businessId, id)) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "PO ini sudah memiliki Purchase Invoice terkait dan tidak bisa dihapus.",
        );
      }

      const deleted = await softDeletePurchaseOrder(businessId, id);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "PO tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "purchase_orders",
        entityId: id,
        oldValues: { reference: existing.reference },
      };

      return sendData(reply, { message: "PO berhasil dihapus." });
    },
  );
}

/** Validasi akun baris: harus ada, milik bisnis ini, kategori Expense. */
async function checkExpenseAccounts(
  businessId: string,
  lines: PurchaseOrderLineInput[],
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

export default purchaseOrderRoutesPlugin;
