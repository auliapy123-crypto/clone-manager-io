import { z } from "zod";
import { ACCOUNT_CATEGORIES } from "../db/schema.js";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

export const AccountCategorySchema = z.enum(ACCOUNT_CATEGORIES);

// --- Request ---------------------------------------------------------
export const AccountCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(225),
  category: AccountCategorySchema,
  groupName: z.string().max(100).optional(),
  currencyCode: z.string().length(3).default("IDR"),
  isControlAccount: z.boolean().default(false),
});

export const AccountUpdateSchema = z
  .object({
    code: z.string().min(1).max(50).optional(),
    name: z.string().min(1).max(225).optional(),
    category: AccountCategorySchema.optional(),
    groupName: z.string().max(100).nullable().optional(),
    currencyCode: z.string().length(3).optional(),
    isControlAccount: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Minimal satu field harus diisi.",
  });

/** Dipakai GET /businesses/:businessId/accounts — pencarian bebas + filter kategori. */
export const AccountListQuerySchema = SearchQuerySchema.extend({
  category: AccountCategorySchema.optional(),
});

export const AccountIdParamsSchema = BusinessIdParamsSchema.extend({
  accountId: z.string().uuid(),
});

// --- Response --------------------------------------------------------
export const AccountResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  code: z.string(),
  name: z.string(),
  category: AccountCategorySchema,
  groupName: z.string().nullable(),
  currencyCode: z.string(),
  isControlAccount: z.boolean(),
});
