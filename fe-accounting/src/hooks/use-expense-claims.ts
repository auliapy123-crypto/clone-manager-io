import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export interface ExpenseClaimLineInput {
  accountId: string;
  description?: string | null;
  amount: number;
}

export interface ExpenseClaimLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  amount: number;
  sortOrder: number;
}

export interface ExpenseClaim {
  id: string;
  businessId: string;
  date: string;
  reference: string | null;
  payerContactId: string;
  payerName: string;
  payee: string | null;
  description: string | null;
  claimAmount: number;
  balanceDue: number;
  status: "Paid" | "Unpaid";
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseClaimDetail extends ExpenseClaim {
  lines: ExpenseClaimLine[];
}

export interface ExpenseClaimFilters {
  status?: "Paid" | "Unpaid";
  payerContactId?: string;
  q?: string;
}

export interface CreateExpenseClaimInput {
  date?: string;
  reference?: string;
  payerContactId: string;
  payee?: string | null;
  description?: string | null;
  lines: ExpenseClaimLineInput[];
}

export interface UpdateExpenseClaimInput {
  expenseClaimId: string;
  date?: string;
  reference?: string | null;
  payerContactId?: string;
  payee?: string | null;
  description?: string | null;
  lines?: ExpenseClaimLineInput[];
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function expenseClaimsQueryKey(
  businessId: string,
  page: number,
  filters: ExpenseClaimFilters,
  pageSize: number,
) {
  return ["expense-claims", businessId, page, filters, pageSize] as const;
}

export function useExpenseClaims(
  businessId: string,
  page: number,
  filters: ExpenseClaimFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: expenseClaimsQueryKey(businessId, page, filters, pageSize),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: ExpenseClaim[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/expense-claims`,
        query: {
          page,
          pageSize,
          q: filters.q,
          status: filters.status,
          payerContactId: filters.payerContactId,
        },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useExpenseClaim(
  businessId: string,
  expenseClaimId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["expense-claim", businessId, expenseClaimId],
    queryFn: async () => {
      if (!expenseClaimId) return null;
      const { data, error } = await apiClient.get<
        { data: ExpenseClaimDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/expense-claims/${expenseClaimId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(expenseClaimId),
  });
}

/** Fetch every page for a payer, including Paid claims needed when editing an allocation. */
export function useExpenseClaimOptions(businessId: string, payerContactId: string) {
  return useQuery({
    queryKey: ["expense-claim-options", businessId, payerContactId],
    enabled: Boolean(payerContactId),
    queryFn: async () => {
      const claims: ExpenseClaim[] = [];
      let page = 1;
      while (true) {
        const { data, error } = await apiClient.get<{ data: ExpenseClaim[]; pagination: PaginationInfo }, ApiErrorBody>({
          url: `/businesses/${businessId}/expense-claims`, query: { page, pageSize: 100, payerContactId },
        });
        if (error) throw new ApiError(error);
        claims.push(...data.data);
        if (page >= data.pagination.totalPages) return claims;
        page++;
      }
    },
  });
}

export function useCreateExpenseClaim(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateExpenseClaimInput) => {
      const date = input.date?.trim() || getTodayDateString();
      const { data, error } = await apiClient.post<
        { data: ExpenseClaimDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/expense-claims`,
        body: {
          ...input,
          date,
        },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => invalidateExpenseClaims(businessId),
  });
}

export function useUpdateExpenseClaim(businessId: string) {
  return useMutation({
    mutationFn: async ({ expenseClaimId, ...body }: UpdateExpenseClaimInput) => {
      const payload: Record<string, unknown> = { ...body };
      if (body.date !== undefined) {
        payload.date = body.date.trim() || getTodayDateString();
      }

      const { data, error } = await apiClient.put<
        { data: ExpenseClaimDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/expense-claims/${expenseClaimId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => invalidateExpenseClaims(businessId),
  });
}

export function useDeleteExpenseClaim(businessId: string) {
  return useMutation({
    mutationFn: async (expenseClaimId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/expense-claims/${expenseClaimId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => invalidateExpenseClaims(businessId),
  });
}

function invalidateExpenseClaims(businessId: string) {
  return Promise.all(["expense-claims", "expense-claim", "expense-claim-options", "accounts", "journal-entries"].map(key =>
    queryClient.invalidateQueries({ queryKey: [key, businessId] }),
  ));
}
