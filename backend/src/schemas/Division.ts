import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

export const DivisionStatusSchema = z.enum(["active", "inactive"]);
export type DivisionStatusType = z.infer<typeof DivisionStatusSchema>;

export const CreateDivisionSchema = z.object({
  name: z.string().trim().min(1, "Nama divisi wajib diisi").max(255),
  code: z.string().trim().min(1).max(50).optional().nullable(),
  status: DivisionStatusSchema.default("active"),
});

export const UpdateDivisionSchema = z.object({
  name: z.string().trim().min(1, "Nama divisi wajib diisi").max(255).optional(),
  code: z.string().trim().min(1).max(50).optional().nullable(),
  status: DivisionStatusSchema.optional(),
});

export const DivisionListQuerySchema = SearchQuerySchema.extend({
  status: DivisionStatusSchema.optional(),
});

export const DivisionIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid("ID divisi tidak valid"),
});

export const DivisionResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  status: DivisionStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});
