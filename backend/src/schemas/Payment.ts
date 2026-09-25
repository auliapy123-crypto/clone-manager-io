import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const PaymentLineInputSchema = z.object({
  accountId: z.string().uuid(),
  purchaseInvoiceId: z.string().uuid().optional().nullable(),
  expenseClaimId: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(255).optional().nullable(),
  amount: z.number().min(0.01).max(Number.MAX_SAFE_INTEGER / 100).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001, "Maksimal dua desimal"),
}).refine(line => !(line.purchaseInvoiceId && line.expenseClaimId), { message: "Satu baris hanya boleh mengalokasikan ke Invoice ATAU Expense Claim" });

export const CreatePaymentSchema = z.object({
  date: dateString,
  reference: z.string().trim().min(1).max(50).optional().nullable(),
  bankAccountId: z.string().uuid(),
  contactId: z.string().uuid(),
  description: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(PaymentLineInputSchema)
    .min(1, "Pembayaran wajib punya minimal 1 baris item"),
});

export const UpdatePaymentSchema = z.object({
  date: dateString.optional(),
  reference: z.string().trim().min(1).max(50).optional().nullable(),
  bankAccountId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(PaymentLineInputSchema)
    .min(1, "Pembayaran wajib punya minimal 1 baris item")
    .optional(),
});

export const PaymentListQuerySchema = SearchQuerySchema;

export const PaymentIdParamsSchema = BusinessIdParamsSchema.extend({
  paymentId: z.string().uuid(),
});

export const PaymentLineResponseSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountCode: z.string(),
  accountName: z.string(),
  purchaseInvoiceId: z.string().nullable(),
  expenseClaimId: z.string().nullable(),
  description: z.string().nullable(),
  amount: z.number(),
  sortOrder: z.number(),
});

export const PaymentResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  date: z.string(),
  reference: z.string().nullable(),
  bankAccountId: z.string(),
  bankAccountName: z.string(),
  contactId: z.string(),
  contactName: z.string(),
  description: z.string().nullable(),
  totalAmount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PaymentDetailResponseSchema = PaymentResponseSchema.extend({
  lines: z.array(PaymentLineResponseSchema),
});
