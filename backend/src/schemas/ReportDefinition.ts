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
  "aged_payables",
  "customer_summary",
  "supplier_summary",
  "sales_invoice_totals_by_customer",
  "billable_time_summary",
  "receipts_payments_summary",
] as const;

export const ReportTypeSchema = z.enum(REPORT_TYPE_VALUES);

export const REPORT_NAMES = {
  trial_balance: "Trial Balance", profit_and_loss: "Profit and Loss Statement",
  balance_sheet: "Balance Sheet", general_ledger_summary: "General Ledger Summary",
  general_ledger_transactions: "General Ledger Transactions", aged_receivables: "Aged Receivables",
  aged_payables: "Aged Payables", customer_summary: "Customer Summary", supplier_summary: "Supplier Summary",
  sales_invoice_totals_by_customer: "Sales Invoice Totals by Customer",
  billable_time_summary: "Billable Time Summary",
  receipts_payments_summary: "Receipts & Payments Summary",
} as const;
export const isContactSummary = (type: string) => type === "customer_summary" || type === "supplier_summary";
export const isAgedReport = (type: string) => type === "aged_receivables" || type === "aged_payables";
export const isStage1dReport = (type: string) =>
  type === "sales_invoice_totals_by_customer" ||
  type === "billable_time_summary" ||
  type === "receipts_payments_summary";
export const isParameterOnlyReport = (type: string) =>
  type.startsWith("general_ledger_") || isAgedReport(type) || isContactSummary(type) || isStage1dReport(type);
export const isAsOfReport = (type: string) => type === "balance_sheet" || isAgedReport(type);

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

function ignoreStage1cFields(input: unknown) {
  if (!input || typeof input !== "object") return input;
  const value = input as Record<string, unknown>;
  const typeStr = String(value.type);
  if (
    typeStr !== "aged_payables" &&
    !isContactSummary(typeStr) &&
    !isStage1dReport(typeStr)
  ) return input;
  let kept = ["type", "title", "dateFrom", "dateTo"];
  if (typeStr === "aged_payables") {
    kept = ["type", "title", "asOfDate", "sortBy", "showInvoices"];
  } else if (typeStr === "receipts_payments_summary") {
    kept = ["type", "title", "dateFrom", "dateTo", "showAccountCodes", "excludeZeroBalances", "footer"];
  }
  return Object.fromEntries(Object.entries(value).filter(([key]) => kept.includes(key)));
}

export const CreateReportDefinitionSchema = z.preprocess(ignoreStage1cFields,
  definitionBase.superRefine((val, ctx) => {
    if (!isParameterOnlyReport(val.type)) {
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
    sortBy: isAgedReport(val.type) ? val.sortBy ?? "total" : null,
    showInvoices: isAgedReport(val.type) ? val.showInvoices ?? false : false,
    ...(val.type === "aged_payables" || isContactSummary(val.type) || val.type === "sales_invoice_totals_by_customer" || val.type === "billable_time_summary"
      ? { description: null, showAccountCodes: false, excludeZeroBalances: false, footer: null }
      : val.type === "receipts_payments_summary"
        ? { description: null, showAccountCodes: val.showAccountCodes ?? false, excludeZeroBalances: val.excludeZeroBalances ?? false, footer: val.footer ?? null }
        : {}),
  })));

// A partial edit can omit type. Validate all parameters against the stored type
// in updateReportDefinition, after merging, so irrelevant fields are ignored
// consistently even when the request does not repeat type (Report.md §9.2).
export const UpdateReportDefinitionSchema = z.object({
  type: ReportTypeSchema.optional(),
}).catchall(z.unknown());

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
  kind: z.enum(["section", "account", "transaction", "profit", "customer", "supplier", "invoice", "total", "receipt", "payment", "summary"]).optional(),
  supplierId: z.string().optional(),
  invoices: z.number().optional(),
  creditNotes: z.number().optional(),
  lateFees: z.number().optional(),
  payments: z.number().optional(),
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
