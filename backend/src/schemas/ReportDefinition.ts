import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

export const REPORT_TYPE_VALUES = [
  "trial_balance",
  "profit_and_loss",
  "balance_sheet",
  "general_ledger_summary",
  "general_ledger_transactions",
  "aged_receivables",
] as const;

export const ReportTypeSchema = z.enum(REPORT_TYPE_VALUES);

export const REPORT_NAMES = {
  trial_balance: "Trial Balance", profit_and_loss: "Profit and Loss Statement",
  balance_sheet: "Balance Sheet", general_ledger_summary: "General Ledger Summary",
  general_ledger_transactions: "General Ledger Transactions", aged_receivables: "Aged Receivables",
} as const;
export const isStage1b = (type: string) => type.startsWith("general_ledger_") || type === "aged_receivables";
export const isAsOfReport = (type: string) => type === "balance_sheet" || type === "aged_receivables";

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
    title: z.string().trim().max(200).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    dateFrom: dateString.optional().nullable(),
    dateTo: dateString.optional().nullable(),
    asOfDate: dateString.optional().nullable(),
    accountingMethod: z.string().optional(),
    accountId: z.string().uuid().optional().nullable(),
    sortBy: z.enum(["total", "name"]).optional().nullable(),
    showInvoices: z.boolean().optional().nullable(),
    showAccountCodes: z.boolean().optional(),
    excludeZeroBalances: z.boolean().optional(),
    footer: z.string().trim().max(2000).optional().nullable(),
  });

export const CreateReportDefinitionSchema =
  definitionBase.superRefine((val, ctx) => {
    if (!isStage1b(val.type)) {
      if (!val.title) ctx.addIssue({ code: "custom", path: ["title"], message: "Title wajib diisi" });
      if (val.accountingMethod !== "accrual") ctx.addIssue({ code: "custom", path: ["accountingMethod"], message: "Hanya accrual didukung" });
    }
    if (!isAsOfReport(val.type)) {
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
    if (isAsOfReport(val.type) && !val.asOfDate) {
      ctx.addIssue({
        code: "custom",
        path: ["asOfDate"],
        message: "Balance Sheet wajib punya Date (as of)",
      });
    }
  }).transform((val) => ({
    ...val,
    title: val.title || REPORT_NAMES[val.type],
    accountingMethod: "accrual" as const,
    dateFrom: isAsOfReport(val.type) ? null : val.dateFrom ?? null,
    dateTo: isAsOfReport(val.type) ? null : val.dateTo ?? null,
    asOfDate: isAsOfReport(val.type) ? val.asOfDate ?? null : null,
    accountId: val.type === "general_ledger_transactions" ? val.accountId ?? null : null,
    sortBy: val.type === "aged_receivables" ? val.sortBy ?? "total" : null,
    showInvoices: val.type === "aged_receivables" ? val.showInvoices ?? false : false,
  }));

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
  accountId: z.string().nullable(),
  sortBy: z.string().nullable(),
  showInvoices: z.boolean(),
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
  kind: z.enum(["section", "account", "transaction", "profit", "customer", "invoice", "total"]).optional(),
  opening: z.number().optional(),
  movement: z.number().optional(),
  closing: z.number().optional(),
  date: z.string().nullable().optional(),
  label: z.string().optional(),
  balance: z.number().optional(),
  current: z.number().optional(),
  days1To30: z.number().optional(),
  days31To60: z.number().optional(),
  days61To90: z.number().optional(),
  daysOver90: z.number().optional(),
  customerId: z.string().optional(),
  invoiceId: z.string().optional(),
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
