/**
 * BusinessRoutes (Guide §3.2, §3.3, §7.2).
 *
 * Modul Business: CRUD bisnis (`/businesses`) dan pengelolaan anggotanya
 * (`/businesses/:businessId/members/*`). businessId di sini datang dari
 * PATH, bukan header `x-business-id` — makanya route ber-scope bisnis di
 * bawah pakai `requireBusinessScopeParam`, bukan `requireBusinessScope`.
 *
 * Endpoint `/businesses/:businessId/members/*` SENGAJA tidak menulis ulang
 * logika assign/update-role/remove — semuanya dipanggil dari fungsi
 * bersama di UserBusinessRoleRepository.ts (addMemberToBusiness,
 * changeMemberRole, removeMemberFromBusiness), yang juga dipakai
 * UserRoutes.ts (/users/*, dipertahankan sementara untuk kompatibilitas).
 *
 * Route plugin biasa (TANPA fastify-plugin), didaftarkan di root path.
 * Setiap route WAJIB punya `operationId`.
 */
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import {
  AddBusinessMemberBodySchema,
  BusinessCreateSchema,
  BusinessIdParamsSchema,
  BusinessMemberParamsSchema,
  BusinessResponseSchema,
  BusinessSummaryResponseSchema,
  BusinessUpdateSchema,
  UpdateBusinessMemberRoleBodySchema,
} from "../schemas/Business.js";
import {
  BusinessMemberResponseSchema,
  MembershipResponseSchema,
  UserListQuerySchema,
} from "../schemas/User.js";
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
  createBusinessWithAdmin,
  getBusinessById,
  updateBusiness,
} from "../repositories/BusinessRepository.js";
import { listUsersByBusiness } from "../repositories/UserRepository.js";
import {
  addMemberToBusiness,
  changeMemberRole,
  listBusinessesForUser,
  removeMemberFromBusiness,
} from "../repositories/UserBusinessRoleRepository.js";

export async function businessRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  // ===================================================================
  // GET /businesses — daftar bisnis milik user yang login
  // ===================================================================
  app.get(
    "/businesses",
    {
      preHandler: [fastify.requireAuth],
      schema: {
        tags: ["Business"],
        operationId: "listBusinesses",
        summary: "Daftar bisnis yang bisa diakses user yang sedang login",
        security: [{ bearerAuth: [] }],
        response: {
          200: createDataResponseSchema(z.array(BusinessSummaryResponseSchema)),
          401: Unauthorized,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const list = await listBusinessesForUser(request.user!.id);
      return sendData(reply, list);
    },
  );

  // ===================================================================
  // POST /businesses — buat bisnis baru, pembuatnya otomatis jadi admin
  // ===================================================================
  app.post(
    "/businesses",
    {
      preHandler: [fastify.requireAuth],
      schema: {
        tags: ["Business"],
        operationId: "createBusiness",
        summary: "Buat bisnis baru",
        description: "Pembuatnya otomatis menjadi admin bisnis ini.",
        security: [{ bearerAuth: [] }],
        body: BusinessCreateSchema,
        response: {
          201: createDataResponseSchema(BusinessResponseSchema),
          401: Unauthorized,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { name, baseCurrencyCode } = request.body;

      const business = await createBusinessWithAdmin(
        { name, baseCurrencyCode },
        request.user!.id,
      );

      request.audit = {
        action: "CREATE",
        entityType: "businesses",
        entityId: business.id,
        newValues: { name: business.name, baseCurrencyCode: business.baseCurrencyCode },
      };

      return sendData(reply, business, 201);
    },
  );

  // ===================================================================
  // GET /businesses/:businessId — detail satu bisnis
  // ===================================================================
  app.get(
    "/businesses/:businessId",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.BUSINESS_READ),
      ],
      schema: {
        tags: ["Business"],
        operationId: "getBusiness",
        summary: "Detail satu bisnis",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        response: {
          200: createDataResponseSchema(BusinessResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const business = await getBusinessById(request.params.businessId);
      if (!business) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "Bisnis tidak ditemukan.",
        );
      }

      return sendData(reply, business);
    },
  );

  // ===================================================================
  // PATCH /businesses/:businessId — update nama/currency, admin only
  // ===================================================================
  app.patch(
    "/businesses/:businessId",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.BUSINESS_UPDATE),
      ],
      schema: {
        tags: ["Business"],
        operationId: "updateBusiness",
        summary: "Ubah nama atau mata uang dasar bisnis",
        description: "Hanya admin bisnis ini yang boleh mengubah.",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: BusinessUpdateSchema,
        response: {
          200: createDataResponseSchema(BusinessResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;
      const oldValues = await getBusinessById(businessId);

      const updated = await updateBusiness(businessId, request.body);
      if (!updated) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "Bisnis tidak ditemukan.",
        );
      }

      request.audit = {
        action: "UPDATE",
        entityType: "businesses",
        entityId: updated.id,
        oldValues: oldValues
          ? { name: oldValues.name, baseCurrencyCode: oldValues.baseCurrencyCode }
          : null,
        newValues: { name: updated.name, baseCurrencyCode: updated.baseCurrencyCode },
      };

      return sendData(reply, updated);
    },
  );

  // ===================================================================
  // GET /businesses/:businessId/members — daftar anggota (paginated)
  // Ganti dari GET /users (masih ada untuk sementara).
  // ===================================================================
  app.get(
    "/businesses/:businessId/members",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.USER_READ),
      ],
      schema: {
        tags: ["Business"],
        operationId: "listBusinessMembers",
        summary: "Daftar anggota bisnis",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: UserListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(BusinessMemberResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize } = request.query;

      const { data, total } = await listUsersByBusiness(
        request.params.businessId,
        { page, pageSize },
      );

      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  // ===================================================================
  // POST /businesses/:businessId/members — hubungkan user ke bisnis
  // Ganti dari POST /users/assign (masih ada untuk sementara).
  // ===================================================================
  app.post(
    "/businesses/:businessId/members",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.USER_ASSIGN),
      ],
      schema: {
        tags: ["Business"],
        operationId: "addBusinessMember",
        summary: "Tambah anggota ke bisnis",
        description: "userId harus akun yang sudah ada (lihat POST /users).",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: AddBusinessMemberBodySchema,
        response: {
          201: createDataResponseSchema(MembershipResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          409: Conflict,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;
      const { userId, role } = request.body;

      const result = await addMemberToBusiness(businessId, userId, role);

      if (result.status === "user_not_found") {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "User tidak ditemukan.",
        );
      }

      if (result.status === "already_member") {
        return sendError(
          reply,
          409,
          ErrorCode.CONFLICT,
          "User sudah terhubung ke bisnis ini.",
        );
      }

      request.audit = {
        action: "CREATE",
        entityType: "user_business_roles",
        entityId: result.membership.id,
        newValues: { userId, role },
      };

      return sendData(reply, result.membership, 201);
    },
  );

  // ===================================================================
  // PATCH /businesses/:businessId/members/:userId — ubah role anggota
  // Ganti dari PATCH /users/:userId/role (masih ada untuk sementara).
  // ===================================================================
  app.patch(
    "/businesses/:businessId/members/:userId",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.USER_UPDATE_ROLE),
      ],
      schema: {
        tags: ["Business"],
        operationId: "updateBusinessMemberRole",
        summary: "Ubah role seorang anggota bisnis",
        description: "Admin terakhir tidak boleh diturunkan role-nya.",
        security: [{ bearerAuth: [] }],
        params: BusinessMemberParamsSchema,
        body: UpdateBusinessMemberRoleBodySchema,
        response: {
          200: createDataResponseSchema(MembershipResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          409: Conflict,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, userId } = request.params;
      const { role } = request.body;

      const result = await changeMemberRole(businessId, userId, role);

      if (result.status === "not_member") {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "User tidak terdaftar di bisnis ini.",
        );
      }

      if (result.status === "last_admin") {
        return sendError(
          reply,
          409,
          ErrorCode.CONFLICT,
          "Bisnis harus memiliki minimal satu admin.",
        );
      }

      if (result.status === "unchanged") {
        return sendData(reply, result.membership);
      }

      request.audit = {
        action: "UPDATE",
        entityType: "user_business_roles",
        entityId: result.membership.id,
        oldValues: { role: result.previousRole },
        newValues: { role: result.membership.role },
      };

      return sendData(reply, result.membership);
    },
  );

  // ===================================================================
  // DELETE /businesses/:businessId/members/:userId — lepas anggota
  // Ganti dari DELETE /users/:userId (masih ada untuk sementara).
  // ===================================================================
  app.delete(
    "/businesses/:businessId/members/:userId",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.USER_REMOVE),
      ],
      schema: {
        tags: ["Business"],
        operationId: "removeBusinessMember",
        summary: "Lepaskan anggota dari bisnis",
        description: "Akun user tidak dihapus, hanya keanggotaannya di bisnis ini.",
        security: [{ bearerAuth: [] }],
        params: BusinessMemberParamsSchema,
        response: {
          200: MessageResponseSchema,
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
      const { businessId, userId } = request.params;

      const result = await removeMemberFromBusiness(
        businessId,
        userId,
        request.user!.id,
      );

      if (result.status === "self_removal") {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "Anda tidak bisa mengeluarkan diri sendiri dari bisnis ini.",
        );
      }

      if (result.status === "not_member") {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "User tidak terdaftar di bisnis ini.",
        );
      }

      if (result.status === "last_admin") {
        return sendError(
          reply,
          409,
          ErrorCode.CONFLICT,
          "Bisnis harus memiliki minimal satu admin.",
        );
      }

      request.audit = {
        action: "DELETE",
        entityType: "user_business_roles",
        entityId: result.membership.id,
        oldValues: { userId, role: result.membership.role },
      };

      return sendData(reply, {
        message: "User berhasil dilepaskan dari bisnis ini.",
      });
    },
  );
}

export default businessRoutesPlugin;
