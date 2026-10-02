import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { isPgUniqueViolation } from "../libs/safe-error.js";
import {
  createTaxCode,
  deleteTaxCode,
  getTaxCodeById,
  listTaxCodes,
  updateTaxCode,
  TaxCodeValidationError,
} from "../repositories/TaxCodeRepository.js";
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
  CreateTaxCodeSchema,
  TaxCodeIdParamsSchema,
  TaxCodeListQuerySchema,
  TaxCodeResponseSchema,
  UpdateTaxCodeSchema,
} from "../schemas/TaxCode.js";

export async function taxCodeRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/tax-codes",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.TAX_CODE_READ),
      ],
      schema: {
        tags: ["TaxCodes"],
        operationId: "listTaxCodes",
        summary: "Daftar kode pajak per bisnis",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: TaxCodeListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(TaxCodeResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q, isActive } = request.query;
      const { data, total } = await listTaxCodes(request.params.businessId, {
        page,
        pageSize,
        q,
        isActive,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/tax-codes/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.TAX_CODE_READ),
      ],
      schema: {
        tags: ["TaxCodes"],
        operationId: "getTaxCode",
        summary: "Detail kode pajak",
        security: [{ bearerAuth: [] }],
        params: TaxCodeIdParamsSchema,
        response: {
          200: createDataResponseSchema(TaxCodeResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const taxCode = await getTaxCodeById(
        request.params.businessId,
        request.params.id,
      );
      return taxCode
        ? sendData(reply, taxCode)
        : sendError(
            reply,
            404,
            ErrorCode.NOT_FOUND,
            "Kode pajak tidak ditemukan.",
          );
    },
  );

  app.post(
    "/businesses/:businessId/tax-codes",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.TAX_CODE_WRITE),
      ],
      schema: {
        tags: ["TaxCodes"],
        operationId: "createTaxCode",
        summary: "Buat kode pajak baru",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateTaxCodeSchema,
        response: {
          201: createDataResponseSchema(TaxCodeResponseSchema),
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
        const taxCode = await createTaxCode(businessId, body);

        request.audit = {
          action: "CREATE",
          entityType: "tax_codes",
          entityId: taxCode.id,
          newValues: {
            code: taxCode.code,
            name: taxCode.name,
            ratePercent: taxCode.ratePercent,
            isActive: taxCode.isActive,
          },
        };

        return sendData(reply, taxCode, 201);
      } catch (error) {
        if (isPgUniqueViolation(error)) {
          return sendError(
            reply,
            409,
            ErrorCode.CONFLICT,
            "Kode pajak sudah digunakan di bisnis ini.",
          );
        }
        if (error instanceof TaxCodeValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, error.message);
        }
        throw error;
      }
    },
  );

  app.put(
    "/businesses/:businessId/tax-codes/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.TAX_CODE_WRITE),
      ],
      schema: {
        tags: ["TaxCodes"],
        operationId: "updateTaxCode",
        summary: "Perbarui data kode pajak",
        security: [{ bearerAuth: [] }],
        params: TaxCodeIdParamsSchema,
        body: UpdateTaxCodeSchema,
        response: {
          200: createDataResponseSchema(TaxCodeResponseSchema),
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

      const existing = await getTaxCodeById(businessId, id);
      if (!existing) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "Kode pajak tidak ditemukan.",
        );
      }

      try {
        const updated = await updateTaxCode(businessId, id, body);
        if (!updated) {
          return sendError(
            reply,
            404,
            ErrorCode.NOT_FOUND,
            "Kode pajak tidak ditemukan.",
          );
        }

        request.audit = {
          action: "UPDATE",
          entityType: "tax_codes",
          entityId: id,
          oldValues: {
            code: existing.code,
            name: existing.name,
            ratePercent: existing.ratePercent,
            isActive: existing.isActive,
          },
          newValues: {
            code: updated.code,
            name: updated.name,
            ratePercent: updated.ratePercent,
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
            "Kode pajak sudah digunakan di bisnis ini.",
          );
        }
        if (error instanceof TaxCodeValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, error.message);
        }
        throw error;
      }
    },
  );

  app.delete(
    "/businesses/:businessId/tax-codes/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.TAX_CODE_DELETE),
      ],
      schema: {
        tags: ["TaxCodes"],
        operationId: "deleteTaxCode",
        summary: "Hapus kode pajak (soft-delete)",
        security: [{ bearerAuth: [] }],
        params: TaxCodeIdParamsSchema,
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

      const existing = await getTaxCodeById(businessId, id);
      if (!existing) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "Kode pajak tidak ditemukan.",
        );
      }

      let deleted: boolean;
      try {
        deleted = await deleteTaxCode(businessId, id);
      } catch (err) {
        if (err instanceof TaxCodeValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, err.message);
        }
        throw err;
      }

      if (!deleted) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "Kode pajak tidak ditemukan.",
        );
      }

      request.audit = {
        action: "DELETE",
        entityType: "tax_codes",
        entityId: id,
        oldValues: {
          code: existing.code,
          name: existing.name,
          ratePercent: existing.ratePercent,
          isActive: existing.isActive,
        },
      };

      return sendData(reply, { message: "Kode pajak berhasil dihapus." });
    },
  );
}

export default taxCodeRoutesPlugin;
