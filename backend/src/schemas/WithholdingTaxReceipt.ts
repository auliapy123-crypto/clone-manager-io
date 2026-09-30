import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

/**
 * Withholding Tax Receipt — bukti potong PPh dari pelanggan. POSTING:
 * Debit akun Asset pilihan, Kredit akun kontrol AR. Mengurangi balanceDue
 * Sales Invoice yang dipilih (divalidasi di repository).
 */
export const CreateWithholdingTaxReceiptSchema = z.object({
  date: dateString,
  customerId: z.string().uuid(),
  salesInvoiceId: z.string().uuid(),
  withholdingTaxAccountId: z.string().uuid(),
  amount: z.number().positive("Nominal pajak yang dipotong harus lebih dari 0"),
  reference: z.string().trim().max(50).nullable().optional(),
  description: z.string().trim().nullable().optional(),
});

export const UpdateWithholdingTaxReceiptSchema = z.object({
  date: dateString.optional(),
  customerId: z.string().uuid().optional(),
  salesInvoiceId: z.string().uuid().optional(),
  withholdingTaxAccountId: z.string().uuid().optional(),
  amount: z
    .number()
    .positive("Nominal pajak yang dipotong harus lebih dari 0")
    .optional(),
  reference: z.string().trim().max(50).nullable().optional(),
  description: z.string().trim().nullable().optional(),
});

export const WithholdingTaxReceiptListQuerySchema = SearchQuerySchema;

export const WithholdingTaxReceiptIdParamsSchema = BusinessIdParamsSchema.extend(
  {
    id: z.string().uuid(),
  },
);

export const WithholdingTaxReceiptResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  date: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  salesInvoiceId: z.string(),
  salesInvoiceReference: z.string().nullable(),
  withholdingTaxAccountId: z.string(),
  withholdingTaxAccountCode: z.string(),
  withholdingTaxAccountName: z.string(),
  amount: z.number(),
  reference: z.string().nullable(),
  description: z.string().nullable(),
  status: z.literal("Applied"),
  createdAt: z.date(),
  updatedAt: z.date(),
});
