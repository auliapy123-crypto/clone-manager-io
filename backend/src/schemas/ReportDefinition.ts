import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

export const REPORT_TYPE_VALUES = [
  "trial_balance",
  "profit_and_loss",
  "balance_sheet",
] as const;

export const ReportTypeSchema = z.enum(REPORT_TYPE_VALUES);

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Tanggal tidak valid");

const definitionBase = z
  .object({
    type: ReportTypeSchema,
    title: z.string().trim().min(1, "Title wajib diisi").max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    dateFrom: dateString.optional().nullable(),
    dateTo: dateString.optional().nullable(),
    asOfDate: dateString.optional().nullable(),
    accountingMethod: z.literal("accrual", {
      message: "accounting_method hanya mendukung 'accrual' di Tahap 1",
    }),
    showAccountCodes: z.boolean().optional().default(false),
    excludeZeroBalances: z.boolean().optional().default(false),
    footer: z.string().trim().max(2000).optional().nullable(),
  });

export const CreateReportDefinitionSchema =
  definitionBase.superRefine((val, ctx) => {
    if (val.type === "trial_balance" || val.type === "profit_and_loss") {
      if (!val.dateFrom || !val.dateTo) {
        ctx.addIssue({
          code: "custom",
          path: val.dateFrom ? ["dateTo"] : ["dateFrom"],
          message: "Trial Balance & Profit and Loss wajib punya From dan To",
        });
      } else if (val.dateFrom > val.dateTo) {
        ctx.addIssue({
          code: "custom",
          path: ["dateFrom"],
          message: "From tidak boleh lebih besar dari To",
        });
      }
    }
    if (val.type === "balance_sheet" && !val.asOfDate) {
      ctx.addIssue({
        code: "custom",
        path: ["asOfDate"],
        message: "Balance Sheet wajib punya Date (as of)",
      });
    }
  });

export const UpdateReportDefinitionSchema =
  definitionBase.partial().superRefine((val, ctx) => {
    if (
      (val.type === "trial_balance" || val.type === "profit_and_loss") &&
      val.dateFrom &&
      val.dateTo &&
      val.dateFrom > val.dateTo
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["dateFrom"],
        message: "From tidak boleh lebih besar dari To",
      });
    }
  });

export type CreateReportDefinitionInput = z.infer<typeof CreateReportDefinitionSchema>;
export type UpdateReportDefinitionInput = z.infer<typeof UpdateReportDefinitionSchema>;

export const ReportDefinitionListQuerySchema = SearchQuerySchema.extend({
  type: ReportTypeSchema.optional(),
});

export const ReportDefinitionIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid("ID definisi laporan tidak valid"),
});

export const ReportDefinitionResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  type: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
  asOfDate: z.string().nullable(),
  accountingMethod: z.string(),
  showAccountCodes: z.boolean(),
  excludeZeroBalances: z.boolean(),
  footer: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** Baris laporan generik — isi kolom tergantung jenis laporan. */
export const ReportRowSchema = z.object({
  accountId: z.string().nullable(),
  code: z.string().nullable(),
  name: z.string(),
  groupName: z.string().nullable(),
  debit: z.number().nullable(),
  credit: z.number().nullable(),
  amount: z.number().nullable(),
});

export const ReportResultSchema = z.object({
  type: z.string(),
  title: z.string(),
  headerDate: z.string(),
  footer: z.string().nullable(),
  rows: z.array(ReportRowSchema),
  totals: z.array(
    z.object({ label: z.string(), value: z.number() }),
  ),
  netProfit: z.number().nullable(),
});
