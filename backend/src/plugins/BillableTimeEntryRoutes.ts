import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getContactById, getCustomerById } from "../repositories/ContactRepository.js";
import {
  copyBillableTimeEntry,
  createBillableTimeEntry,
  getBillableTimeEntryById,
  listBillableTimeEntries,
  softDeleteBillableTimeEntry,
  updateBillableTimeEntry,
} from "../repositories/BillableTimeEntryRepository.js";
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
  BillableTimeEntryIdParamsSchema,
  BillableTimeEntryListQuerySchema,
  BillableTimeEntryResponseSchema,
  CreateBillableTimeEntrySchema,
  UpdateBillableTimeEntrySchema,
} from "../schemas/BillableTimeEntry.js";

/**
 * Billable Time — catatan jam kerja yang berpotensi ditagihkan,
 * NON-POSTING dan BERDIRI SENDIRI: TIDAK ADA jurnal, TIDAK ADA relasi
 * ke Sales Invoices apa pun. amount dihitung real-time; status SELALU
 * "Uninvoiced" (statis).
 */
export async function billableTimeEntryRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/billable-time",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.BILLABLE_TIME_READ),
      ],
      schema: {
        tags: ["BillableTime"],
        operationId: "listBillableTime",
        summary: "Daftar jam kerja yang ditagihkan",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: BillableTimeEntryListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(BillableTimeEntryResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q } = request.query;
      const { data, total } = await listBillableTimeEntries(
        request.params.businessId,
        { page, pageSize, q },
      );
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/billable-time/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.BILLABLE_TIME_READ),
      ],
      schema: {
        tags: ["BillableTime"],
        operationId: "getBillableTime",
        summary: "Detail entry jam kerja",
        security: [{ bearerAuth: [] }],
        params: BillableTimeEntryIdParamsSchema,
        response: {
          200: createDataResponseSchema(BillableTimeEntryResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const entry = await getBillableTimeEntryById(
        request.params.businessId,
        request.params.id,
      );
      return entry
        ? sendData(reply, entry)
        : sendError(
            reply,
            404,
            ErrorCode.NOT_FOUND,
            "Entry jam kerja tidak ditemukan.",
          );
    },
  );

  app.post(
    "/businesses/:businessId/billable-time",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.BILLABLE_TIME_WRITE),
      ],
      schema: {
        tags: ["BillableTime"],
        operationId: "createBillableTime",
        summary: "Catat jam kerja baru (tanpa jurnal, tanpa kaitan invoice)",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateBillableTimeEntrySchema,
        response: {
          201: createDataResponseSchema(BillableTimeEntryResponseSchema),
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

      // Employee = kontak mana pun di tabel contacts (TANPA flag khusus).
      const employee = await getContactById(businessId, body.employeeContactId);
      if (!employee) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "Kontak employee tidak ditemukan.",
        );
      }

      const entry = await createBillableTimeEntry(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "billable_time_entries",
        entityId: entry.id,
        newValues: {
          customerId: entry.customerId,
          amount: entry.amount,
          timeSpentMinutes: entry.timeSpentMinutes,
        },
      };

      return sendData(reply, entry, 201);
    },
  );

  app.put(
    "/businesses/:businessId/billable-time/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.BILLABLE_TIME_WRITE),
      ],
      schema: {
        tags: ["BillableTime"],
        operationId: "updateBillableTime",
        summary: "Ubah entry jam kerja",
        security: [{ bearerAuth: [] }],
        params: BillableTimeEntryIdParamsSchema,
        body: UpdateBillableTimeEntrySchema,
        response: {
          200: createDataResponseSchema(BillableTimeEntryResponseSchema),
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
      if (body.employeeContactId) {
        const employee = await getContactById(businessId, body.employeeContactId);
        if (!employee) {
          return sendError(
            reply,
            400,
            ErrorCode.BAD_REQUEST,
            "Kontak employee tidak ditemukan.",
          );
        }
      }

      const updated = await updateBillableTimeEntry(businessId, id, body);
      if (!updated) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "Entry jam kerja tidak ditemukan.",
        );
      }

      request.audit = {
        action: "UPDATE",
        entityType: "billable_time_entries",
        entityId: id,
        newValues: {
          customerId: updated.customerId,
          amount: updated.amount,
          timeSpentMinutes: updated.timeSpentMinutes,
        },
      };

      return sendData(reply, updated);
    },
  );

  app.post(
    "/businesses/:businessId/billable-time/:id/copy",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.BILLABLE_TIME_WRITE),
      ],
      schema: {
        tags: ["BillableTime"],
        operationId: "copyBillableTime",
        summary:
          "Duplikat entry jadi baru (date hari ini, field lain sama persis)",
        security: [{ bearerAuth: [] }],
        params: BillableTimeEntryIdParamsSchema,
        response: {
          201: createDataResponseSchema(BillableTimeEntryResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, id } = request.params;

      const copied = await copyBillableTimeEntry(businessId, id);
      if (!copied) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "Entry jam kerja tidak ditemukan.",
        );
      }

      request.audit = {
        action: "CREATE",
        entityType: "billable_time_entries",
        entityId: copied.id,
        newValues: {
          copiedFromId: id,
          customerId: copied.customerId,
          amount: copied.amount,
          timeSpentMinutes: copied.timeSpentMinutes,
        },
      };

      return sendData(reply, copied, 201);
    },
  );

  app.delete(
    "/businesses/:businessId/billable-time/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.BILLABLE_TIME_DELETE),
      ],
      schema: {
        tags: ["BillableTime"],
        operationId: "deleteBillableTime",
        summary: "Hapus entry jam kerja (soft-delete, tanpa lock)",
        security: [{ bearerAuth: [] }],
        params: BillableTimeEntryIdParamsSchema,
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

      const deleted = await softDeleteBillableTimeEntry(businessId, id);
      if (!deleted) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "Entry jam kerja tidak ditemukan.",
        );
      }

      request.audit = {
        action: "DELETE",
        entityType: "billable_time_entries",
        entityId: id,
      };

      return sendData(reply, { message: "Entry jam kerja berhasil dihapus." });
    },
  );
}

export default billableTimeEntryRoutesPlugin;
