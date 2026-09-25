import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

export const ExpenseClaimLineInputSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().max(255).nullable().optional(),
  amount: z.number().min(0.01).max(Number.MAX_SAFE_INTEGER / 100)
    .refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001, "Maksimal dua desimal"),
});
export const CreateExpenseClaimSchema = z.object({
  date: z.iso.date().default(() => new Date().toISOString().slice(0, 10)),
  reference: z.string().trim().min(1).max(50).nullable().optional(),
  payerContactId: z.string().uuid(),
  payee: z.string().trim().max(255).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(ExpenseClaimLineInputSchema).min(1),
});
export const UpdateExpenseClaimSchema = CreateExpenseClaimSchema.partial().extend({
  // Omitted date on update must not apply the create-time default.
  date: z.iso.date().optional(),
});
export const ExpenseClaimListQuerySchema = SearchQuerySchema.extend({
  status: z.enum(["Paid", "Unpaid"]).optional(),
  payerContactId: z.string().uuid().optional(),
});
export const ExpenseClaimIdParamsSchema = BusinessIdParamsSchema.extend({ expenseClaimId: z.string().uuid() });
export const ExpenseClaimResponseSchema = z.object({
  id: z.string(), businessId: z.string(), date: z.string(), reference: z.string().nullable(),
  payerContactId: z.string(), payerName: z.string(), payee: z.string().nullable(), description: z.string().nullable(),
  claimAmount: z.number(), balanceDue: z.number(), status: z.enum(["Paid", "Unpaid"]),
  createdAt: z.date(), updatedAt: z.date(),
});
export const ExpenseClaimDetailResponseSchema = ExpenseClaimResponseSchema.extend({
  lines: z.array(z.object({
    id: z.string(), accountId: z.string(), accountCode: z.string(), accountName: z.string(),
    description: z.string().nullable(), amount: z.number(), sortOrder: z.number(),
  })),
});
