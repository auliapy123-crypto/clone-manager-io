import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export interface ReceiptLineInput {
  accountId: string;
  description?: string | null;
  amount: number;
}

export interface ReceiptLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  amount: number;
  sortOrder: number;
}

export interface Receipt {
  id: string;
  businessId: string;
  date: string;
  reference: string | null;
  bankAccountId: string;
  bankAccountName: string;
  contactId: string | null;
  contactName: string | null;
  description: string | null;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptDetail extends Receipt {
  lines: ReceiptLine[];
}

export interface ReceiptFilters {
  q?: string;
}

export interface CreateReceiptInput {
  date?: string;
  reference?: string;
  bankAccountId: string;
  contactId?: string | null;
  description?: string | null;
  lines: ReceiptLineInput[];
}

export interface UpdateReceiptInput {
  receiptId: string;
  date?: string;
  reference?: string | null;
  bankAccountId?: string;
  contactId?: string | null;
  description?: string | null;
  lines?: ReceiptLineInput[];
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function receiptsQueryKey(
  businessId: string,
  page: number,
  filters: ReceiptFilters,
) {
  return ["receipts", businessId, page, filters] as const;
}

export function useReceipts(
  businessId: string,
  page: number,
  filters: ReceiptFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: receiptsQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: Receipt[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/receipts`,
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

export function useReceipt(
  businessId: string,
  receiptId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["receipt", businessId, receiptId],
    queryFn: async () => {
      if (!receiptId) return null;
      const { data, error } = await apiClient.get<
        { data: ReceiptDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/receipts/${receiptId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(receiptId),
  });
}

export function useCreateReceipt(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateReceiptInput) => {
      const date = input.date?.trim() || getTodayDateString();
      const { data, error } = await apiClient.post<
        { data: ReceiptDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/receipts`,
        body: {
          ...input,
          date,
        },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["receipts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}

export function useUpdateReceipt(businessId: string) {
  return useMutation({
    mutationFn: async ({ receiptId, ...body }: UpdateReceiptInput) => {
      const payload: Record<string, unknown> = { ...body };
      if (body.date !== undefined) {
        payload.date = body.date.trim() || getTodayDateString();
      }

      const { data, error } = await apiClient.put<
        { data: ReceiptDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/receipts/${receiptId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["receipts", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["receipt", businessId, variables.receiptId],
      });
      void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}

export function useDeleteReceipt(businessId: string) {
  return useMutation({
    mutationFn: async (receiptId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/receipts/${receiptId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["receipts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}
