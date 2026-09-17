/**
 * UserRoutes (Guide §3.2, §3.3, §7.2).
 *
 * SEMUA endpoint di sini ber-scope tenant: wajib header `x-business-id`
 * dan user harus terdaftar di bisnis tersebut (requireBusinessScope).
 *
 * Route plugin biasa (TANPA fastify-plugin), didaftarkan di root path.
 * Setiap route WAJIB punya `operationId`.
 */
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import env from "../constants/env.js";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { isPgUniqueViolation } from "../libs/safe-error.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import {
  AssignUserBodySchema,
  BusinessMemberResponseSchema,
  MembershipResponseSchema,
  UpdateRoleBodySchema,
  UserCreateSchema,
  UserIdParamsSchema,
  UserListQuerySchema,
  UserResponseSchema,
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
import { createUser, listUsersByBusiness } from "../repositories/UserRepository.js";
import {
  addMemberToBusiness,
  changeMemberRole,
  removeMemberFromBusiness,
} from "../repositories/UserBusinessRoleRepository.js";

const BUSINESS_HEADER_NOTE =
  "Wajib mengirim header `x-business-id` berisi UUID bisnis yang sedang aktif.";

export async function userRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  const tenantScoped = [fastify.requireAuth, fastify.requireBusinessScope];

  // ===================================================================
  // GET /users — daftar anggota bisnis aktif (paginated)
  // ===================================================================
  app.get(
    "/users",
    {
      preHandler: [
        ...tenantScoped,
        fastify.requirePermissions(Permission.USER_READ),
      ],
      schema: {
        tags: ["Users"],
        operationId: "listUsers",
        summary: "Daftar user yang terhubung ke bisnis aktif",
        description: BUSINESS_HEADER_NOTE,
        security: [{ bearerAuth: [] }],
        querystring: UserListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(BusinessMemberResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize } = request.query;

      const { data, total } = await listUsersByBusiness(request.businessId!, {
        page,
        pageSize,
      });

      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  // ===================================================================
  // POST /users — buat akun user baru
  //
  // Endpoint ini HANYA membuat akun. Untuk menghubungkannya ke bisnis,
  // panggil POST /users/assign setelahnya.
  // ===================================================================
  app.post(
    "/users",
    {
      preHandler: [
        ...tenantScoped,
        fastify.requirePermissions(Permission.USER_CREATE),
      ],
      schema: {
        tags: ["Users"],
        operationId: "createUser",
        summary: "Buat akun user baru",
        description: `${BUSINESS_HEADER_NOTE} Akun yang dibuat belum terhubung ke bisnis mana pun — lanjutkan dengan POST /users/assign.`,
        security: [{ bearerAuth: [] }],
        body: UserCreateSchema,
        response: {
          201: createDataResponseSchema(UserResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          409: Conflict,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { name, email, password } = request.body;

      let user;
      try {
        user = await createUser({
          name,
          email,
          passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
        });
      } catch (error) {
        // Tanpa pre-check SELECT: dua request bersamaan dengan email sama
        // akan dijaga oleh UNIQUE constraint, bukan oleh cek aplikasi.
        if (isPgUniqueViolation(error)) {
          return sendError(
            reply,
            409,
            ErrorCode.CONFLICT,
            "Email tersebut sudah terdaftar.",
          );
        }
        throw error;
      }

      request.audit = {
        action: "CREATE",
        entityType: "users",
        entityId: user.id,
        newValues: { name: user.name, email: user.email },
      };

      return sendData(reply, user, 201);
    },
  );

  // ===================================================================
  // POST /users/assign — hubungkan user ke bisnis aktif
  // ===================================================================
  app.post(
    "/users/assign",
    {
      preHandler: [
        ...tenantScoped,
        fastify.requirePermissions(Permission.USER_ASSIGN),
      ],
      schema: {
        tags: ["Users"],
        operationId: "assignUserToBusiness",
        summary: "Hubungkan user yang sudah ada ke bisnis aktif",
        description: BUSINESS_HEADER_NOTE,
        security: [{ bearerAuth: [] }],
        body: AssignUserBodySchema,
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
      const { userId, role } = request.body;
      const businessId = request.businessId!;

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
  // PATCH /users/:userId/role — ubah role anggota
  // ===================================================================
  app.patch(
    "/users/:userId/role",
    {
      preHandler: [
        ...tenantScoped,
        fastify.requirePermissions(Permission.USER_UPDATE_ROLE),
      ],
      schema: {
        tags: ["Users"],
        operationId: "updateUserRole",
        summary: "Ubah role seorang anggota di bisnis aktif",
        description: `${BUSINESS_HEADER_NOTE} Admin terakhir tidak boleh diturunkan role-nya.`,
        security: [{ bearerAuth: [] }],
        params: UserIdParamsSchema,
        body: UpdateRoleBodySchema,
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
      const { userId } = request.params;
      const { role } = request.body;
      const businessId = request.businessId!;

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
  // DELETE /users/:userId — lepas anggota dari bisnis aktif
  //
  // Hanya memutus keanggotaan; akun user-nya sendiri tidak dihapus.
  // ===================================================================
  app.delete(
    "/users/:userId",
    {
      preHandler: [
        ...tenantScoped,
        fastify.requirePermissions(Permission.USER_REMOVE),
      ],
      schema: {
        tags: ["Users"],
        operationId: "removeUserFromBusiness",
        summary: "Lepaskan user dari bisnis aktif",
        description: `${BUSINESS_HEADER_NOTE} Akun user tidak dihapus, hanya keanggotaannya di bisnis ini.`,
        security: [{ bearerAuth: [] }],
        params: UserIdParamsSchema,
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
      const { userId } = request.params;
      const businessId = request.businessId!;

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

export default userRoutesPlugin;
