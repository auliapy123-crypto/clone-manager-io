import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const CreateInterAccountTransferSchema = z
  .object({
    date: dateString,
    reference: z.string().trim().min(1).max(50).optional().nullable(),
    description: z.string().trim().max(2000).optional().nullable(),
    fromBankAccountId: z.string().uuid(),
    toBankAccountId: z.string().uuid(),
    amount: z.number().positive("Nominal transfer harus lebih dari 0"),
  })
  .superRefine((val, ctx) => {
    if (val.fromBankAccountId === val.toBankAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toBankAccountId"],
        message: "Akun tujuan harus berbeda dari akun sumber.",
      });
    }
  });

export const UpdateInterAccountTransferSchema = z
  .object({
    date: dateString.optional(),
    reference: z.string().trim().min(1).max(50).optional().nullable(),
    description: z.string().trim().max(2000).optional().nullable(),
    fromBankAccountId: z.string().uuid().optional(),
    toBankAccountId: z.string().uuid().optional(),
    amount: z.number().positive("Nominal transfer harus lebih dari 0").optional(),
  })
  .superRefine((val, ctx) => {
    if (
      val.fromBankAccountId !== undefined &&
      val.toBankAccountId !== undefined &&
      val.fromBankAccountId === val.toBankAccountId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toBankAccountId"],
        message: "Akun tujuan harus berbeda dari akun sumber.",
      });
    }
  });

export const InterAccountTransferListQuerySchema = SearchQuerySchema;

export const InterAccountTransferIdParamsSchema = BusinessIdParamsSchema.extend({
  transferId: z.string().uuid(),
});

export const InterAccountTransferResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  date: z.string(),
  reference: z.string().nullable(),
  description: z.string().nullable(),
  fromBankAccountId: z.string(),
  fromBankAccountName: z.string(),
  toBankAccountId: z.string(),
  toBankAccountName: z.string(),
  amount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const InterAccountTransferDetailResponseSchema =
  InterAccountTransferResponseSchema;
