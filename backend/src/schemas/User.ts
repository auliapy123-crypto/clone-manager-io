import { z } from "zod";
import { PaginationQuerySchema } from "./globals.js";

// --- Request ---------------------------------------------------------
export const UserCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export const UserUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

/** Pagination baku dari globals.ts — jangan duplikasi field page/pageSize. */
export const UserListQuerySchema = PaginationQuerySchema;

export const BusinessRoleSchema = z.enum(["admin", "accountant", "viewer"]);

export const AssignUserBodySchema = z.object({
  userId: z.string().uuid(),
  role: BusinessRoleSchema,
});

export const UpdateRoleBodySchema = z.object({
  role: BusinessRoleSchema,
});

export const UserIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

// --- Response --------------------------------------------------------
export const UserResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  createdAt: z.string(),
});

/** User + role-nya di bisnis yang sedang aktif. */
export const BusinessMemberResponseSchema = UserResponseSchema.extend({
  role: BusinessRoleSchema,
});

export const MembershipResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  businessId: z.string(),
  role: BusinessRoleSchema,
});
