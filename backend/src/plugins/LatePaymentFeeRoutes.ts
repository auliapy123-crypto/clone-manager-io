import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getCustomerById } from "../repositories/ContactRepository.js";
import {
  createLatePaymentFee,
  LatePaymentFeeValidationError,
  listLatePaymentFees,
  softDeleteLatePaymentFee,
  updateLatePaymentFee,
  validateInvoiceBelongsToCustomer,
} from "../repositories/LatePaymentFeeRepository.js";
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
  CreateLatePaymentFeeSchema,
  LatePaymentFeeIdParamsSchema,
  LatePaymentFeeListQuerySchema,
  LatePaymentFeeResponseSchema,
  UpdateLatePaymentFeeSchema,
} from "../schemas/LatePaymentFee.js";

/**
 * Late Payment Fees — denda keterlambatan pembayaran, NON-POSTING.
 *
 * Modul PALING SIMPEL: TANPA baris item, TANPA jurnal, dan (sesuai
 * dokumen §2.2/§11) TANPA endpoint GET detail terpisah — cuma
 * list/create/update/delete.
 */
export async function latePaymentFeeRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/late-payment-fees",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.LATE_PAYMENT_FEE_READ),
      ],
      schema: {
        tags: ["LatePaymentFees"],
        operationId: "listLatePaymentFees",
        summary: "Daftar denda keterlambatan pembayaran",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: LatePaymentFeeListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(LatePaymentFeeResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q } = request.query;
      const { data, total } = await listLatePaymentFees(
        request.params.businessId,
        { page, pageSize, q },
      );
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.post(
    "/businesses/:businessId/late-payment-fees",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.LATE_PAYMENT_FEE_WRITE),
      ],
      schema: {
        tags: ["LatePaymentFees"],
        operationId: "createLatePaymentFee",
        summary: "Catat denda keterlambatan baru (tanpa jurnal)",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateLatePaymentFeeSchema,
        response: {
          201: createDataResponseSchema(LatePaymentFeeResponseSchema),
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

      try {
        await validateInvoiceBelongsToCustomer(
          businessId,
          body.salesInvoiceId,
          body.customerId,
        );
      } catch (err) {
        if (err instanceof LatePaymentFeeValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, err.message);
        }
        throw err;
      }

      const fee = await createLatePaymentFee(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "late_payment_fees",
        entityId: fee.id,
        newValues: { customerId: fee.customerId, amount: fee.amount },
      };

      return sendData(reply, fee, 201);
    },
  );

  app.put(
    "/businesses/:businessId/late-payment-fees/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.LATE_PAYMENT_FEE_WRITE),
      ],
      schema: {
        tags: ["LatePaymentFees"],
        operationId: "updateLatePaymentFee",
        summary: "Ubah denda keterlambatan",
        security: [{ bearerAuth: [] }],
        params: LatePaymentFeeIdParamsSchema,
        body: UpdateLatePaymentFeeSchema,
        response: {
          200: createDataResponseSchema(LatePaymentFeeResponseSchema),
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
        updated = await updateLatePaymentFee(businessId, id, body);
      } catch (err) {
        if (err instanceof LatePaymentFeeValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, err.message);
        }
        throw err;
      }

      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Denda tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "late_payment_fees",
        entityId: id,
        newValues: { customerId: updated.customerId, amount: updated.amount },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/late-payment-fees/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.LATE_PAYMENT_FEE_DELETE),
      ],
      schema: {
        tags: ["LatePaymentFees"],
        operationId: "deleteLatePaymentFee",
        summary: "Hapus denda keterlambatan (soft-delete, tanpa lock)",
        security: [{ bearerAuth: [] }],
        params: LatePaymentFeeIdParamsSchema,
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

      const deleted = await softDeleteLatePaymentFee(businessId, id);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Denda tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "late_payment_fees",
        entityId: id,
      };

      return sendData(reply, { message: "Denda berhasil dihapus." });
    },
  );
}

export default latePaymentFeeRoutesPlugin;
