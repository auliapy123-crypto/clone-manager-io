import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const PurchaseOrderStatusSchema = z.enum([
  "Draft/Open",
  "Partially Invoiced",
  "Fully Invoiced/Closed",
]);

export const PurchaseOrderLineInputSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().max(255).optional().nullable(),
  quantity: z.number().positive("Kuantitas harus lebih dari 0").default(1),
  unitPrice: z.number().min(0, "Harga satuan tidak boleh negatif"),
});

export const CreatePurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  reference: z.string().trim().min(1).max(50).optional().nullable(),
  date: dateString,
  billingAddress: z.string().trim().max(2000).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(PurchaseOrderLineInputSchema)
    .min(1, "PO wajib punya minimal 1 baris item"),
});

export const UpdatePurchaseOrderSchema = z.object({
  supplierId: z.string().uuid().optional(),
  reference: z.string().trim().min(1).max(50).optional().nullable(),
  date: dateString.optional(),
  billingAddress: z.string().trim().max(2000).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(PurchaseOrderLineInputSchema)
    .min(1, "PO wajib punya minimal 1 baris item")
    .optional(),
});

export const PurchaseOrderListQuerySchema = SearchQuerySchema.extend({
  status: PurchaseOrderStatusSchema.optional(),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
});

export const PurchaseOrderIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid(),
});

export const PurchaseOrderLineResponseSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountCode: z.string(),
  accountName: z.string(),
  description: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  lineAmount: z.number(),
  sortOrder: z.number(),
});

export const PurchaseOrderResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  supplierId: z.string(),
  supplierName: z.string(),
  reference: z.string().nullable(),
  date: z.string(),
  billingAddress: z.string().nullable(),
  description: z.string().nullable(),
  totalOrderAmount: z.number(),
  invoicedAmount: z.number(),
  status: PurchaseOrderStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PurchaseOrderDetailResponseSchema =
  PurchaseOrderResponseSchema.extend({
    lines: z.array(PurchaseOrderLineResponseSchema),
  });
