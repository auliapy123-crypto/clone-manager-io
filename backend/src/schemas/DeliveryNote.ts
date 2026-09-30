import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

/**
 * Delivery Note (Surat Jalan) — dokumen administratif NON-POSTING.
 *
 * BEDA dari semua modul lain yang punya baris item: baris CUMA
 * description + quantity — TANPA unit_price, TANPA line_total, TANPA
 * account_id. Tidak ada nilai uang, tidak ada status, tidak ada jurnal.
 */
export const DeliveryNoteLineInputSchema = z.object({
  description: z.string().trim().min(1, "Deskripsi item wajib diisi").max(255),
  quantity: z.number().positive("Kuantitas harus lebih dari 0").default(1),
});

export const CreateDeliveryNoteSchema = z.object({
  customerId: z.string().uuid(),
  deliveryDate: dateString,
  salesOrderId: z.string().uuid().nullable().optional(),
  salesInvoiceId: z.string().uuid().nullable().optional(),
  reference: z.string().trim().min(1).max(50).nullable().optional(),
  deliveryAddress: z.string().trim().max(2000).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  lines: z
    .array(DeliveryNoteLineInputSchema)
    .min(1, "Surat jalan wajib punya minimal 1 baris item"),
});

export const UpdateDeliveryNoteSchema = z.object({
  customerId: z.string().uuid().optional(),
  deliveryDate: dateString.optional(),
  salesOrderId: z.string().uuid().nullable().optional(),
  salesInvoiceId: z.string().uuid().nullable().optional(),
  reference: z.string().trim().min(1).max(50).nullable().optional(),
  deliveryAddress: z.string().trim().max(2000).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  lines: z
    .array(DeliveryNoteLineInputSchema)
    .min(1, "Surat jalan wajib punya minimal 1 baris item")
    .optional(),
});

export const DeliveryNoteListQuerySchema = SearchQuerySchema;

export const DeliveryNoteIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid(),
});

export const DeliveryNoteLineResponseSchema = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number(),
  sortOrder: z.number(),
});

export const DeliveryNoteResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  deliveryDate: z.string(),
  reference: z.string().nullable(),
  salesOrderId: z.string().nullable(),
  salesOrderReference: z.string().nullable(),
  salesInvoiceId: z.string().nullable(),
  salesInvoiceReference: z.string().nullable(),
  deliveryAddress: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const DeliveryNoteDetailResponseSchema =
  DeliveryNoteResponseSchema.extend({
    lines: z.array(DeliveryNoteLineResponseSchema),
  });
