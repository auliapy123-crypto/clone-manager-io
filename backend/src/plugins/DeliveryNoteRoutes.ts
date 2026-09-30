import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getCustomerById } from "../repositories/ContactRepository.js";
import {
  createDeliveryNote,
  DeliveryNoteValidationError,
  getDeliveryNoteById,
  listDeliveryNotes,
  softDeleteDeliveryNote,
  updateDeliveryNote,
  validateDeliveryNoteRelations,
} from "../repositories/DeliveryNoteRepository.js";
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
  CreateDeliveryNoteSchema,
  DeliveryNoteDetailResponseSchema,
  DeliveryNoteIdParamsSchema,
  DeliveryNoteListQuerySchema,
  DeliveryNoteResponseSchema,
  UpdateDeliveryNoteSchema,
} from "../schemas/DeliveryNote.js";

/**
 * Delivery Notes — surat jalan, dokumen administratif NON-POSTING.
 *
 * TIDAK ADA jurnal, TANPA status, dan TANPA nilai uang sama sekali
 * (baris item cuma Description + Qty). salesOrderId/salesInvoiceId
 * opsional dan HARUS milik Customer yang sama (validasi silang).
 */
export async function deliveryNoteRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/delivery-notes",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DELIVERY_NOTE_READ),
      ],
      schema: {
        tags: ["DeliveryNotes"],
        operationId: "listDeliveryNotes",
        summary: "Daftar surat jalan",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: DeliveryNoteListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(DeliveryNoteResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q } = request.query;
      const { data, total } = await listDeliveryNotes(
        request.params.businessId,
        { page, pageSize, q },
      );
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/delivery-notes/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DELIVERY_NOTE_READ),
      ],
      schema: {
        tags: ["DeliveryNotes"],
        operationId: "getDeliveryNote",
        summary: "Detail surat jalan + baris item",
        security: [{ bearerAuth: [] }],
        params: DeliveryNoteIdParamsSchema,
        response: {
          200: createDataResponseSchema(DeliveryNoteDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const note = await getDeliveryNoteById(
        request.params.businessId,
        request.params.id,
      );
      return note
        ? sendData(reply, note)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Surat jalan tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/delivery-notes",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DELIVERY_NOTE_WRITE),
      ],
      schema: {
        tags: ["DeliveryNotes"],
        operationId: "createDeliveryNote",
        summary: "Buat surat jalan baru (tanpa jurnal, tanpa nilai uang)",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateDeliveryNoteSchema,
        response: {
          201: createDataResponseSchema(DeliveryNoteDetailResponseSchema),
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
        await validateDeliveryNoteRelations(
          businessId,
          body.customerId,
          body.salesOrderId,
          body.salesInvoiceId,
        );
      } catch (err) {
        if (err instanceof DeliveryNoteValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, err.message);
        }
        throw err;
      }

      const note = await createDeliveryNote(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "delivery_notes",
        entityId: note.id,
        newValues: { reference: note.reference, customerId: note.customerId },
      };

      return sendData(reply, note, 201);
    },
  );

  app.put(
    "/businesses/:businessId/delivery-notes/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DELIVERY_NOTE_WRITE),
      ],
      schema: {
        tags: ["DeliveryNotes"],
        operationId: "updateDeliveryNote",
        summary: "Ubah surat jalan",
        security: [{ bearerAuth: [] }],
        params: DeliveryNoteIdParamsSchema,
        body: UpdateDeliveryNoteSchema,
        response: {
          200: createDataResponseSchema(DeliveryNoteDetailResponseSchema),
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

      // Validasi silang nilai efektif dijalankan DI DALAM repository
      // update (pakai nilai lama untuk field yang tidak dikirim).
      let updated;
      try {
        updated = await updateDeliveryNote(businessId, id, body);
      } catch (err) {
        if (err instanceof DeliveryNoteValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, err.message);
        }
        throw err;
      }
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Surat jalan tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "delivery_notes",
        entityId: id,
        newValues: { reference: updated.reference, customerId: updated.customerId },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/delivery-notes/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DELIVERY_NOTE_DELETE),
      ],
      schema: {
        tags: ["DeliveryNotes"],
        operationId: "deleteDeliveryNote",
        summary: "Hapus surat jalan (soft-delete, tanpa lock)",
        security: [{ bearerAuth: [] }],
        params: DeliveryNoteIdParamsSchema,
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

      const deleted = await softDeleteDeliveryNote(businessId, id);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Surat jalan tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "delivery_notes",
        entityId: id,
      };

      return sendData(reply, { message: "Surat jalan berhasil dihapus." });
    },
  );
}

export default deliveryNoteRoutesPlugin;
