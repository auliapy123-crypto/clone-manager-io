import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getAccountById } from "../repositories/ChartOfAccountRepository.js";
import { getSupplierById } from "../repositories/ContactRepository.js";
import {
  createPurchaseInvoice,
  findApControlAccount,
  getPurchaseInvoiceById,
  listPurchaseInvoices,
  softDeletePurchaseInvoice,
  updatePurchaseInvoice,
} from "../repositories/PurchaseInvoiceRepository.js";
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
  CreatePurchaseInvoiceSchema,
  PurchaseInvoiceDetailResponseSchema,
  PurchaseInvoiceIdParamsSchema,
  PurchaseInvoiceListQuerySchema,
  PurchaseInvoiceResponseSchema,
  UpdatePurchaseInvoiceSchema,
} from "../schemas/PurchaseInvoice.js";

export async function purchaseInvoiceRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/purchase-invoices",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_INVOICE_READ)],
      schema: {
        tags: ["PurchaseInvoices"],
        operationId: "listPurchaseInvoices",
        summary: "Daftar faktur pembelian",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: PurchaseInvoiceListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(PurchaseInvoiceResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q, status } = request.query;
      const { data, total } = await listPurchaseInvoices(request.params.businessId, {
        page,
        pageSize,
        q,
        status,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/purchase-invoices/:invoiceId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_INVOICE_READ)],
      schema: {
        tags: ["PurchaseInvoices"],
        operationId: "getPurchaseInvoice",
        summary: "Detail faktur + baris item + balanceDue + status",
        security: [{ bearerAuth: [] }],
        params: PurchaseInvoiceIdParamsSchema,
        response: {
          200: createDataResponseSchema(PurchaseInvoiceDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const invoice = await getPurchaseInvoiceById(
        request.params.businessId,
        request.params.invoiceId,
      );
      return invoice
        ? sendData(reply, invoice)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Faktur tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/purchase-invoices",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_INVOICE_WRITE)],
      schema: {
        tags: ["PurchaseInvoices"],
        operationId: "createPurchaseInvoice",
        summary: "Buat faktur + langsung posting jurnal",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreatePurchaseInvoiceSchema,
        response: {
          201: createDataResponseSchema(PurchaseInvoiceDetailResponseSchema),
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

      const accountCheck = await checkExpenseAccounts(businessId, body.lines.map((l) => l.accountId));
      if (accountCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);

      if (!(await findApControlAccount(businessId))) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "Akun kontrol Utang Usaha belum disiapkan di bisnis ini.",
        );
      }

      const invoice = await createPurchaseInvoice(businessId, {
        ...body,
        supplierName: supplier.name,
      });

      request.audit = {
        action: "CREATE",
        entityType: "purchase_invoices",
        entityId: invoice.id,
        newValues: { reference: invoice.reference, invoiceAmount: invoice.invoiceAmount },
      };

      return sendData(reply, invoice, 201);
    },
  );

  app.put(
    "/businesses/:businessId/purchase-invoices/:invoiceId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_INVOICE_WRITE)],
      schema: {
        tags: ["PurchaseInvoices"],
        operationId: "updatePurchaseInvoice",
        summary: "Ubah faktur, susun ulang jurnal",
        security: [{ bearerAuth: [] }],
        params: PurchaseInvoiceIdParamsSchema,
        body: UpdatePurchaseInvoiceSchema,
        response: {
          200: createDataResponseSchema(PurchaseInvoiceDetailResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, invoiceId } = request.params;
      const body = request.body;

      const existing = await getPurchaseInvoiceById(businessId, invoiceId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Faktur tidak ditemukan.");
      }

      let supplier = await getSupplierById(businessId, body.supplierId ?? existing.supplierId);
      if (!supplier) {
        return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Supplier tidak ditemukan.");
      }

      if (body.lines) {
        const accountCheck = await checkExpenseAccounts(businessId, body.lines.map((l) => l.accountId));
        if (accountCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);
        if (!(await findApControlAccount(businessId))) {
          return sendError(
            reply,
            400,
            ErrorCode.BAD_REQUEST,
            "Akun kontrol Utang Usaha belum disiapkan di bisnis ini.",
          );
        }
      }

      const updated = await updatePurchaseInvoice(businessId, invoiceId, {
        ...body,
        supplierName: supplier.name,
      });
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Faktur tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "purchase_invoices",
        entityId: invoiceId,
        oldValues: { reference: existing.reference },
        newValues: { reference: updated.reference, invoiceAmount: updated.invoiceAmount },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/purchase-invoices/:invoiceId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PURCHASE_INVOICE_DELETE)],
      schema: {
        tags: ["PurchaseInvoices"],
        operationId: "deletePurchaseInvoice",
        summary: "Soft-delete faktur + jurnal terkait",
        security: [{ bearerAuth: [] }],
        params: PurchaseInvoiceIdParamsSchema,
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
      const { businessId, invoiceId } = request.params;
      const existing = await getPurchaseInvoiceById(businessId, invoiceId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Faktur tidak ditemukan.");
      }

      const deleted = await softDeletePurchaseInvoice(businessId, invoiceId);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Faktur tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "purchase_invoices",
        entityId: invoiceId,
        oldValues: { reference: existing.reference },
      };

      return sendData(reply, { message: "Faktur berhasil dihapus." });
    },
  );
}

async function checkExpenseAccounts(
  businessId: string,
  accountIds: string[],
): Promise<string | null> {
  for (const accountId of [...new Set(accountIds)]) {
    const account = await getAccountById(businessId, accountId);
    if (!account) return "Akun beban tidak ditemukan.";
    if (account.category !== "Expense") {
      return `Akun ${account.code} bukan akun beban (kategori Expense).`;
    }
  }
  return null;
}

export default purchaseInvoiceRoutesPlugin;
