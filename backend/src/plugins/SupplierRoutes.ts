/** Suppliers CRUD yang diproyeksikan dari contacts (is_supplier = true). */
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import {
  createSupplier,
  getSupplierById,
  isSupplierCodeInUse,
  listSuppliersByBusiness,
  softDeleteSupplier,
  updateSupplier,
} from "../repositories/ContactRepository.js";
import { BusinessIdParamsSchema } from "../schemas/Business.js";
import {
  SupplierCreateSchema,
  SupplierIdParamsSchema,
  SupplierListQuerySchema,
  SupplierResponseSchema,
  SupplierUpdateSchema,
} from "../schemas/Contact.js";
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

export async function supplierRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/suppliers",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.CONTACT_READ),
      ],
      schema: {
        tags: ["Suppliers"],
        operationId: "listSuppliers",
        summary: "Daftar supplier satu bisnis",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: SupplierListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(SupplierResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q } = request.query;
      const { data, total } = await listSuppliersByBusiness(
        request.params.businessId,
        { page, pageSize, q },
      );
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.post(
    "/businesses/:businessId/suppliers",
    {
      preHandler: [
        ...businessScoped,
        fastify.requireRole("admin", "accountant"),
      ],
      schema: {
        tags: ["Suppliers"],
        operationId: "createSupplier",
        summary: "Buat supplier baru",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: SupplierCreateSchema,
        response: {
          201: createDataResponseSchema(SupplierResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          409: Conflict,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;
      if (request.body.code && (await isSupplierCodeInUse(businessId, request.body.code))) {
        return sendError(
          reply,
          409,
          ErrorCode.CONFLICT,
          "Kode supplier sudah dipakai di bisnis ini.",
        );
      }

      const supplier = await createSupplier(businessId, request.body);
      request.audit = {
        action: "CREATE",
        entityType: "contacts",
        entityId: supplier.id,
        newValues: { code: supplier.code, name: supplier.name, isSupplier: true },
      };
      return sendData(reply, supplier, 201);
    },
  );

  app.get(
    "/businesses/:businessId/suppliers/:supplierId",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.CONTACT_READ),
      ],
      schema: {
        tags: ["Suppliers"],
        operationId: "getSupplier",
        summary: "Detail satu supplier",
        security: [{ bearerAuth: [] }],
        params: SupplierIdParamsSchema,
        response: {
          200: createDataResponseSchema(SupplierResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const supplier = await getSupplierById(
        request.params.businessId,
        request.params.supplierId,
      );
      return supplier
        ? sendData(reply, supplier)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Supplier tidak ditemukan.");
    },
  );

  app.patch(
    "/businesses/:businessId/suppliers/:supplierId",
    {
      preHandler: [
        ...businessScoped,
        fastify.requireRole("admin", "accountant"),
      ],
      schema: {
        tags: ["Suppliers"],
        operationId: "updateSupplier",
        summary: "Ubah data satu supplier",
        security: [{ bearerAuth: [] }],
        params: SupplierIdParamsSchema,
        body: SupplierUpdateSchema,
        response: {
          200: createDataResponseSchema(SupplierResponseSchema),
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
      const { businessId, supplierId } = request.params;
      const oldValues = await getSupplierById(businessId, supplierId);
      if (!oldValues) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Supplier tidak ditemukan.");
      }
      if (
        request.body.code &&
        (await isSupplierCodeInUse(businessId, request.body.code, supplierId))
      ) {
        return sendError(
          reply,
          409,
          ErrorCode.CONFLICT,
          "Kode supplier sudah dipakai di bisnis ini.",
        );
      }

      const supplier = await updateSupplier(businessId, supplierId, request.body);
      if (!supplier) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Supplier tidak ditemukan.");
      }
      request.audit = {
        action: "UPDATE",
        entityType: "contacts",
        entityId: supplier.id,
        oldValues: { code: oldValues.code, name: oldValues.name },
        newValues: { code: supplier.code, name: supplier.name, isSupplier: true },
      };
      return sendData(reply, supplier);
    },
  );

  app.delete(
    "/businesses/:businessId/suppliers/:supplierId",
    {
      preHandler: [
        ...businessScoped,
        fastify.requireRole("admin", "accountant"),
      ],
      schema: {
        tags: ["Suppliers"],
        operationId: "deleteSupplier",
        summary: "Hapus lunak satu supplier",
        security: [{ bearerAuth: [] }],
        params: SupplierIdParamsSchema,
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
      const { businessId, supplierId } = request.params;
      const existing = await getSupplierById(businessId, supplierId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Supplier tidak ditemukan.");
      }
      const deleted = await softDeleteSupplier(businessId, supplierId);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Supplier tidak ditemukan.");
      }
      request.audit = {
        action: "DELETE",
        entityType: "contacts",
        entityId: supplierId,
        oldValues: { code: existing.code, name: existing.name, isSupplier: true },
      };
      return sendData(reply, { message: "Supplier berhasil dihapus." });
    },
  );
}

export default supplierRoutesPlugin;
