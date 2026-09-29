import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

/**
 * Sales Quote — dokumen penawaran NON-POSTING.
 *
 * BEDA dari Purchase Orders: baris item TANPA account_id (tahap
 * penawaran belum menyentuh akuntansi), TANPA status, dan TANPA tombol
 * konversi ke modul lain.
 */
export const SalesQuoteLineInputSchema = z.object({
  description: z.string().trim().min(1, "Deskripsi item wajib diisi").max(255),
  quantity: z.number().positive("Kuantitas harus lebih dari 0").default(1),
  unitPrice: z.number().min(0, "Harga satuan tidak boleh negatif"),
});

export const CreateSalesQuoteSchema = z.object({
  customerId: z.string().uuid(),
  issueDate: dateString,
  validForDays: z
    .number()
    .int("Masa berlaku harus bilangan bulat")
    .positive("Masa berlaku harus lebih dari 0 hari")
    .nullable()
    .optional(),
  reference: z.string().trim().min(1).max(50).nullable().optional(),
  billingAddress: z.string().trim().max(2000).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  lines: z
    .array(SalesQuoteLineInputSchema)
    .min(1, "Penawaran wajib punya minimal 1 baris item"),
});

export const UpdateSalesQuoteSchema = z.object({
  customerId: z.string().uuid().optional(),
  issueDate: dateString.optional(),
  validForDays: z
    .number()
    .int("Masa berlaku harus bilangan bulat")
    .positive("Masa berlaku harus lebih dari 0 hari")
    .nullable()
    .optional(),
  reference: z.string().trim().min(1).max(50).nullable().optional(),
  billingAddress: z.string().trim().max(2000).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  lines: z
    .array(SalesQuoteLineInputSchema)
    .min(1, "Penawaran wajib punya minimal 1 baris item")
    .optional(),
});

export const SalesQuoteListQuerySchema = SearchQuerySchema;

export const SalesQuoteIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid(),
});

export const SalesQuoteLineResponseSchema = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  lineTotal: z.number(),
  sortOrder: z.number(),
});

export const SalesQuoteResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  issueDate: z.string(),
  validForDays: z.number().nullable(),
  reference: z.string().nullable(),
  billingAddress: z.string().nullable(),
  description: z.string().nullable(),
  totalAmount: z.number(),
  expiryDate: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const SalesQuoteDetailResponseSchema = SalesQuoteResponseSchema.extend({
  lines: z.array(SalesQuoteLineResponseSchema),
});
