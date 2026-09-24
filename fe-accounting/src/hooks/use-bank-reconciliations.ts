import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export type BankReconciliationStatus = "Reconciled" | "Not Reconciled";

export interface BankReconciliation {
  id: string;
  businessId: string;
  date: string;
  bankAccountId: string;
  bankAccountName: string;
  statementBalance: number;
  bookBalance: number;
  discrepancy: number;
  status: BankReconciliationStatus;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BankReconciliationDetail = BankReconciliation;

export interface BankReconciliationFilters {
  q?: string;
}

export interface CreateBankReconciliationInput {
  date?: string;
  bankAccountId: string;
  statementBalance: number;
  description?: string | null;
}

export interface UpdateBankReconciliationInput {
  reconciliationId: string;
  date?: string;
  bankAccountId?: string;
  statementBalance?: number;
  description?: string | null;
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function bankReconciliationsQueryKey(
  businessId: string,
  page: number,
  filters: BankReconciliationFilters,
) {
  return ["bank-reconciliations", businessId, page, filters] as const;
}

export function useBankReconciliations(
  businessId: string,
  page: number,
  filters: BankReconciliationFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: bankReconciliationsQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: BankReconciliation[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/bank-reconciliations`,
        query: {
          page,
          pageSize,
          q: filters.q,
        },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useBankReconciliation(
  businessId: string,
  reconciliationId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["bank-reconciliation", businessId, reconciliationId],
    queryFn: async () => {
      if (!reconciliationId) return null;
      const { data, error } = await apiClient.get<
        { data: BankReconciliationDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/bank-reconciliations/${reconciliationId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(reconciliationId),
  });
}

export function useCreateBankReconciliation(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateBankReconciliationInput) => {
      const date = input.date?.trim() || getTodayDateString();
      const { data, error } = await apiClient.post<
        { data: BankReconciliationDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/bank-reconciliations`,
        body: {
          ...input,
          date,
        },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bank-reconciliations", businessId] });
    },
  });
}

export function useUpdateBankReconciliation(businessId: string) {
  return useMutation({
    mutationFn: async ({ reconciliationId, ...body }: UpdateBankReconciliationInput) => {
      const payload: Record<string, unknown> = { ...body };
      if (body.date !== undefined) {
        payload.date = body.date.trim() || getTodayDateString();
      }

      const { data, error } = await apiClient.put<
        { data: BankReconciliationDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/bank-reconciliations/${reconciliationId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["bank-reconciliations", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["bank-reconciliation", businessId, variables.reconciliationId],
      });
    },
  });
}

export function useDeleteBankReconciliation(businessId: string) {
  return useMutation({
    mutationFn: async (reconciliationId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/bank-reconciliations/${reconciliationId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bank-reconciliations", businessId] });
    },
  });
}
