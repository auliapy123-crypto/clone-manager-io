import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";
import type { PaginationInfo } from "@/hooks/use-members";

/**
 * Data layer Chart of Accounts (Guide §3.2, §3.3, §7.2 --
 * ChartOfAccountRoutes.ts). businessId ada di path, sama seperti
 * BusinessRoutes.ts/use-members.ts.
 */
export const ACCOUNT_CATEGORIES = [
  "Asset",
  "Liability",
  "Equity",
  "Revenue",
  "Expense",
] as const;
export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

export interface Account {
  id: string;
  businessId: string;
  code: string;
  name: string;
  category: AccountCategory;
  groupName: string | null;
  currencyCode: string;
  isControlAccount: boolean;
  isExpenseClaimsControlAccount: boolean;
}

export interface AccountFilters {
  q?: string;
  category?: AccountCategory;
}

function accountsQueryKey(businessId: string, page: number, filters: AccountFilters) {
  return ["accounts", businessId, page, filters] as const;
}

/** GET /businesses/:businessId/accounts -- daftar akun (paginated), dukung `q` dan `category`. */
export function useAccounts(
  businessId: string,
  page: number,
  filters: AccountFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: [...accountsQueryKey(businessId, page, filters), pageSize],
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: Account[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/accounts`,
        query: { page, pageSize, q: filters.q, category: filters.category },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export interface CreateAccountInput {
  code: string;
  name: string;
  category: AccountCategory;
  groupName?: string;
  currencyCode: string;
}

/** POST /businesses/:businessId/accounts -- buat akun baru. */
export function useCreateAccount(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateAccountInput) => {
      const { data, error } = await apiClient.post<{ data: Account }, ApiErrorBody>({
        url: `/businesses/${businessId}/accounts`,
        body: { ...input },
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}

export interface UpdateAccountInput {
  accountId: string;
  code?: string;
  name?: string;
  category?: AccountCategory;
  groupName?: string | null;
  currencyCode?: string;
}

/** PATCH /businesses/:businessId/accounts/:accountId -- ubah data satu akun. */
export function useUpdateAccount(businessId: string) {
  return useMutation({
    mutationFn: async ({ accountId, ...body }: UpdateAccountInput) => {
      const { data, error } = await apiClient.patch<{ data: Account }, ApiErrorBody>({
        url: `/businesses/${businessId}/accounts/${accountId}`,
        body,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}

/** DELETE /businesses/:businessId/accounts/:accountId -- soft-delete akun. */
export function useDeleteAccount(businessId: string) {
  return useMutation({
    mutationFn: async (accountId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/accounts/${accountId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}
