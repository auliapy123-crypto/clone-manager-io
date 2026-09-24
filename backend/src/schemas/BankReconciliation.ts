import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const CreateBankReconciliationSchema = z.object({
  date: dateString,
  bankAccountId: z.string().uuid(),
  statementBalance: z.number(),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const UpdateBankReconciliationSchema = z.object({
  date: dateString.optional(),
  bankAccountId: z.string().uuid().optional(),
  statementBalance: z.number().optional(),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const BankReconciliationListQuerySchema = SearchQuerySchema;

export const BankReconciliationIdParamsSchema = BusinessIdParamsSchema.extend({
  reconciliationId: z.string().uuid(),
});

export const BankReconciliationStatusSchema = z.enum(["Reconciled", "Not Reconciled"]);

export const BankReconciliationResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  date: z.string(),
  bankAccountId: z.string(),
  bankAccountName: z.string(),
  statementBalance: z.number(),
  bookBalance: z.number(),
  discrepancy: z.number(),
  status: BankReconciliationStatusSchema,
  description: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const BankReconciliationDetailResponseSchema =
  BankReconciliationResponseSchema;
