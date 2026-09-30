import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getCustomerById } from "../repositories/ContactRepository.js";
import {
  copyWithholdingTaxReceipt,
  createWithholdingTaxReceipt,
  getWithholdingTaxReceiptById,
  listWithholdingTaxReceipts,
  softDeleteWithholdingTaxReceipt,
  updateWithholdingTaxReceipt,
  WithholdingTaxReceiptValidationError,
} from "../repositories/WithholdingTaxReceiptRepository.js";
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
  CreateWithholdingTaxReceiptSchema,
  UpdateWithholdingTaxReceiptSchema,
  WithholdingTaxReceiptIdParamsSchema,
  WithholdingTaxReceiptListQuerySchema,
  WithholdingTaxReceiptResponseSchema,
} from "../schemas/WithholdingTaxReceipt.js";

/**
 * Withholding Tax Receipts — bukti potong PPh dari pelanggan. POSTING
 * jurnal (Debit akun Asset, Kredit AR) dan mengurangi balanceDue Sales
 * Invoice terkait. Validasi amount <= balanceDue ada di repository.
 */
export async function withholdingTaxReceiptRoutesPlugin(
  fastify: FastifyInstance,
) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];
  const base = "/businesses/:businessId/withholding-tax-receipts";
  const TAG = "WithholdingTaxReceipts";

  app.get(
    base,
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.WITHHOLDING_TAX_RECEIPT_READ),
      ],
      schema: {
        tags: [TAG],
        operationId: "listWithholdingTaxReceipts",
        summary: "Daftar bukti potong PPh",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: WithholdingTaxReceiptListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(WithholdingTaxReceiptResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q } = request.query;
      const { data, total } = await listWithholdingTaxReceipts(
        request.params.businessId,
        { page, pageSize, q },
      );
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    `${base}/:id`,
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.WITHHOLDING_TAX_RECEIPT_READ),
      ],
      schema: {
        tags: [TAG],
        operationId: "getWithholdingTaxReceipt",
        summary: "Detail bukti potong PPh",
        security: [{ bearerAuth: [] }],
        params: WithholdingTaxReceiptIdParamsSchema,
        response: {
          200: createDataResponseSchema(WithholdingTaxReceiptResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, id } = request.params;
      const receipt = await getWithholdingTaxReceiptById(businessId, id);
      if (!receipt) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Bukti potong tidak ditemukan.");
      }
      return sendData(reply, receipt);
    },
  );

  app.post(
    base,
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.WITHHOLDING_TAX_RECEIPT_WRITE),
      ],
      schema: {
        tags: [TAG],
        operationId: "createWithholdingTaxReceipt",
        summary: "Catat bukti potong PPh baru + posting jurnal",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateWithholdingTaxReceiptSchema,
        response: {
          201: createDataResponseSchema(WithholdingTaxReceiptResponseSchema),
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

      let receipt;
      try {
        receipt = await createWithholdingTaxReceipt(businessId, body);
      } catch (err) {
        if (err instanceof WithholdingTaxReceiptValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, err.message);
        }
        throw err;
      }

      request.audit = {
        action: "CREATE",
        entityType: "withholding_tax_receipts",
        entityId: receipt.id,
        newValues: {
          customerId: receipt.customerId,
          salesInvoiceId: receipt.salesInvoiceId,
          amount: receipt.amount,
        },
      };

      return sendData(reply, receipt, 201);
    },
  );

  app.put(
    `${base}/:id`,
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.WITHHOLDING_TAX_RECEIPT_WRITE),
      ],
      schema: {
        tags: [TAG],
        operationId: "updateWithholdingTaxReceipt",
        summary: "Ubah bukti potong PPh (susun ulang jurnal)",
        security: [{ bearerAuth: [] }],
        params: WithholdingTaxReceiptIdParamsSchema,
        body: UpdateWithholdingTaxReceiptSchema,
        response: {
          200: createDataResponseSchema(WithholdingTaxReceiptResponseSchema),
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

      if (body.customerId) {
        const customer = await getCustomerById(businessId, body.customerId);
        if (!customer) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Pelanggan tidak ditemukan.");
        }
      }

      let updated;
      try {
        updated = await updateWithholdingTaxReceipt(businessId, id, body);
      } catch (err) {
        if (err instanceof WithholdingTaxReceiptValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, err.message);
        }
        throw err;
      }
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Bukti potong tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "withholding_tax_receipts",
        entityId: id,
        newValues: {
          customerId: updated.customerId,
          salesInvoiceId: updated.salesInvoiceId,
          amount: updated.amount,
        },
      };

      return sendData(reply, updated);
    },
  );

  app.post(
    `${base}/:id/copy`,
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.WITHHOLDING_TAX_RECEIPT_WRITE),
      ],
      schema: {
        tags: [TAG],
        operationId: "copyWithholdingTaxReceipt",
        summary:
          "Duplikat bukti potong (date hari ini); divalidasi ulang terhadap balanceDue faktur saat ini",
        security: [{ bearerAuth: [] }],
        params: WithholdingTaxReceiptIdParamsSchema,
        response: {
          201: createDataResponseSchema(WithholdingTaxReceiptResponseSchema),
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

      let copied;
      try {
        copied = await copyWithholdingTaxReceipt(businessId, id);
      } catch (err) {
        if (err instanceof WithholdingTaxReceiptValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, err.message);
        }
        throw err;
      }
      if (!copied) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Bukti potong tidak ditemukan.");
      }

      request.audit = {
        action: "CREATE",
        entityType: "withholding_tax_receipts",
        entityId: copied.id,
        newValues: {
          copiedFromId: id,
          salesInvoiceId: copied.salesInvoiceId,
          amount: copied.amount,
        },
      };

      return sendData(reply, copied, 201);
    },
  );

  app.delete(
    `${base}/:id`,
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.WITHHOLDING_TAX_RECEIPT_DELETE),
      ],
      schema: {
        tags: [TAG],
        operationId: "deleteWithholdingTaxReceipt",
        summary: "Hapus bukti potong PPh (soft-delete + jurnal terkait)",
        security: [{ bearerAuth: [] }],
        params: WithholdingTaxReceiptIdParamsSchema,
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

      const deleted = await softDeleteWithholdingTaxReceipt(businessId, id);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Bukti potong tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "withholding_tax_receipts",
        entityId: id,
      };

      return sendData(reply, { message: "Bukti potong berhasil dihapus." });
    },
  );
}

export default withholdingTaxReceiptRoutesPlugin;
