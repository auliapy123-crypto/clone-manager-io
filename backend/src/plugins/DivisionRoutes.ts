import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import {
  createDivision,
  deleteDivision,
  DivisionValidationError,
  getDivisionById,
  listDivisions,
  updateDivision,
} from "../repositories/DivisionRepository.js";
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
  CreateDivisionSchema,
  DivisionIdParamsSchema,
  DivisionListQuerySchema,
  DivisionResponseSchema,
  UpdateDivisionSchema,
} from "../schemas/Division.js";

/**
 * Divisions (Departemen/Cabang) — label/tag pengelompokan, MIRROR pola
 * Projects TANPA perhitungan keuangan. TIDAK posting jurnal.
 */
export async function divisionRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/divisions",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DIVISION_READ),
      ],
      schema: {
        tags: ["Divisions"],
        operationId: "listDivisions",
        summary: "Daftar divisi/departemen per bisnis",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: DivisionListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(DivisionResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q, status } = request.query;
      const { data, total } = await listDivisions(request.params.businessId, {
        page,
        pageSize,
        q,
        status,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/divisions/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DIVISION_READ),
      ],
      schema: {
        tags: ["Divisions"],
        operationId: "getDivision",
        summary: "Detail divisi",
        security: [{ bearerAuth: [] }],
        params: DivisionIdParamsSchema,
        response: {
          200: createDataResponseSchema(DivisionResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const division = await getDivisionById(
        request.params.businessId,
        request.params.id,
      );
      return division
        ? sendData(reply, division)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Divisi tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/divisions",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DIVISION_WRITE),
      ],
      schema: {
        tags: ["Divisions"],
        operationId: "createDivision",
        summary: "Buat divisi baru",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateDivisionSchema,
        response: {
          201: createDataResponseSchema(DivisionResponseSchema),
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

      const division = await createDivision(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "divisions",
        entityId: division.id,
        newValues: {
          name: division.name,
          code: division.code,
          status: division.status,
        },
      };

      return sendData(reply, division, 201);
    },
  );

  app.put(
    "/businesses/:businessId/divisions/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DIVISION_WRITE),
      ],
      schema: {
        tags: ["Divisions"],
        operationId: "updateDivision",
        summary: "Perbarui data divisi",
        security: [{ bearerAuth: [] }],
        params: DivisionIdParamsSchema,
        body: UpdateDivisionSchema,
        response: {
          200: createDataResponseSchema(DivisionResponseSchema),
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

      const existing = await getDivisionById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Divisi tidak ditemukan.");
      }

      const updated = await updateDivision(businessId, id, body);
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Divisi tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "divisions",
        entityId: id,
        oldValues: {
          name: existing.name,
          code: existing.code,
          status: existing.status,
        },
        newValues: {
          name: updated.name,
          code: updated.code,
          status: updated.status,
        },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/divisions/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DIVISION_DELETE),
      ],
      schema: {
        tags: ["Divisions"],
        operationId: "deleteDivision",
        summary: "Hapus divisi (soft-delete)",
        security: [{ bearerAuth: [] }],
        params: DivisionIdParamsSchema,
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

      const existing = await getDivisionById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Divisi tidak ditemukan.");
      }

      let deleted: boolean;
      try {
        deleted = await deleteDivision(businessId, id);
      } catch (err) {
        // Checkpoint 2: deleteDivision menolak kalau masih ada dokumen
        // aktif bertag (DivisionValidationError -> 400).
        if (err instanceof DivisionValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, err.message);
        }
        throw err;
      }
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Divisi tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "divisions",
        entityId: id,
        oldValues: {
          name: existing.name,
          code: existing.code,
          status: existing.status,
        },
      };

      return sendData(reply, { message: "Divisi berhasil dihapus." });
    },
  );
}

export default divisionRoutesPlugin;
