import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";
import type { Account } from "@/hooks/use-accounts";

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
export type ReportType = (typeof REPORT_TYPE_VALUES)[number];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  trial_balance: "Trial Balance",
  profit_and_loss: "Profit and Loss Statement",
  balance_sheet: "Balance Sheet",
  general_ledger_summary: "General Ledger Summary",
  general_ledger_transactions: "General Ledger Transactions",
  aged_receivables: "Aged Receivables",
  aged_payables: "Aged Payables",
  customer_summary: "Customer Summary",
  supplier_summary: "Supplier Summary",
  sales_invoice_totals_by_customer: "Sales Invoice Totals by Customer",
  billable_time_summary: "Billable Time Summary",
  receipts_payments_summary: "Receipts & Payments Summary",
};
export const isAgedReport = (type: string) => type === "aged_receivables" || type === "aged_payables";
export const isContactSummary = (type: string) => type === "customer_summary" || type === "supplier_summary";
export const isStage1dReport = (type: string) =>
  type === "sales_invoice_totals_by_customer" ||
  type === "billable_time_summary" ||
  type === "receipts_payments_summary";
export const isParameterOnlyReport = (type: ReportType) =>
  type.startsWith("general_ledger_") || isAgedReport(type) || isContactSummary(type) || isStage1dReport(type);

export interface ReportDefinition {
  id: string;
  businessId: string;
  type: ReportType;
  title: string;
  description: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  asOfDate: string | null;
  accountId: string | null;
  sortBy: "total" | "name" | null;
  showInvoices: boolean;
  accountingMethod: string;
  showAccountCodes: boolean;
  excludeZeroBalances: boolean;
  footer: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportDefinitionInput {
  type: ReportType;
  title?: string;
  description?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  asOfDate?: string | null;
  accountingMethod?: "accrual";
  accountId?: string | null;
  sortBy?: "total" | "name";
  showInvoices?: boolean;
  showAccountCodes?: boolean;
  excludeZeroBalances?: boolean;
  footer?: string | null;
}

export interface ReportRow {
  accountId: string | null;
  code: string | null;
  name: string;
  groupName: string | null;
  debit: number | null;
  credit: number | null;
  amount: number | null;
  kind?: "section" | "account" | "transaction" | "profit" | "customer" | "supplier" | "invoice" | "total" | "receipt" | "payment" | "summary";
  supplierId?: string;
  invoices?: number;
  creditNotes?: number;
  lateFees?: number;
  payments?: number;
  opening?: number;
  movement?: number;
  closing?: number;
  date?: string | null;
  label?: string;
  balance?: number;
  current?: number;
  days1To30?: number;
  days31To60?: number;
  days61To90?: number;
  daysOver90?: number;
  customerId?: string;
  invoiceId?: string;
}

export interface ReportResult {
  type: string;
  title: string;
  headerDate: string;
  footer: string | null;
  rows: ReportRow[];
  totals: { label: string; value: number }[];
  netProfit: number | null;
}

function url(businessId: string) {
  return `/businesses/${businessId}/report-definitions`;
}

export function useReportDefinitions(
  businessId: string,
  type: ReportType,
  page = 1,
  q?: string,
) {
  return useQuery({
    queryKey: ["report-definitions", businessId, type, page, q ?? ""],
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: ReportDefinition[]; pagination: PaginationInfo },
        ApiErrorBody
      >({ url: url(businessId), query: { type, page, pageSize: 10, q } });
      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useCreateReportDefinition(businessId: string, type: ReportType) {
  return useMutation({
    mutationFn: async (input: ReportDefinitionInput) => {
      const { data, error } = await apiClient.post<
        { data: ReportDefinition },
        ApiErrorBody
      >({ url: url(businessId), body: { ...input } });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["report-definitions", businessId, type],
      });
    },
  });
}

export function useUpdateReportDefinition(businessId: string, type: ReportType) {
  return useMutation({
    mutationFn: async ({ id, ...body }: ReportDefinitionInput & { id: string }) => {
      const { data, error } = await apiClient.put<
        { data: ReportDefinition },
        ApiErrorBody
      >({ url: `${url(businessId)}/${id}`, body });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["report-definitions", businessId, type],
      });
      void queryClient.invalidateQueries({
        queryKey: ["report-result", businessId, variables.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["report-definition", businessId, variables.id] });
    },
  });
}

export function useReportDefinition(businessId: string, id: string) {
  return useQuery({
    queryKey: ["report-definition", businessId, id],
    queryFn: async () => {
      const { data, error } = await apiClient.get<{ data: ReportDefinition }, ApiErrorBody>({ url: `${url(businessId)}/${id}` });
      if (error) throw new ApiError(error);
      return data.data;
    },
  });
}

export function useDeleteReportDefinition(businessId: string, type: ReportType) {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({ url: `${url(businessId)}/${id}` });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["report-definitions", businessId, type],
      });
    },
  });
}

export function useReportResult(businessId: string, id: string) {
  return useQuery({
    queryKey: ["report-result", businessId, id],
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: ReportResult },
        ApiErrorBody
      >({ url: `${url(businessId)}/${id}/result` });
      if (error) throw new ApiError(error);
      return data.data;
    },
  });
}

export function useReportAccounts(businessId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["report-accounts", businessId], enabled,
    queryFn: async () => {
      const accounts: Account[] = [];
      for (let page = 1; ; page++) {
        const { data, error } = await apiClient.get<{ data: Account[]; pagination: PaginationInfo }, ApiErrorBody>({
          url: `/businesses/${businessId}/accounts`, query: { page, pageSize: 100 },
        });
        if (error) throw new ApiError(error);
        accounts.push(...data.data);
        if (page >= data.pagination.totalPages) return accounts;
      }
    },
  });
}
