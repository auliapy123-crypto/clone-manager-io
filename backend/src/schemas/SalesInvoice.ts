import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const SalesInvoiceStatusSchema = z.enum(["Unpaid", "Overdue", "Paid"]);

export const SalesInvoiceLineInputSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().max(255).optional().nullable(),
  quantity: z.number().positive("Kuantitas harus lebih dari 0").default(1),
  unitPrice: z.number().min(0, "Harga satuan tidak boleh negatif"),
  taxRatePercent: z.number().min(0, "Tarif pajak tidak boleh negatif").default(0),
});

export const CreateSalesInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  reference: z.string().trim().min(1).max(50).optional(),
  issueDate: dateString,
  dueDate: dateString.optional(),
  billingAddress: z.string().trim().max(2000).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(SalesInvoiceLineInputSchema)
    .min(1, "Faktur wajib punya minimal 1 baris item"),
});

export const UpdateSalesInvoiceSchema = z.object({
  customerId: z.string().uuid().optional(),
  reference: z.string().trim().min(1).max(50).optional().nullable(),
  issueDate: dateString.optional(),
  dueDate: dateString.optional().nullable(),
  billingAddress: z.string().trim().max(2000).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(SalesInvoiceLineInputSchema)
    .min(1, "Faktur wajib punya minimal 1 baris item")
    .optional(),
});

export const SalesInvoiceListQuerySchema = SearchQuerySchema.extend({
  status: SalesInvoiceStatusSchema.optional(),
});

export const SalesInvoiceIdParamsSchema = BusinessIdParamsSchema.extend({
  invoiceId: z.string().uuid(),
});

export const SalesInvoiceLineResponseSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountCode: z.string(),
  accountName: z.string(),
  description: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  subtotal: z.number(),
  taxRatePercent: z.number(),
  taxAmount: z.number(),
  lineTotal: z.number(),
  sortOrder: z.number(),
});

export const SalesInvoiceResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  reference: z.string().nullable(),
  issueDate: z.string(),
  dueDate: z.string().nullable(),
  billingAddress: z.string().nullable(),
  description: z.string().nullable(),
  invoiceAmount: z.number(),
  balanceDue: z.number(),
  status: SalesInvoiceStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const SalesInvoiceDetailResponseSchema =
  SalesInvoiceResponseSchema.extend({
    lines: z.array(SalesInvoiceLineResponseSchema),
  });
