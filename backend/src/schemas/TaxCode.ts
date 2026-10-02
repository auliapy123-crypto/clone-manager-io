import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

export const CreateTaxCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Kode pajak wajib diisi")
    .max(20, "Kode pajak maksimal 20 karakter"),
  name: z
    .string()
    .trim()
    .min(1, "Nama pajak wajib diisi")
    .max(100, "Nama pajak maksimal 100 karakter"),
  ratePercent: z.coerce
    .number()
    .min(0, "Tarif pajak minimal 0%")
    .max(100, "Tarif pajak maksimal 100%"),
  isActive: z.boolean().optional().default(true),
  description: z.string().trim().max(1000).optional().nullable(),
});

export const UpdateTaxCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Kode pajak wajib diisi")
    .max(20, "Kode pajak maksimal 20 karakter")
    .optional(),
  name: z
    .string()
    .trim()
    .min(1, "Nama pajak wajib diisi")
    .max(100, "Nama pajak maksimal 100 karakter")
    .optional(),
  ratePercent: z.coerce
    .number()
    .min(0, "Tarif pajak minimal 0%")
    .max(100, "Tarif pajak maksimal 100%")
    .optional(),
  isActive: z.boolean().optional(),
  description: z.string().trim().max(1000).optional().nullable(),
});

export const TaxCodeListQuerySchema = SearchQuerySchema.extend({
  isActive: z
    .preprocess((val) => {
      if (typeof val === "string") {
        if (val.toLowerCase() === "true") return true;
        if (val.toLowerCase() === "false") return false;
      }
      return val;
    }, z.boolean().optional()),
});

export const TaxCodeIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid("ID kode pajak tidak valid"),
});

export const TaxCodeResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  code: z.string(),
  name: z.string(),
  ratePercent: z.number(),
  isActive: z.boolean(),
  description: z.string().nullable(),
  usageCount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
