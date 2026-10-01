import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const DebitNoteLineInputSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().max(255).optional().nullable(),
  quantity: z.number().positive("Kuantitas harus lebih dari 0").default(1),
  unitPrice: z.number().min(0, "Harga satuan tidak boleh negatif"),
});

export const CreateDebitNoteSchema = z.object({
  supplierId: z.string().uuid(),
  date: dateString,
  debitNoteNumber: z.string().trim().min(1).max(50).optional().nullable(),
  /** Murni referensi informatif — kalau diisi HARUS milik supplierId yang sama. */
  purchaseInvoiceId: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(DebitNoteLineInputSchema)
    .min(1, "Nota debet wajib punya minimal 1 baris item"),
});

export const UpdateDebitNoteSchema = z.object({
  supplierId: z.string().uuid().optional(),
  date: dateString.optional(),
  debitNoteNumber: z.string().trim().min(1).max(50).optional().nullable(),
  purchaseInvoiceId: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(DebitNoteLineInputSchema)
    .min(1, "Nota debet wajib punya minimal 1 baris item")
    .optional(),
});

export const DebitNoteListQuerySchema = SearchQuerySchema;

export const DebitNoteIdParamsSchema = BusinessIdParamsSchema.extend({
  debitNoteId: z.string().uuid(),
});

export const DebitNoteLineResponseSchema = z.object({
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

export const DebitNoteResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  supplierId: z.string(),
  supplierName: z.string(),
  purchaseInvoiceId: z.string().nullable(),
  purchaseInvoiceReference: z.string().nullable(),
  debitNoteNumber: z.string().nullable(),
  date: z.string(),
  description: z.string().nullable(),
  totalAmount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const DebitNoteDetailResponseSchema = DebitNoteResponseSchema.extend({
  lines: z.array(DebitNoteLineResponseSchema),
});
