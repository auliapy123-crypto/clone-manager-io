import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export interface BankAccount {
  id: string;
  businessId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  name: string;
  accountType: "bank" | "cash";
  bankName: string | null;
  accountNumber: string | null;
  currencyCode: string;
  description: string | null;
  status: "active" | "archived";
  currentBalance: number;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccountFilters {
  q?: string;
  accountType?: "bank" | "cash";
  status?: "active" | "archived";
}

export interface CreateBankAccountInput {
  name: string;
  accountId: string;
  accountType: "bank" | "cash";
  bankName?: string | null;
  accountNumber?: string | null;
  description?: string | null;
}

export interface UpdateBankAccountInput {
  bankAccountId: string;
  name?: string;
  accountId?: string;
  accountType?: "bank" | "cash";
  bankName?: string | null;
  accountNumber?: string | null;
  description?: string | null;
}

function bankAccountsQueryKey(businessId: string, page: number, filters: BankAccountFilters) {
  return ["bank-accounts", businessId, page, filters] as const;
}

/** GET /businesses/:businessId/bank-accounts — daftar rekening terpaginated. */
export function useBankAccounts(
  businessId: string,
  page: number,
  filters: BankAccountFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: bankAccountsQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: BankAccount[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/bank-accounts`,
        query: {
          page,
          pageSize,
          q: filters.q,
          accountType: filters.accountType,
          status: filters.status,
        },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useCreateBankAccount(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateBankAccountInput) => {
      const { data, error } = await apiClient.post<{ data: BankAccount }, ApiErrorBody>({
        url: `/businesses/${businessId}/bank-accounts`,
        body: { ...input },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] }),
  });
}

/** PUT /businesses/:businessId/bank-accounts/:bankAccountId — perbarui data rekening. */
export function useUpdateBankAccount(businessId: string) {
  return useMutation({
    mutationFn: async ({ bankAccountId, ...body }: UpdateBankAccountInput) => {
      const { data, error } = await apiClient.put<{ data: BankAccount }, ApiErrorBody>({
        url: `/businesses/${businessId}/bank-accounts/${bankAccountId}`,
        body,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] }),
  });
}

/** PATCH /businesses/:businessId/bank-accounts/:bankAccountId/status — ganti status (active/archived). */
export function useUpdateBankAccountStatus(businessId: string) {
  return useMutation({
    mutationFn: async ({ bankAccountId, status }: { bankAccountId: string; status: "active" | "archived" }) => {
      const { data, error } = await apiClient.patch<{ data: BankAccount }, ApiErrorBody>({
        url: `/businesses/${businessId}/bank-accounts/${bankAccountId}/status`,
        body: { status },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] }),
  });
}

export function useDeleteBankAccount(businessId: string) {
  return useMutation({
    mutationFn: async (bankAccountId: string) => {
      const { data, error } = await apiClient.delete<{ data: { message: string } }, ApiErrorBody>({
        url: `/businesses/${businessId}/bank-accounts/${bankAccountId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] }),
  });
}
