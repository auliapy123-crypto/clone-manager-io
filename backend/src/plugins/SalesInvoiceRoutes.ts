/** Sales Invoices — faktur penjualan, posting jurnal langsung saat create. */
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getAccountById } from "../repositories/ChartOfAccountRepository.js";
import { getCustomerById } from "../repositories/ContactRepository.js";
import {
  createSalesInvoice,
  findArControlAccount,
  findTaxPayableAccount,
  getSalesInvoiceById,
  listSalesInvoices,
  resolveInvoiceDefaults,
  softDeleteSalesInvoice,
  updateSalesInvoice,
} from "../repositories/SalesInvoiceRepository.js";
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
  CreateSalesInvoiceSchema,
  SalesInvoiceDetailResponseSchema,
  SalesInvoiceIdParamsSchema,
  SalesInvoiceListQuerySchema,
  SalesInvoiceResponseSchema,
  UpdateSalesInvoiceSchema,
} from "../schemas/SalesInvoice.js";

export async function salesInvoiceRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/sales-invoices",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_INVOICE_READ)],
      schema: {
        tags: ["SalesInvoices"],
        operationId: "listSalesInvoices",
        summary: "Daftar faktur penjualan",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: SalesInvoiceListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(SalesInvoiceResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q, status } = request.query;
      const { data, total } = await listSalesInvoices(request.params.businessId, {
        page,
        pageSize,
        q,
        status,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/sales-invoices/:invoiceId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_INVOICE_READ)],
      schema: {
        tags: ["SalesInvoices"],
        operationId: "getSalesInvoice",
        summary: "Detail faktur + baris item + balanceDue + status",
        security: [{ bearerAuth: [] }],
        params: SalesInvoiceIdParamsSchema,
        response: {
          200: createDataResponseSchema(SalesInvoiceDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const invoice = await getSalesInvoiceById(
        request.params.businessId,
        request.params.invoiceId,
      );
      return invoice
        ? sendData(reply, invoice)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Faktur tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/sales-invoices",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_INVOICE_WRITE)],
      schema: {
        tags: ["SalesInvoices"],
        operationId: "createSalesInvoice",
        summary: "Buat faktur + langsung posting jurnal",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateSalesInvoiceSchema,
        response: {
          201: createDataResponseSchema(SalesInvoiceDetailResponseSchema),
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

      const accountCheck = await checkRevenueAccounts(businessId, body.lines.map((l) => l.accountId));
      if (accountCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);

      if (!(await findArControlAccount(businessId))) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "Akun kontrol Piutang Usaha belum disiapkan di bisnis ini.",
        );
      }
      if (body.lines.some((l) => (l.taxRatePercent ?? 0) > 0)) {
        if (!(await findTaxPayableAccount(businessId))) {
          return sendError(
            reply,
            400,
            ErrorCode.BAD_REQUEST,
            "Faktur ada pajaknya tapi akun Utang Pajak (2200) belum ada di bisnis ini.",
          );
        }
      }

      const { dueDate, billingAddress } = resolveInvoiceDefaults(
        body.issueDate,
        body.dueDate,
        body.billingAddress,
        customer,
      );

      const invoice = await createSalesInvoice(businessId, {
        ...body,
        customerName: customer.name,
        dueDateResolved: dueDate,
        billingAddressResolved: billingAddress,
      });

      request.audit = {
        action: "CREATE",
        entityType: "sales_invoices",
        entityId: invoice.id,
        newValues: { reference: invoice.reference, invoiceAmount: invoice.invoiceAmount },
      };

      return sendData(reply, invoice, 201);
    },
  );

  app.put(
    "/businesses/:businessId/sales-invoices/:invoiceId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_INVOICE_WRITE)],
      schema: {
        tags: ["SalesInvoices"],
        operationId: "updateSalesInvoice",
        summary: "Ubah faktur, susun ulang jurnal",
        security: [{ bearerAuth: [] }],
        params: SalesInvoiceIdParamsSchema,
        body: UpdateSalesInvoiceSchema,
        response: {
          200: createDataResponseSchema(SalesInvoiceDetailResponseSchema),
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

      const existing = await getSalesInvoiceById(businessId, invoiceId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Faktur tidak ditemukan.");
      }

      let customer = await getCustomerById(businessId, body.customerId ?? existing.customerId);
      if (!customer) {
        return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Pelanggan tidak ditemukan.");
      }

      if (body.lines) {
        const accountCheck = await checkRevenueAccounts(businessId, body.lines.map((l) => l.accountId));
        if (accountCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);
        if (!(await findArControlAccount(businessId))) {
          return sendError(
            reply,
            400,
            ErrorCode.BAD_REQUEST,
            "Akun kontrol Piutang Usaha belum disiapkan di bisnis ini.",
          );
        }
        if (body.lines.some((l) => (l.taxRatePercent ?? 0) > 0)) {
          if (!(await findTaxPayableAccount(businessId))) {
            return sendError(
              reply,
              400,
              ErrorCode.BAD_REQUEST,
              "Faktur ada pajaknya tapi akun Utang Pajak (2200) belum ada di bisnis ini.",
            );
          }
        }
      }

      // Ganti customer -> due date & alamat ikut syarat customer baru
      // (kecuali dikirim eksplisit). Selain itu nilai lama dipertahankan.
      const customerChanged = !!body.customerId && body.customerId !== existing.customerId;
      const issueDate = body.issueDate ?? existing.issueDate;
      const { dueDate, billingAddress } = customerChanged
        ? resolveInvoiceDefaults(issueDate, body.dueDate, body.billingAddress, customer)
        : { dueDate: undefined, billingAddress: undefined };

      const updated = await updateSalesInvoice(businessId, invoiceId, {
        ...body,
        customerName: customer.name,
        dueDateResolved: dueDate ?? null,
        billingAddressResolved: billingAddress ?? null,
        resolveDefaults: customerChanged,
      });
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Faktur tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "sales_invoices",
        entityId: invoiceId,
        oldValues: { reference: existing.reference },
        newValues: { reference: updated.reference, invoiceAmount: updated.invoiceAmount },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/sales-invoices/:invoiceId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.SALES_INVOICE_DELETE)],
      schema: {
        tags: ["SalesInvoices"],
        operationId: "deleteSalesInvoice",
        summary: "Soft-delete faktur + jurnal terkait",
        security: [{ bearerAuth: [] }],
        params: SalesInvoiceIdParamsSchema,
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
      const existing = await getSalesInvoiceById(businessId, invoiceId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Faktur tidak ditemukan.");
      }

      const deleted = await softDeleteSalesInvoice(businessId, invoiceId);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Faktur tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "sales_invoices",
        entityId: invoiceId,
        oldValues: { reference: existing.reference },
      };

      return sendData(reply, { message: "Faktur berhasil dihapus." });
    },
  );
}

/** Validasi akun baris: harus ada, milik bisnis ini, kategori Revenue. */
async function checkRevenueAccounts(
  businessId: string,
  accountIds: string[],
): Promise<string | null> {
  for (const accountId of [...new Set(accountIds)]) {
    const account = await getAccountById(businessId, accountId);
    if (!account) return "Akun pendapatan tidak ditemukan.";
    if (account.category !== "Revenue") {
      return `Akun ${account.code} bukan akun pendapatan (kategori Revenue).`;
    }
  }
  return null;
}

export default salesInvoiceRoutesPlugin;
