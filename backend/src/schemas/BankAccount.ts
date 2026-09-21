import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

export const bankAccountBaseSchema = z.object({
  name: z.string().trim().min(3).max(100),
  accountType: z.enum(["bank", "cash"]),
  accountId: z.string().uuid(),
  bankName: z.string().trim().max(100).optional().nullable(),
  accountNumber: z.string().trim().max(50).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
});

export const CreateBankAccountSchema = bankAccountBaseSchema.superRefine((val, ctx) => {
  if (val.accountType === "bank") {
    if (!val.bankName || val.bankName.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankName"], message: "Nama bank wajib diisi" });
    }
    if (!val.accountNumber || val.accountNumber.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accountNumber"], message: "Nomor rekening wajib diisi" });
    }
  }
});

export const UpdateBankAccountSchema = bankAccountBaseSchema.partial().superRefine((val, ctx) => {
  if (val.accountType === "bank") {
    if (val.bankName !== undefined && (!val.bankName || val.bankName.trim().length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankName"], message: "Nama bank tidak boleh kosong" });
    }
    if (val.accountNumber !== undefined && (!val.accountNumber || val.accountNumber.trim().length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accountNumber"], message: "Nomor rekening tidak boleh kosong" });
    }
  }
});

export const BankAccountListQuerySchema = SearchQuerySchema.extend({
  accountType: z.enum(["bank", "cash"]).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const BankAccountIdParamsSchema = BusinessIdParamsSchema.extend({
  bankAccountId: z.string().uuid(),
});

export const BankAccountResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  accountId: z.string(),
  accountCode: z.string(),
  accountName: z.string(),
  name: z.string(),
  accountType: z.enum(["bank", "cash"]),
  bankName: z.string().nullable(),
  accountNumber: z.string().nullable(),
  currencyCode: z.string(),
  description: z.string().nullable(),
  status: z.enum(["active", "archived"]),
  currentBalance: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
