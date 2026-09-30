import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

/**
 * Status penawaran pembelian — DISIMPAN di kolom `status`, bukan
 * dihitung. User bebas mengubah kapan pun (tanpa validasi transisi).
 */
export const PurchaseQuoteStatusSchema = z.enum([
  "Draft",
  "Accepted",
  "Rejected",
]);

export type PurchaseQuoteStatus = z.infer<typeof PurchaseQuoteStatusSchema>;

export const PurchaseQuoteLineInputSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().max(255).optional().nullable(),
  quantity: z.number().positive("Kuantitas harus lebih dari 0").default(1),
  unitPrice: z.number().min(0, "Harga satuan tidak boleh negatif"),
});

export const CreatePurchaseQuoteSchema = z.object({
  supplierId: z.string().uuid(),
  date: dateString,
  quoteNumber: z.string().trim().max(50).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  status: PurchaseQuoteStatusSchema.default("Draft"),
  lines: z
    .array(PurchaseQuoteLineInputSchema)
    .min(1, "Penawaran wajib punya minimal 1 baris item"),
});

export const UpdatePurchaseQuoteSchema = z.object({
  supplierId: z.string().uuid().optional(),
  date: dateString.optional(),
  quoteNumber: z.string().trim().max(50).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  status: PurchaseQuoteStatusSchema.optional(),
  lines: z
    .array(PurchaseQuoteLineInputSchema)
    .min(1, "Penawaran wajib punya minimal 1 baris item")
    .optional(),
});

export const PurchaseQuoteListQuerySchema = SearchQuerySchema.extend({
  status: PurchaseQuoteStatusSchema.optional(),
});

export const PurchaseQuoteIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid(),
});

export const PurchaseQuoteLineResponseSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountCode: z.string(),
  accountName: z.string(),
  description: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  lineTotal: z.number(),
  sortOrder: z.number(),
});

export const PurchaseQuoteResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  supplierId: z.string(),
  supplierName: z.string(),
  date: z.string(),
  quoteNumber: z.string().nullable(),
  description: z.string().nullable(),
  status: PurchaseQuoteStatusSchema,
  totalAmount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PurchaseQuoteDetailResponseSchema =
  PurchaseQuoteResponseSchema.extend({
    lines: z.array(PurchaseQuoteLineResponseSchema),
  });
