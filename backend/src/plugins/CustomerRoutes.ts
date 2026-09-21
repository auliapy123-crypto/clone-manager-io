/** Customers CRUD yang diproyeksikan dari contacts (is_customer = true). */
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import {
  createCustomer,
  getCustomerById,
  isCustomerCodeInUse,
  listCustomersByBusiness,
  softDeleteCustomer,
  updateCustomer,
} from "../repositories/ContactRepository.js";
import { BusinessIdParamsSchema } from "../schemas/Business.js";
import {
  CustomerCreateSchema,
  CustomerIdParamsSchema,
  CustomerListQuerySchema,
  CustomerResponseSchema,
  CustomerUpdateSchema,
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

export async function customerRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get("/businesses/:businessId/customers", {
    preHandler: [...businessScoped, fastify.requirePermissions(Permission.CONTACT_READ)],
    schema: {
      tags: ["Customers"], operationId: "listCustomers", summary: "Daftar pelanggan satu bisnis",
      security: [{ bearerAuth: [] }], params: BusinessIdParamsSchema, querystring: CustomerListQuerySchema,
      response: { 200: createPaginatedResponseSchema(CustomerResponseSchema), 401: Unauthorized, 403: Forbidden, 500: InternalServerError },
    },
  }, async (request, reply) => {
    const { page, pageSize, q } = request.query;
    const { data, total } = await listCustomersByBusiness(request.params.businessId, { page, pageSize, q });
    return sendPaginated(reply, data, total, page, pageSize);
  });

  app.post("/businesses/:businessId/customers", {
    preHandler: [...businessScoped, fastify.requirePermissions(Permission.CONTACT_WRITE)],
    schema: {
      tags: ["Customers"], operationId: "createCustomer", summary: "Buat pelanggan baru",
      security: [{ bearerAuth: [] }], params: BusinessIdParamsSchema, body: CustomerCreateSchema,
      response: { 201: createDataResponseSchema(CustomerResponseSchema), 401: Unauthorized, 403: Forbidden, 409: Conflict, 500: InternalServerError },
    },
  }, async (request, reply) => {
    const { businessId } = request.params;
    if (request.body.code && await isCustomerCodeInUse(businessId, request.body.code)) {
      return sendError(reply, 409, ErrorCode.CONFLICT, "Kode pelanggan sudah dipakai di bisnis ini.");
    }
    const customer = await createCustomer(businessId, request.body);
    request.audit = { action: "CREATE", entityType: "contacts", entityId: customer.id, newValues: { code: customer.code, name: customer.name, isCustomer: true } };
    return sendData(reply, customer, 201);
  });

  app.get("/businesses/:businessId/customers/:customerId", {
    preHandler: [...businessScoped, fastify.requirePermissions(Permission.CONTACT_READ)],
    schema: {
      tags: ["Customers"], operationId: "getCustomer", summary: "Detail satu pelanggan",
      security: [{ bearerAuth: [] }], params: CustomerIdParamsSchema,
      response: { 200: createDataResponseSchema(CustomerResponseSchema), 401: Unauthorized, 403: Forbidden, 404: NotFound, 500: InternalServerError },
    },
  }, async (request, reply) => {
    const customer = await getCustomerById(request.params.businessId, request.params.customerId);
    return customer ? sendData(reply, customer) : sendError(reply, 404, ErrorCode.NOT_FOUND, "Pelanggan tidak ditemukan.");
  });

  app.patch("/businesses/:businessId/customers/:customerId", {
    preHandler: [...businessScoped, fastify.requirePermissions(Permission.CONTACT_WRITE)],
    schema: {
      tags: ["Customers"], operationId: "updateCustomer", summary: "Ubah data satu pelanggan",
      security: [{ bearerAuth: [] }], params: CustomerIdParamsSchema, body: CustomerUpdateSchema,
      response: { 200: createDataResponseSchema(CustomerResponseSchema), 400: BadRequest, 401: Unauthorized, 403: Forbidden, 404: NotFound, 409: Conflict, 500: InternalServerError },
    },
  }, async (request, reply) => {
    const { businessId, customerId } = request.params;
    const oldValues = await getCustomerById(businessId, customerId);
    if (!oldValues) return sendError(reply, 404, ErrorCode.NOT_FOUND, "Pelanggan tidak ditemukan.");
    if (request.body.code && await isCustomerCodeInUse(businessId, request.body.code, customerId)) {
      return sendError(reply, 409, ErrorCode.CONFLICT, "Kode pelanggan sudah dipakai di bisnis ini.");
    }
    const customer = await updateCustomer(businessId, customerId, request.body);
    if (!customer) return sendError(reply, 404, ErrorCode.NOT_FOUND, "Pelanggan tidak ditemukan.");
    request.audit = { action: "UPDATE", entityType: "contacts", entityId: customer.id, oldValues: { code: oldValues.code, name: oldValues.name }, newValues: { code: customer.code, name: customer.name, isCustomer: true } };
    return sendData(reply, customer);
  });

  app.delete("/businesses/:businessId/customers/:customerId", {
    preHandler: [...businessScoped, fastify.requirePermissions(Permission.CONTACT_WRITE)],
    schema: {
      tags: ["Customers"], operationId: "deleteCustomer", summary: "Hapus lunak satu pelanggan",
      security: [{ bearerAuth: [] }], params: CustomerIdParamsSchema,
      response: { 200: MessageResponseSchema, 401: Unauthorized, 403: Forbidden, 404: NotFound, 500: InternalServerError },
    },
  }, async (request, reply) => {
    const { businessId, customerId } = request.params;
    const existing = await getCustomerById(businessId, customerId);
    if (!existing) return sendError(reply, 404, ErrorCode.NOT_FOUND, "Pelanggan tidak ditemukan.");
    const deleted = await softDeleteCustomer(businessId, customerId);
    if (!deleted) return sendError(reply, 404, ErrorCode.NOT_FOUND, "Pelanggan tidak ditemukan.");
    request.audit = { action: "DELETE", entityType: "contacts", entityId: customerId, oldValues: { code: existing.code, name: existing.name, isCustomer: true } };
    return sendData(reply, { message: "Pelanggan berhasil dihapus." });
  });
}

export default customerRoutesPlugin;
