import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { listAllContacts } from "../repositories/ContactRepository.js";
import { Permission } from "../constants/permissions.js";
import { BusinessIdParamsSchema } from "../schemas/Business.js";
import { PaginationQuerySchema, createPaginatedResponseSchema, Unauthorized, Forbidden } from "../schemas/globals.js";
import { sendPaginated } from "../libs/reply.js";

export default async function contactRoutesPlugin(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().get("/businesses/:businessId/contacts", {
    preHandler: [fastify.requireAuth, fastify.requireBusinessScopeParam, fastify.requirePermissions(Permission.CONTACT_READ)],
    schema: { tags: ["Contacts"], operationId: "listContacts", security: [{ bearerAuth: [] }], params: BusinessIdParamsSchema, querystring: PaginationQuerySchema,
      response: { 200: createPaginatedResponseSchema(z.object({ id: z.string(), name: z.string(), code: z.string().nullable() })), 401: Unauthorized, 403: Forbidden } },
  }, async (request, reply) => {
    const { page, pageSize } = request.query;
    const { data, total } = await listAllContacts(request.params.businessId, { page, pageSize });
    return sendPaginated(reply, data, total, page, pageSize);
  });
}
