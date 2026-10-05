import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { isPgUniqueViolation } from "../libs/safe-error.js";
import {
  CustomFieldValidationError,
  createDefinition,
  deleteDefinition,
  getDefinitionById,
  listDefinitions,
  listValues,
  updateDefinition,
  upsertCustomFieldValues,
} from "../repositories/CustomFieldRepository.js";
import { BusinessIdParamsSchema } from "../schemas/Business.js";
import {
  BadRequest,
  Conflict,
  createDataResponseSchema,
  createPaginatedResponseSchema,
  Forbidden,
  InternalServerError,
  MessageResponseSchema,
  NotFound,
  Unauthorized,
} from "../schemas/globals.js";
import {
  CreateCustomFieldDefinitionSchema,
  CustomFieldDefinitionListQuerySchema,
  CustomFieldDefinitionResponseSchema,
  CustomFieldIdParamsSchema,
  CustomFieldValueResponseSchema,
  ListCustomFieldValuesQuerySchema,
  UpdateCustomFieldDefinitionSchema,
  UpsertCustomFieldValuesSchema,
} from "../schemas/CustomField.js";

export async function customFieldRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  // 1/7 — List definisi (filter entityType, q, isActive)
  app.get(
    "/businesses/:businessId/custom-field-definitions",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.CUSTOM_FIELD_READ),
      ],
      schema: {
        tags: ["CustomFields"],
        operationId: "listCustomFieldDefinitions",
        summary: "Daftar definisi custom field per bisnis",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: CustomFieldDefinitionListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(CustomFieldDefinitionResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q, entityType, isActive } = request.query;
      const { data, total } = await listDefinitions(
        request.params.businessId,
        { page, pageSize, q, entityType, isActive },
      );
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  // 2/7 — Detail definisi (+ valuesCount)
  app.get(
    "/businesses/:businessId/custom-field-definitions/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.CUSTOM_FIELD_READ),
      ],
      schema: {
        tags: ["CustomFields"],
        operationId: "getCustomFieldDefinition",
        summary: "Detail definisi custom field",
        security: [{ bearerAuth: [] }],
        params: CustomFieldIdParamsSchema,
        response: {
          200: createDataResponseSchema(CustomFieldDefinitionResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const definition = await getDefinitionById(
        request.params.businessId,
        request.params.id,
      );
      return definition
        ? sendData(reply, definition)
        : sendError(
            reply,
            404,
            ErrorCode.NOT_FOUND,
            "Definisi custom field tidak ditemukan.",
          );
    },
  );

  // 3/7 — Buat definisi
  app.post(
    "/businesses/:businessId/custom-field-definitions",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.CUSTOM_FIELD_WRITE),
      ],
      schema: {
        tags: ["CustomFields"],
        operationId: "createCustomFieldDefinition",
        summary: "Buat definisi custom field baru",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateCustomFieldDefinitionSchema,
        response: {
          201: createDataResponseSchema(CustomFieldDefinitionResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          409: Conflict,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;
      const body = request.body;

      try {
        const definition = await createDefinition(businessId, body);

        request.audit = {
          action: "CREATE",
          entityType: "custom_field_definitions",
          entityId: definition.id,
          newValues: {
            entityType: definition.entityType,
            key: definition.key,
            label: definition.label,
            fieldType: definition.fieldType,
            isRequired: definition.isRequired,
            isActive: definition.isActive,
          },
        };

        return sendData(reply, definition, 201);
      } catch (error) {
        if (isPgUniqueViolation(error)) {
          return sendError(
            reply,
            409,
            ErrorCode.CONFLICT,
            "Key sudah digunakan untuk entity ini di bisnis ini.",
          );
        }
        if (error instanceof CustomFieldValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, error.message);
        }
        throw error;
      }
    },
  );

  // 4/7 — Update definisi (guard tipe/key setelah ada values)
  app.put(
    "/businesses/:businessId/custom-field-definitions/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.CUSTOM_FIELD_WRITE),
      ],
      schema: {
        tags: ["CustomFields"],
        operationId: "updateCustomFieldDefinition",
        summary: "Perbarui definisi custom field",
        security: [{ bearerAuth: [] }],
        params: CustomFieldIdParamsSchema,
        body: UpdateCustomFieldDefinitionSchema,
        response: {
          200: createDataResponseSchema(CustomFieldDefinitionResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          409: Conflict,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, id } = request.params;
      const body = request.body;

      const existing = await getDefinitionById(businessId, id);
      if (!existing) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "Definisi custom field tidak ditemukan.",
        );
      }

      try {
        const updated = await updateDefinition(businessId, id, body);
        if (!updated) {
          return sendError(
            reply,
            404,
            ErrorCode.NOT_FOUND,
            "Definisi custom field tidak ditemukan.",
          );
        }

        request.audit = {
          action: "UPDATE",
          entityType: "custom_field_definitions",
          entityId: id,
          oldValues: {
            key: existing.key,
            label: existing.label,
            fieldType: existing.fieldType,
            isRequired: existing.isRequired,
            isActive: existing.isActive,
          },
          newValues: {
            key: updated.key,
            label: updated.label,
            fieldType: updated.fieldType,
            isRequired: updated.isRequired,
            isActive: updated.isActive,
          },
        };

        return sendData(reply, updated);
      } catch (error) {
        if (isPgUniqueViolation(error)) {
          return sendError(
            reply,
            409,
            ErrorCode.CONFLICT,
            "Key sudah digunakan untuk entity ini di bisnis ini.",
          );
        }
        if (error instanceof CustomFieldValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, error.message);
        }
        throw error;
      }
    },
  );

  // 5/7 — Hapus definisi (soft-delete, tolak kalau masih ada values)
  app.delete(
    "/businesses/:businessId/custom-field-definitions/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.CUSTOM_FIELD_DELETE),
      ],
      schema: {
        tags: ["CustomFields"],
        operationId: "deleteCustomFieldDefinition",
        summary: "Hapus definisi custom field (soft-delete)",
        security: [{ bearerAuth: [] }],
        params: CustomFieldIdParamsSchema,
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

      const existing = await getDefinitionById(businessId, id);
      if (!existing) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "Definisi custom field tidak ditemukan.",
        );
      }

      let deleted: boolean;
      try {
        deleted = await deleteDefinition(businessId, id);
      } catch (err) {
        if (err instanceof CustomFieldValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, err.message);
        }
        throw err;
      }

      if (!deleted) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "Definisi custom field tidak ditemukan.",
        );
      }

      request.audit = {
        action: "DELETE",
        entityType: "custom_field_definitions",
        entityId: id,
        oldValues: {
          entityType: existing.entityType,
          key: existing.key,
          label: existing.label,
          fieldType: existing.fieldType,
        },
      };

      return sendData(reply, {
        message: "Definisi custom field berhasil dihapus.",
      });
    },
  );

  // 6/7 — Values satu record (termasuk definisi nonaktif yang belum dihapus)
  app.get(
    "/businesses/:businessId/custom-field-values",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.CUSTOM_FIELD_READ),
      ],
      schema: {
        tags: ["CustomFields"],
        operationId: "listCustomFieldValues",
        summary: "Daftar nilai custom field satu record",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: ListCustomFieldValuesQuerySchema,
        response: {
          200: createDataResponseSchema(z.array(CustomFieldValueResponseSchema)),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const rows = await listValues(
        request.params.businessId,
        request.query.entityType,
        request.query.recordId,
      );
      return sendData(reply, rows);
    },
  );

  // 7/7 — Upsert batch values (+ validasi required)
  app.put(
    "/businesses/:businessId/custom-field-values",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.CUSTOM_FIELD_WRITE),
      ],
      schema: {
        tags: ["CustomFields"],
        operationId: "upsertCustomFieldValues",
        summary:
          "Simpan/hapus nilai custom field satu record (batch) + validasi field wajib",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: UpsertCustomFieldValuesSchema,
        response: {
          200: createDataResponseSchema(z.array(CustomFieldValueResponseSchema)),
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

      try {
        const rows = await upsertCustomFieldValues(businessId, body);

        request.audit = {
          action: "UPDATE",
          entityType: "custom_field_values",
          entityId: body.recordId,
          newValues: {
            entityType: body.entityType,
            recordId: body.recordId,
            values: body.values,
          },
        };

        return sendData(reply, rows);
      } catch (error) {
        if (error instanceof CustomFieldValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, error.message);
        }
        throw error;
      }
    },
  );
}

export default customFieldRoutesPlugin;
