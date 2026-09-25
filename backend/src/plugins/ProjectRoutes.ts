import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getCustomerById } from "../repositories/ContactRepository.js";
import {
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  updateProject,
} from "../repositories/ProjectRepository.js";
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
  CreateProjectSchema,
  ProjectIdParamsSchema,
  ProjectListQuerySchema,
  ProjectResponseSchema,
  UpdateProjectSchema,
} from "../schemas/Project.js";

export async function projectRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/projects",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.PROJECT_READ),
      ],
      schema: {
        tags: ["Projects"],
        operationId: "listProjects",
        summary: "Daftar proyek per bisnis",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: ProjectListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(ProjectResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q, status } = request.query;
      const { data, total } = await listProjects(request.params.businessId, {
        page,
        pageSize,
        q,
        status,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/projects/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.PROJECT_READ),
      ],
      schema: {
        tags: ["Projects"],
        operationId: "getProject",
        summary: "Detail proyek",
        security: [{ bearerAuth: [] }],
        params: ProjectIdParamsSchema,
        response: {
          200: createDataResponseSchema(ProjectResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const project = await getProjectById(
        request.params.businessId,
        request.params.id,
      );
      return project
        ? sendData(reply, project)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Proyek tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/projects",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.PROJECT_WRITE),
      ],
      schema: {
        tags: ["Projects"],
        operationId: "createProject",
        summary: "Buat proyek baru",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateProjectSchema,
        response: {
          201: createDataResponseSchema(ProjectResponseSchema),
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

      if (body.customerId) {
        const customer = await getCustomerById(businessId, body.customerId);
        if (!customer) {
          return sendError(
            reply,
            400,
            ErrorCode.BAD_REQUEST,
            "Pelanggan tidak ditemukan di bisnis ini.",
          );
        }
      }

      const project = await createProject(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "projects",
        entityId: project.id,
        newValues: {
          name: project.name,
          code: project.code,
          status: project.status,
        },
      };

      return sendData(reply, project, 201);
    },
  );

  app.put(
    "/businesses/:businessId/projects/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.PROJECT_WRITE),
      ],
      schema: {
        tags: ["Projects"],
        operationId: "updateProject",
        summary: "Perbarui data proyek",
        security: [{ bearerAuth: [] }],
        params: ProjectIdParamsSchema,
        body: UpdateProjectSchema,
        response: {
          200: createDataResponseSchema(ProjectResponseSchema),
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

      const existing = await getProjectById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Proyek tidak ditemukan.");
      }

      if (body.customerId) {
        const customer = await getCustomerById(businessId, body.customerId);
        if (!customer) {
          return sendError(
            reply,
            400,
            ErrorCode.BAD_REQUEST,
            "Pelanggan tidak ditemukan di bisnis ini.",
          );
        }
      }

      const updated = await updateProject(businessId, id, body);
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Proyek tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "projects",
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
    "/businesses/:businessId/projects/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.PROJECT_DELETE),
      ],
      schema: {
        tags: ["Projects"],
        operationId: "deleteProject",
        summary: "Hapus proyek (soft-delete)",
        security: [{ bearerAuth: [] }],
        params: ProjectIdParamsSchema,
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

      const existing = await getProjectById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Proyek tidak ditemukan.");
      }

      const deleted = await deleteProject(businessId, id);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Proyek tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "projects",
        entityId: id,
        oldValues: {
          name: existing.name,
          code: existing.code,
          status: existing.status,
        },
      };

      return sendData(reply, { message: "Proyek berhasil dihapus." });
    },
  );
}

export default projectRoutesPlugin;
