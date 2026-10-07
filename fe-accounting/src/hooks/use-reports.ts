import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export const REPORT_TYPE_VALUES = [
  "trial_balance",
  "profit_and_loss",
  "balance_sheet",
] as const;
export type ReportType = (typeof REPORT_TYPE_VALUES)[number];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  trial_balance: "Trial Balance",
  profit_and_loss: "Profit and Loss Statement",
  balance_sheet: "Balance Sheet",
};

export interface ReportDefinition {
  id: string;
  businessId: string;
  type: ReportType;
  title: string;
  description: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  asOfDate: string | null;
  accountingMethod: string;
  showAccountCodes: boolean;
  excludeZeroBalances: boolean;
  footer: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportDefinitionInput {
  type: ReportType;
  title: string;
  description?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  asOfDate?: string | null;
  accountingMethod: "accrual";
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
