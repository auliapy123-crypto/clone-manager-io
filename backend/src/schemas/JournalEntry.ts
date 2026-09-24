import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export const JournalEntryLineInputSchema = z.object({
  accountId: z.string().uuid(),
  contactId: z.string().uuid().optional().nullable(),
  debit: z.number().min(0, "Debit tidak boleh negatif").default(0),
  credit: z.number().min(0, "Kredit tidak boleh negatif").default(0),
  description: z.string().trim().max(2000).optional().nullable(),
});

function refineLines(
  lines: Array<{ debit: number; credit: number }>,
  ctx: z.RefinementCtx,
) {
  lines.forEach((l, i) => {
    const d = toCents(l.debit);
    const c = toCents(l.credit);
    const filled = (d > 0 ? 1 : 0) + (c > 0 ? 1 : 0);
    if (filled !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lines", i],
        message: `Baris #${i + 1}: isi tepat satu dari debit ATAU kredit (tidak boleh dua-duanya, tidak boleh kosong).`,
      });
    }
  });
  const totalD = lines.reduce((s, l) => s + toCents(l.debit), 0);
  const totalC = lines.reduce((s, l) => s + toCents(l.credit), 0);
  if (totalD !== totalC) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lines"],
      message: `Total debit (${totalD / 100}) harus sama dengan total kredit (${totalC / 100}).`,
    });
  }
}

export const CreateJournalEntrySchema = z
  .object({
    entryDate: dateString,
    reference: z.string().trim().min(1).max(100).optional().nullable(),
    description: z.string().trim().max(2000).optional().nullable(),
    lines: z
      .array(JournalEntryLineInputSchema)
      .min(2, "Jurnal manual wajib punya minimal 2 baris"),
  })
  .superRefine((val, ctx) => refineLines(val.lines, ctx));

export const UpdateJournalEntrySchema = z
  .object({
    entryDate: dateString.optional(),
    reference: z.string().trim().min(1).max(100).optional().nullable(),
    description: z.string().trim().max(2000).optional().nullable(),
    lines: z
      .array(JournalEntryLineInputSchema)
      .min(2, "Jurnal manual wajib punya minimal 2 baris")
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.lines) refineLines(val.lines, ctx);
  });

export const JournalEntryListQuerySchema = SearchQuerySchema.extend({
  sourceModule: z.string().trim().min(1).max(50).optional(),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
});

export const JournalEntryIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid(),
});

export const JournalEntryLineResponseSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountCode: z.string(),
  accountName: z.string(),
  contactId: z.string().nullable(),
  contactName: z.string().nullable(),
  debit: z.number(),
  credit: z.number(),
  description: z.string().nullable(),
});

export const JournalEntryResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  entryDate: z.string(),
  reference: z.string().nullable(),
  sourceModule: z.string(),
  sourceId: z.string().nullable(),
  description: z.string().nullable(),
  isManual: z.boolean(),
  totalDebit: z.number(),
  totalCredit: z.number(),
});

export const JournalEntryDetailResponseSchema = JournalEntryResponseSchema.extend({
  lines: z.array(JournalEntryLineResponseSchema),
});
