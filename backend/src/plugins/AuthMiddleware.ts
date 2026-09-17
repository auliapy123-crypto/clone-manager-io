/**
 * AuthMiddleware (Guide §7.1 langkah 5, §7.2).
 *
 * Dibungkus fastify-plugin supaya hook dan dekoratornya berlaku untuk
 * seluruh instance, bukan cuma scope plugin ini.
 *
 * Isi plugin:
 *   1. preHandler global  -> mengisi `request.user` (null bila anonim).
 *      Error decode DITELAN di sini supaya route publik tetap jalan;
 *      penolakan 401 adalah tugas `requireAuth`.
 *   2. onResponse global  -> mencatat audit log untuk semua request non-GET
 *      yang berhasil.
 *   3. Dekorator guard    -> requireAuth, requireRole, requirePermissions,
 *      requireBusinessScope.
 *
 * Urutan pemakaian di route (jangan dibalik):
 *   preHandler: [requireAuth, requireBusinessScope, requireRole("admin")]
 */
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import fp from "fastify-plugin";
import { ErrorCode, ErrorMessage } from "../constants/errors.js";
import {
  permissionsForRole,
  type PermissionValue,
} from "../constants/permissions.js";
import type { AuditAction, BusinessRole } from "../db/schema.js";
import { verifyAccessToken } from "../libs/jwt.js";
import { sendError } from "../libs/reply.js";
import { createAuditLog } from "../repositories/AuditLogRepository.js";
import { getMembership } from "../repositories/UserBusinessRoleRepository.js";

export interface RequestUser {
  id: string;
  email: string;
}

/**
 * Diisi oleh handler route yang mengubah data, dibaca hook onResponse.
 * `audit_logs.entity_id` NOT NULL, jadi hook tidak bisa menebak sendiri —
 * route yang tahu entitas apa yang baru saja diubah.
 */
export interface AuditContext {
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: preHandlerHookHandler;
    requireBusinessScope: preHandlerHookHandler;
    /** Sama seperti requireBusinessScope, tapi businessId dari `:businessId` di path, bukan header. */
    requireBusinessScopeParam: preHandlerHookHandler;
    requireRole: (...roles: BusinessRole[]) => preHandlerHookHandler;
    requirePermissions: (
      ...permissions: PermissionValue[]
    ) => preHandlerHookHandler;
  }

  interface FastifyRequest {
    /** null bila request anonim. Guard `requireAuth` yang menolak. */
    user: RequestUser | null;
    /** Diisi `requireBusinessScope`. Batas tenant untuk semua query. */
    businessId: string | null;
    /** Diisi `requireBusinessScope`. Role user di bisnis aktif. */
    businessRole: BusinessRole | null;
    /** Diisi handler route yang mengubah data; dibaca hook onResponse. */
    audit: AuditContext | null;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authMiddleware(fastify: FastifyInstance) {
  // Fastify v5 melarang nilai awal bertipe referensi pada decorateRequest.
  fastify.decorateRequest("user", null);
  fastify.decorateRequest("businessId", null);
  fastify.decorateRequest("businessRole", null);
  fastify.decorateRequest("audit", null);

  // -------------------------------------------------------------------
  // 1. preHandler global — decode token, JANGAN menolak di sini
  // -------------------------------------------------------------------
  fastify.addHook("preHandler", async (request) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) return;

    try {
      const payload = verifyAccessToken(header.slice("Bearer ".length).trim());
      request.user = { id: payload.sub, email: payload.email };
    } catch {
      // Sengaja ditelan: route publik harus tetap jalan walau token busuk.
      request.user = null;
    }
  });

  // -------------------------------------------------------------------
  // 2. onResponse global — audit log untuk semua non-GET yang berhasil
  // -------------------------------------------------------------------
  fastify.addHook("onResponse", async (request, reply) => {
    if (request.method === "GET" || request.method === "HEAD") return;
    if (reply.statusCode >= 400) return;

    if (!request.audit) {
      // Bukan error — banyak endpoint non-GET yang tidak mengubah entitas
      // (mis. login). Tetap dicatat di log supaya tidak diam-diam hilang.
      request.log.debug(
        { method: request.method, url: request.url },
        "Non-GET tanpa audit context",
      );
      return;
    }

    try {
      await createAuditLog({
        businessId: request.businessId,
        userId: request.user?.id ?? null,
        action: request.audit.action,
        entityType: request.audit.entityType,
        entityId: request.audit.entityId,
        oldValues: request.audit.oldValues,
        newValues: request.audit.newValues,
      });
    } catch (error) {
      // Kegagalan audit tidak boleh menggagalkan request yang sudah dikirim.
      request.log.error({ err: error }, "Gagal menulis audit log");
    }
  });

  // -------------------------------------------------------------------
  // 3. Guard
  // -------------------------------------------------------------------
  const requireAuth: preHandlerHookHandler = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    if (!request.user) {
      return sendError(
        reply,
        401,
        ErrorCode.UNAUTHORIZED,
        ErrorMessage[ErrorCode.UNAUTHORIZED],
      );
    }
  };

  const requireBusinessScope: preHandlerHookHandler = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    if (!request.user) {
      return sendError(
        reply,
        401,
        ErrorCode.UNAUTHORIZED,
        ErrorMessage[ErrorCode.UNAUTHORIZED],
      );
    }

    const raw = request.headers["x-business-id"];
    const businessId = Array.isArray(raw) ? raw[0] : raw;

    if (!businessId) {
      return sendError(
        reply,
        400,
        ErrorCode.BAD_REQUEST,
        "Header x-business-id wajib diisi.",
      );
    }

    if (!UUID_PATTERN.test(businessId)) {
      return sendError(
        reply,
        400,
        ErrorCode.BAD_REQUEST,
        "Header x-business-id bukan UUID yang valid.",
      );
    }

    const membership = await getMembership(request.user.id, businessId);

    if (!membership) {
      return sendError(
        reply,
        403,
        ErrorCode.FORBIDDEN,
        "Anda tidak memiliki akses ke bisnis ini.",
      );
    }

    request.businessId = membership.businessId;
    request.businessRole = membership.role;
  };

  /**
   * Dipakai route Business (`/businesses/:businessId/...`) — businessId
   * datang dari path, bukan header `x-business-id`. Skema `params` route
   * sudah memvalidasi bentuk UUID-nya sebelum preHandler ini jalan, jadi
   * tidak perlu regex check manual seperti requireBusinessScope di atas.
   */
  const requireBusinessScopeParam: preHandlerHookHandler = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    if (!request.user) {
      return sendError(
        reply,
        401,
        ErrorCode.UNAUTHORIZED,
        ErrorMessage[ErrorCode.UNAUTHORIZED],
      );
    }

    const { businessId } = request.params as { businessId?: string };

    if (!businessId) {
      return sendError(
        reply,
        400,
        ErrorCode.BAD_REQUEST,
        "Parameter businessId wajib diisi.",
      );
    }

    const membership = await getMembership(request.user.id, businessId);

    if (!membership) {
      return sendError(
        reply,
        403,
        ErrorCode.FORBIDDEN,
        "Anda tidak memiliki akses ke bisnis ini.",
      );
    }

    request.businessId = membership.businessId;
    request.businessRole = membership.role;
  };

  const requireRole = (...roles: BusinessRole[]): preHandlerHookHandler => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.businessRole) {
        return sendError(
          reply,
          403,
          ErrorCode.FORBIDDEN,
          "Konteks bisnis belum ditentukan.",
        );
      }

      if (!roles.includes(request.businessRole)) {
        return sendError(
          reply,
          403,
          ErrorCode.FORBIDDEN,
          `Aksi ini hanya untuk role: ${roles.join(", ")}.`,
        );
      }
    };
  };

  const requirePermissions = (
    ...permissions: PermissionValue[]
  ): preHandlerHookHandler => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.businessRole) {
        return sendError(
          reply,
          403,
          ErrorCode.FORBIDDEN,
          "Konteks bisnis belum ditentukan.",
        );
      }

      const granted = permissionsForRole(request.businessRole);
      const missing = permissions.filter((p) => !granted.includes(p));

      if (missing.length > 0) {
        return sendError(
          reply,
          403,
          ErrorCode.FORBIDDEN,
          `Anda tidak memiliki izin: ${missing.join(", ")}.`,
        );
      }
    };
  };

  fastify.decorate("requireAuth", requireAuth);
  fastify.decorate("requireBusinessScope", requireBusinessScope);
  fastify.decorate("requireBusinessScopeParam", requireBusinessScopeParam);
  fastify.decorate("requireRole", requireRole);
  fastify.decorate("requirePermissions", requirePermissions);
}

export const authMiddlewarePlugin = fp(authMiddleware, {
  name: "auth-middleware",
});

export default authMiddlewarePlugin;
