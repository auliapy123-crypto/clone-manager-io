import { z } from "zod";
import { BusinessRoleSchema } from "./User.js";

// --- Request ---------------------------------------------------------
export const BusinessCreateSchema = z.object({
  name: z.string().min(1).max(225),
  baseCurrencyCode: z.string().length(3).default("IDR"),
});

export const BusinessUpdateSchema = z
  .object({
    name: z.string().min(1).max(225).optional(),
    baseCurrencyCode: z.string().length(3).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Minimal satu field (name atau baseCurrencyCode) harus diisi.",
  });

export const BusinessIdParamsSchema = z.object({
  businessId: z.string().uuid(),
});

export const BusinessMemberParamsSchema = BusinessIdParamsSchema.extend({
  userId: z.string().uuid(),
});

export const AddBusinessMemberBodySchema = z.object({
  userId: z.string().uuid(),
  role: BusinessRoleSchema,
});

export const UpdateBusinessMemberRoleBodySchema = z.object({
  role: BusinessRoleSchema,
});

// --- Response --------------------------------------------------------
export const BusinessResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseCurrencyCode: z.string(),
  createdAt: z.string(),
});

/** Dipakai daftar GET /businesses — sertakan role user di bisnis itu. */
export const BusinessSummaryResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseCurrencyCode: z.string(),
  role: BusinessRoleSchema,
});
