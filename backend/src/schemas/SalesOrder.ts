import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

/**
 * Sales Order — pesanan penjualan NON-POSTING.
 *
 * Mirip Sales Quote TAPI TANPA validForDays, TANPA billingAddress.
 * Baris item TANPA account_id, TANPA status, TANPA konversi otomatis.
 */
export const SalesOrderLineInputSchema = z.object({
  description: z.string().trim().min(1, "Deskripsi item wajib diisi").max(255),
  quantity: z.number().positive("Kuantitas harus lebih dari 0").default(1),
  unitPrice: z.number().min(0, "Harga satuan tidak boleh negatif"),
});

export const CreateSalesOrderSchema = z.object({
  customerId: z.string().uuid(),
  issueDate: dateString,
  reference: z.string().trim().min(1).max(50).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  lines: z
    .array(SalesOrderLineInputSchema)
    .min(1, "Pesanan wajib punya minimal 1 baris item"),
});

export const UpdateSalesOrderSchema = z.object({
  customerId: z.string().uuid().optional(),
  issueDate: dateString.optional(),
  reference: z.string().trim().min(1).max(50).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  lines: z
    .array(SalesOrderLineInputSchema)
    .min(1, "Pesanan wajib punya minimal 1 baris item")
    .optional(),
});

export const SalesOrderListQuerySchema = SearchQuerySchema;

export const SalesOrderIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid(),
});

export const SalesOrderLineResponseSchema = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  lineTotal: z.number(),
  sortOrder: z.number(),
});

export const SalesOrderResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  issueDate: z.string(),
  reference: z.string().nullable(),
  description: z.string().nullable(),
  totalAmount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const SalesOrderDetailResponseSchema = SalesOrderResponseSchema.extend({
  lines: z.array(SalesOrderLineResponseSchema),
});
