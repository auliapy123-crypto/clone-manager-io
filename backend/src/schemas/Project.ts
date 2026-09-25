import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

export const ProjectStatusSchema = z.enum(["active", "inactive", "completed"]);
export type ProjectStatusType = z.infer<typeof ProjectStatusSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1, "Nama proyek wajib diisi").max(255),
  code: z.string().trim().min(1).max(50).optional().nullable(),
  customerId: z.string().uuid("Customer ID tidak valid").optional().nullable(),
  status: ProjectStatusSchema.default("active"),
});

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1, "Nama proyek wajib diisi").max(255).optional(),
  code: z.string().trim().min(1).max(50).optional().nullable(),
  customerId: z.string().uuid("Customer ID tidak valid").optional().nullable(),
  status: ProjectStatusSchema.optional(),
});

export const ProjectListQuerySchema = SearchQuerySchema.extend({
  status: ProjectStatusSchema.optional(),
});

export const ProjectIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid("ID proyek tidak valid"),
});

export const ProjectResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  status: ProjectStatusSchema,
  totalIncome: z.number(),
  totalExpenses: z.number(),
  netProfit: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
