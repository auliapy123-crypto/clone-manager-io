import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const PurchaseInvoiceStatusSchema = z.enum(["Unpaid", "Overdue", "Paid"]);

export const PurchaseInvoiceLineInputSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().max(255).optional().nullable(),
  quantity: z.number().positive("Kuantitas harus lebih dari 0").default(1),
  unitPrice: z.number().min(0, "Harga satuan tidak boleh negatif"),
});

export const CreatePurchaseInvoiceSchema = z.object({
  supplierId: z.string().uuid(),
  reference: z.string().trim().min(1).max(50).optional(),
  issueDate: dateString,
  dueDate: dateString.optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  quoteNumber: z.string().trim().max(50).optional().nullable(),
  orderNumber: z.string().trim().max(50).optional().nullable(),
  purchaseOrderId: z.string().uuid().optional().nullable(),
  lines: z
    .array(PurchaseInvoiceLineInputSchema)
    .min(1, "Faktur wajib punya minimal 1 baris item"),
});

export const UpdatePurchaseInvoiceSchema = z.object({
  supplierId: z.string().uuid().optional(),
  reference: z.string().trim().min(1).max(50).optional().nullable(),
  issueDate: dateString.optional(),
  dueDate: dateString.optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  quoteNumber: z.string().trim().max(50).optional().nullable(),
  orderNumber: z.string().trim().max(50).optional().nullable(),
  purchaseOrderId: z.string().uuid().optional().nullable(),
  lines: z
    .array(PurchaseInvoiceLineInputSchema)
    .min(1, "Faktur wajib punya minimal 1 baris item")
    .optional(),
});

export const PurchaseInvoiceListQuerySchema = SearchQuerySchema.extend({
  status: PurchaseInvoiceStatusSchema.optional(),
});

export const PurchaseInvoiceIdParamsSchema = BusinessIdParamsSchema.extend({
  invoiceId: z.string().uuid(),
});

export const PurchaseInvoiceLineResponseSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountCode: z.string(),
  accountName: z.string(),
  description: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  subtotal: z.number(),
  sortOrder: z.number(),
});

export const PurchaseInvoiceResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  supplierId: z.string(),
  supplierName: z.string(),
  reference: z.string().nullable(),
  issueDate: z.string(),
  dueDate: z.string().nullable(),
  description: z.string().nullable(),
  quoteNumber: z.string().nullable(),
  orderNumber: z.string().nullable(),
  purchaseOrderId: z.string().nullable(),
  invoiceAmount: z.number(),
  balanceDue: z.number(),
  status: PurchaseInvoiceStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PurchaseInvoiceDetailResponseSchema =
  PurchaseInvoiceResponseSchema.extend({
    lines: z.array(PurchaseInvoiceLineResponseSchema),
  });
