import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

// --- Request ---------------------------------------------------------
export const CustomerCreateSchema = z.object({
  name: z.string().trim().min(1).max(225),
  code: z.string().trim().min(1).max(50).optional(),
  email: z.string().email().max(225).optional(),
  billingAddress: z.string().max(10_000).optional(),
  deliveryAddress: z.string().max(10_000).optional(),
  creditLimit: z.coerce.number().min(0).default(0),
  salesInvoiceDueDateDays: z.coerce.number().int().min(0).optional(),
});

export const CustomerUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(225).optional(),
    code: z.string().trim().min(1).max(50).nullable().optional(),
    email: z.string().email().max(225).nullable().optional(),
    billingAddress: z.string().max(10_000).nullable().optional(),
    deliveryAddress: z.string().max(10_000).nullable().optional(),
    creditLimit: z.coerce.number().min(0).optional(),
    salesInvoiceDueDateDays: z.coerce.number().int().min(0).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Minimal satu field harus diisi.",
  });

/** GET /businesses/:businessId/customers — pencarian nama, kode, atau email. */
export const CustomerListQuerySchema = SearchQuerySchema;

export const CustomerIdParamsSchema = BusinessIdParamsSchema.extend({
  customerId: z.string().uuid(),
});

// --- Response --------------------------------------------------------
export const CustomerResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  email: z.string().nullable(),
  billingAddress: z.string().nullable(),
  deliveryAddress: z.string().nullable(),
  creditLimit: z.number(),
  salesInvoiceDueDateDays: z.number().int().nullable(),
  isCustomer: z.literal(true),
  isSupplier: z.boolean(),
  accountsReceivable: z.number(),
  unallocatedReceipts: z.number(),
});
