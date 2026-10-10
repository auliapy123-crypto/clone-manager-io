import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";
import type { Account } from "@/hooks/use-accounts";
import type { CustomFieldDefinition } from "@/hooks/use-custom-fields";

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
  "sales_invoice_totals_by_item",
  "sales_invoice_totals_by_custom_field",
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
  sales_invoice_totals_by_item: "Sales Invoice Totals by Item",
  sales_invoice_totals_by_custom_field: "Sales Invoice Totals by Custom Field",
  billable_time_summary: "Billable Time Summary",
  receipts_payments_summary: "Receipts & Payments Summary",
};
export const isAgedReport = (type: string) => type === "aged_receivables" || type === "aged_payables";
export const isContactSummary = (type: string) => type === "customer_summary" || type === "supplier_summary";
export const isStage1dReport = (type: string) =>
  type === "sales_invoice_totals_by_item" || type === "sales_invoice_totals_by_custom_field" ||
  type === "sales_invoice_totals_by_customer" ||
  type === "billable_time_summary" ||
  type === "receipts_payments_summary";
export const isParameterOnlyReport = (type: ReportType) =>
  type.startsWith("general_ledger_") || isAgedReport(type) || isContactSummary(type) || isStage1dReport(type);

/**
 * Statements (§12 / Tahap 2b) — keluarga BERBEDA dari `REPORT_TYPE_VALUES`:
 * parameter-only, TANPA definisi tersimpan (tanpa New/Edit, tanpa Title,
 * tanpa baris `report_definitions`). Sengaja dipisah supaya tipe ini tidak
 * pernah ikut ke endpoint definisi laporan.
 */
export const STATEMENT_TYPE_VALUES = [
  "customer_statements_unpaid",
  "customer_statements_transactions",
  "supplier_statements_unpaid",
  "supplier_statements_transactions",
] as const;
export type StatementType = (typeof STATEMENT_TYPE_VALUES)[number];

/** Nama persis §12.1 (satu item abu-abu dipecah jadi dua entri aktif). */
export const STATEMENT_TYPE_LABELS: Record<StatementType, string> = {
  customer_statements_unpaid: "Customer Statements (Unpaid Invoices)",
  customer_statements_transactions: "Customer Statements (Transactions)",
  supplier_statements_unpaid: "Supplier Statements (Unpaid Invoices)",
  supplier_statements_transactions: "Supplier Statements (Transactions)",
};

export const isStatementReport = (type: string): type is StatementType =>
  (STATEMENT_TYPE_VALUES as readonly string[]).includes(type);
export const isUnpaidStatement = (type: string) => type.endsWith("_unpaid");

export interface StatementContactRow {
  contactId: string;
  name: string;
  transactionCount: number;
  amount: number;
}

export interface StatementDetailRow {
  kind: "invoice" | "transaction";
  date: string;
  invoiceId?: string;
  orderNumber?: string | null;
  reference?: string;
  invoiceTotal?: number;
  overdueDays?: number;
  balanceDue?: number;
  description?: string;
  sourceModule?: string;
  debit?: number;
  credit?: number;
  runningBalance?: number;
}

export interface StatementBuckets {
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  daysOver90: number;
  total: number;
}

export interface StatementContact {
  id: string;
  name: string;
  email: string | null;
  billingAddress: string | null;
}

export interface StatementListResponse {
  data: StatementContactRow[];
  pagination: PaginationInfo;
  headerDate: string;
  totals: { label: string; value: number }[];
}

export interface StatementDetailResult {
  type: string;
  headerDate: string;
  contact: StatementContact;
  rows: StatementDetailRow[];
  buckets: StatementBuckets | null;
  totals: { label: string; value: number }[];
}

export interface StatementParams {
  asOfDate?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useStatementList(
  businessId: string,
  type: StatementType,
  params: StatementParams & { page?: number; pageSize?: number; q?: string },
) {
  return useQuery({
    queryKey: ["statements", businessId, type, params],
    queryFn: async () => {
      const { data, error } = await apiClient.get<StatementListResponse, ApiErrorBody>({
        url: `/businesses/${businessId}/statements/${type}`,
        query: { ...params },
      });
      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useStatementDetail(
  businessId: string,
  type: StatementType,
  contactId: string,
  params: StatementParams,
) {
  return useQuery({
    queryKey: ["statement", businessId, type, contactId, params],
    queryFn: async () => {
      const { data, error } = await apiClient.get<{ data: StatementDetailResult }, ApiErrorBody>({
        url: `/businesses/${businessId}/statements/${type}/${contactId}`,
        query: { ...params },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
  });
}

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
  customFieldId: string | null;
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
  customFieldId?: string | null;
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
  groupLabel?: string;
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

export function useReportCustomFields(businessId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["report-custom-fields", businessId], enabled,
    queryFn: async () => {
      const fields: CustomFieldDefinition[] = [];
      for (let page = 1; ; page++) {
        const { data, error } = await apiClient.get<{ data: CustomFieldDefinition[]; pagination: PaginationInfo }, ApiErrorBody>({
          url: `/businesses/${businessId}/custom-field-definitions`, query: { entityType: "sales_invoice", page, pageSize: 100 },
        });
        if (error) throw new ApiError(error);
        fields.push(...data.data);
        if (page >= data.pagination.totalPages) return fields;
      }
    },
  });
}
