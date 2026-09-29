import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const CreditNoteLineInputSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().max(255).optional().nullable(),
  quantity: z.number().positive("Kuantitas harus lebih dari 0").default(1),
  unitPrice: z.number().min(0, "Harga satuan tidak boleh negatif"),
});

export const CreateCreditNoteSchema = z.object({
  customerId: z.string().uuid(),
  issueDate: dateString,
  reference: z.string().trim().min(1).max(50).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(CreditNoteLineInputSchema)
    .min(1, "Nota kredit wajib punya minimal 1 baris item"),
});

export const UpdateCreditNoteSchema = z.object({
  customerId: z.string().uuid().optional(),
  issueDate: dateString.optional(),
  reference: z.string().trim().min(1).max(50).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(CreditNoteLineInputSchema)
    .min(1, "Nota kredit wajib punya minimal 1 baris item")
    .optional(),
});

export const CreditNoteListQuerySchema = SearchQuerySchema;

export const CreditNoteIdParamsSchema = BusinessIdParamsSchema.extend({
  creditNoteId: z.string().uuid(),
});

export const CreditNoteLineResponseSchema = z.object({
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

export const CreditNoteResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  reference: z.string().nullable(),
  issueDate: z.string(),
  description: z.string().nullable(),
  totalAmount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreditNoteDetailResponseSchema = CreditNoteResponseSchema.extend({
  lines: z.array(CreditNoteLineResponseSchema),
});
