/**
 * AuthRoutes (Guide §3.2, §3.3, §7.2).
 *
 * Route plugin biasa (TANPA fastify-plugin) supaya encapsulation jalan.
 * Didaftarkan di root path dari src/index.ts — path lengkap ditulis di sini.
 *
 * Setiap route WAJIB punya `operationId` (dipakai audit log & generator
 * klien OpenAPI).
 */
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import env from "../constants/env.js";
import { ErrorCode } from "../constants/errors.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type SessionPayload,
} from "../libs/jwt.js";
import { sendData, sendError } from "../libs/reply.js";
import {
  ChangePasswordBodySchema,
  LoginBodySchema,
  LoginResponseSchema,
  MyBusinessResponseSchema,
  RefreshBodySchema,
  SessionUserResponseSchema,
  TokenPairResponseSchema,
} from "../schemas/Auth.js";
import {
  BadRequest,
  createDataResponseSchema,
  InternalServerError,
  MessageResponseSchema,
  NotFound,
  Unauthorized,
} from "../schemas/globals.js";
import {
  getUserById,
  getUserByEmail,
  getUserPasswordHash,
  updateUserPassword,
} from "../repositories/UserRepository.js";
import { listBusinessesForUser } from "../repositories/UserBusinessRoleRepository.js";

// Pesan login sengaja SAMA untuk email tidak terdaftar maupun password salah,
// supaya orang luar tidak bisa menebak email mana yang ada di sistem.
const INVALID_CREDENTIALS = "Email atau password salah.";

export async function authRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ===================================================================
  // POST /auth/login
  // ===================================================================
  app.post(
    "/auth/login",
    {
      schema: {
        tags: ["Auth"],
        operationId: "login",
        summary: "Login dengan email dan password",
        body: LoginBodySchema,
        response: {
          200: createDataResponseSchema(LoginResponseSchema),
          401: Unauthorized,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await getUserByEmail(email);
      if (!user) {
        return sendError(reply, 401, ErrorCode.UNAUTHORIZED, INVALID_CREDENTIALS);
      }

      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) {
        return sendError(reply, 401, ErrorCode.UNAUTHORIZED, INVALID_CREDENTIALS);
      }

      const payload = { sub: user.id, email: user.email };

      return sendData(reply, {
        accessToken: signAccessToken(payload),
        refreshToken: signRefreshToken(payload),
        user: { id: user.id, name: user.name, email: user.email },
      });
    },
  );

  // ===================================================================
  // POST /auth/refresh
  // ===================================================================
  app.post(
    "/auth/refresh",
    {
      schema: {
        tags: ["Auth"],
        operationId: "refreshToken",
        summary: "Tukar refresh token dengan sepasang token baru",
        body: RefreshBodySchema,
        response: {
          200: createDataResponseSchema(TokenPairResponseSchema),
          401: Unauthorized,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body;

      let payload: SessionPayload;
      try {
        payload = verifyRefreshToken(refreshToken);
      } catch {
        return sendError(
          reply,
          401,
          ErrorCode.UNAUTHORIZED,
          "Refresh token tidak valid atau sudah kedaluwarsa.",
        );
      }

      // User bisa saja sudah dihapus setelah token diterbitkan.
      const user = await getUserById(payload.sub);
      if (!user) {
        return sendError(
          reply,
          401,
          ErrorCode.UNAUTHORIZED,
          "User sudah tidak terdaftar.",
        );
      }

      const nextPayload = { sub: user.id, email: user.email };

      return sendData(reply, {
        accessToken: signAccessToken(nextPayload),
        refreshToken: signRefreshToken(nextPayload),
      });
    },
  );

  // ===================================================================
  // GET /auth/me
  // ===================================================================
  app.get(
    "/auth/me",
    {
      preHandler: [fastify.requireAuth],
      schema: {
        tags: ["Auth"],
        operationId: "getCurrentUser",
        summary: "Profil user yang sedang login",
        description: "Sekaligus dipakai frontend untuk cek token masih valid.",
        security: [{ bearerAuth: [] }],
        response: {
          200: createDataResponseSchema(SessionUserResponseSchema),
          401: Unauthorized,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const user = await getUserById(request.user!.id);

      if (!user) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "User tidak ditemukan.",
        );
      }

      return sendData(reply, user);
    },
  );

  // ===================================================================
  // GET /auth/me/businesses
  // Dipakai frontend untuk memilih bisnis aktif sebelum mengirim
  // header x-business-id di endpoint lain.
  // ===================================================================
  app.get(
    "/auth/me/businesses",
    {
      preHandler: [fastify.requireAuth],
      schema: {
        tags: ["Auth"],
        operationId: "listMyBusinesses",
        summary: "Daftar bisnis yang bisa diakses user yang sedang login",
        security: [{ bearerAuth: [] }],
        response: {
          200: createDataResponseSchema(z.array(MyBusinessResponseSchema)),
          401: Unauthorized,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const businesses = await listBusinessesForUser(request.user!.id);
      return sendData(reply, businesses);
    },
  );

  // ===================================================================
  // POST /auth/change-password
  // ===================================================================
  app.post(
    "/auth/change-password",
    {
      preHandler: [fastify.requireAuth],
      schema: {
        tags: ["Auth"],
        operationId: "changePassword",
        summary: "Ganti password milik user yang sedang login",
        security: [{ bearerAuth: [] }],
        body: ChangePasswordBodySchema,
        response: {
          200: MessageResponseSchema,
          400: BadRequest,
          401: Unauthorized,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { oldPassword, newPassword } = request.body;
      const userId = request.user!.id;

      if (oldPassword === newPassword) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "Password baru harus berbeda dari password lama.",
        );
      }

      const currentHash = await getUserPasswordHash(userId);
      if (!currentHash) {
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "User tidak ditemukan.",
        );
      }

      const isMatch = await bcrypt.compare(oldPassword, currentHash);
      if (!isMatch) {
        return sendError(
          reply,
          401,
          ErrorCode.UNAUTHORIZED,
          "Password lama salah.",
        );
      }

      await updateUserPassword(
        userId,
        await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS),
      );

      // Hash lama/baru TIDAK ikut dicatat di audit log.
      request.audit = {
        action: "UPDATE",
        entityType: "users",
        entityId: userId,
        newValues: { passwordChanged: true },
      };

      return sendData(reply, { message: "Password berhasil diubah." });
    },
  );
}

export default authRoutesPlugin;
