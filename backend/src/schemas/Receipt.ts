import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const ReceiptLineInputSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().max(255).optional().nullable(),
  amount: z.number().positive("Nominal baris harus lebih dari 0"),
});

export const CreateReceiptSchema = z.object({
  date: dateString,
  reference: z.string().trim().min(1).max(50).optional().nullable(),
  bankAccountId: z.string().uuid(),
  contactId: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(ReceiptLineInputSchema)
    .min(1, "Penerimaan wajib punya minimal 1 baris item"),
});

export const UpdateReceiptSchema = z.object({
  date: dateString.optional(),
  reference: z.string().trim().min(1).max(50).optional().nullable(),
  bankAccountId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(ReceiptLineInputSchema)
    .min(1, "Penerimaan wajib punya minimal 1 baris item")
    .optional(),
});

export const ReceiptListQuerySchema = SearchQuerySchema;

export const ReceiptIdParamsSchema = BusinessIdParamsSchema.extend({
  receiptId: z.string().uuid(),
});

export const ReceiptLineResponseSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountCode: z.string(),
  accountName: z.string(),
  description: z.string().nullable(),
  amount: z.number(),
  sortOrder: z.number(),
});

export const ReceiptResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  date: z.string(),
  reference: z.string().nullable(),
  bankAccountId: z.string(),
  bankAccountName: z.string(),
  contactId: z.string().nullable(),
  contactName: z.string().nullable(),
  description: z.string().nullable(),
  totalAmount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ReceiptDetailResponseSchema = ReceiptResponseSchema.extend({
  lines: z.array(ReceiptLineResponseSchema),
});
