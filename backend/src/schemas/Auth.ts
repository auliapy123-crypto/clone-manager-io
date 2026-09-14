import { z } from "zod";
import { BusinessRoleSchema, UserResponseSchema } from "./User.js";

// --- Request ---------------------------------------------------------
export const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const RefreshBodySchema = z.object({
  refreshToken: z.string(),
});

export const ChangePasswordBodySchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// --- Response --------------------------------------------------------
export const TokenPairResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const LoginResponseSchema = TokenPairResponseSchema.extend({
  user: UserResponseSchema.pick({ id: true, name: true, email: true }),
});

export const SessionUserResponseSchema = UserResponseSchema;

/** Bisnis yang bisa dibuka user, dipakai untuk memilih x-business-id. */
export const MyBusinessResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseCurrencyCode: z.string(),
  role: BusinessRoleSchema,
});
