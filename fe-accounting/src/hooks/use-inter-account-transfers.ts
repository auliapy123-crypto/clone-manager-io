import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export interface InterAccountTransfer {
  id: string;
  businessId: string;
  date: string;
  reference: string | null;
  description: string | null;
  fromBankAccountId: string;
  fromBankAccountName: string;
  toBankAccountId: string;
  toBankAccountName: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export type InterAccountTransferDetail = InterAccountTransfer;

export interface InterAccountTransferFilters {
  q?: string;
}

export interface CreateInterAccountTransferInput {
  date?: string;
  reference?: string;
  description?: string | null;
  fromBankAccountId: string;
  toBankAccountId: string;
  amount: number;
}

export interface UpdateInterAccountTransferInput {
  transferId: string;
  date?: string;
  reference?: string | null;
  description?: string | null;
  fromBankAccountId?: string;
  toBankAccountId?: string;
  amount?: number;
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function interAccountTransfersQueryKey(
  businessId: string,
  page: number,
  filters: InterAccountTransferFilters,
) {
  return ["inter-account-transfers", businessId, page, filters] as const;
}

export function useInterAccountTransfers(
  businessId: string,
  page: number,
  filters: InterAccountTransferFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: interAccountTransfersQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: InterAccountTransfer[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/inter-account-transfers`,
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

export function useInterAccountTransfer(
  businessId: string,
  transferId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["inter-account-transfer", businessId, transferId],
    queryFn: async () => {
      if (!transferId) return null;
      const { data, error } = await apiClient.get<
        { data: InterAccountTransferDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/inter-account-transfers/${transferId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(transferId),
  });
}

export function useCreateInterAccountTransfer(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateInterAccountTransferInput) => {
      const date = input.date?.trim() || getTodayDateString();
      const { data, error } = await apiClient.post<
        { data: InterAccountTransferDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/inter-account-transfers`,
        body: {
          ...input,
          date,
        },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inter-account-transfers", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] });
    },
  });
}

export function useUpdateInterAccountTransfer(businessId: string) {
  return useMutation({
    mutationFn: async ({ transferId, ...body }: UpdateInterAccountTransferInput) => {
      const payload: Record<string, unknown> = { ...body };
      if (body.date !== undefined) {
        payload.date = body.date.trim() || getTodayDateString();
      }

      const { data, error } = await apiClient.put<
        { data: InterAccountTransferDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/inter-account-transfers/${transferId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["inter-account-transfers", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["inter-account-transfer", businessId, variables.transferId],
      });
      void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] });
    },
  });
}

export function useDeleteInterAccountTransfer(businessId: string) {
  return useMutation({
    mutationFn: async (transferId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/inter-account-transfers/${transferId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inter-account-transfers", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] });
    },
  });
}
