import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

/**
 * Late Payment Fee — denda keterlambatan pembayaran, NON-POSTING.
 *
 * Modul PALING SIMPEL: TANPA baris item, TANPA jurnal. amount diisi
 * MANUAL (bukan dihitung otomatis). salesInvoiceId WAJIB milik
 * customerId yang sama (divalidasi di repository).
 */
export const CreateLatePaymentFeeSchema = z.object({
  date: dateString,
  customerId: z.string().uuid(),
  salesInvoiceId: z.string().uuid(),
  amount: z.number().positive("Nominal denda harus lebih dari 0"),
});

export const UpdateLatePaymentFeeSchema = z.object({
  date: dateString.optional(),
  customerId: z.string().uuid().optional(),
  salesInvoiceId: z.string().uuid().optional(),
  amount: z.number().positive("Nominal denda harus lebih dari 0").optional(),
});

export const LatePaymentFeeListQuerySchema = SearchQuerySchema;

export const LatePaymentFeeIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid(),
});

export const LatePaymentFeeResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  date: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  salesInvoiceId: z.string(),
  salesInvoiceReference: z.string().nullable(),
  amount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
