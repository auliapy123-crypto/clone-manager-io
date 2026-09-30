import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export type PurchaseQuoteStatus = "Draft" | "Accepted" | "Rejected";

export const PURCHASE_QUOTE_STATUSES: PurchaseQuoteStatus[] = [
  "Draft",
  "Accepted",
  "Rejected",
];

export interface PurchaseQuoteLineInput {
  accountId: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
}

export interface PurchaseQuoteLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
}

export interface PurchaseQuote {
  id: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  date: string;
  quoteNumber: string | null;
  description: string | null;
  status: PurchaseQuoteStatus;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseQuoteDetail extends PurchaseQuote {
  lines: PurchaseQuoteLine[];
}

export interface PurchaseQuoteFilters {
  q?: string;
  status?: PurchaseQuoteStatus;
}

export interface CreatePurchaseQuoteInput {
  supplierId: string;
  date?: string;
  quoteNumber?: string | null;
  description?: string | null;
  status?: PurchaseQuoteStatus;
  lines: PurchaseQuoteLineInput[];
}

export interface UpdatePurchaseQuoteInput {
  quoteId: string;
  supplierId?: string;
  date?: string;
  quoteNumber?: string | null;
  description?: string | null;
  status?: PurchaseQuoteStatus;
  lines?: PurchaseQuoteLineInput[];
}

function purchaseQuotesQueryKey(
  businessId: string,
  page: number,
  filters: PurchaseQuoteFilters,
) {
  return ["purchase-quotes", businessId, page, filters] as const;
}

export function usePurchaseQuotes(
  businessId: string,
  page: number,
  filters: PurchaseQuoteFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: purchaseQuotesQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: PurchaseQuote[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-quotes`,
        query: {
          page,
          pageSize,
          q: filters.q,
          status: filters.status,
        },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function usePurchaseQuote(
  businessId: string,
  quoteId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["purchase-quote", businessId, quoteId],
    queryFn: async () => {
      if (!quoteId) return null;
      const { data, error } = await apiClient.get<
        { data: PurchaseQuoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-quotes/${quoteId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(quoteId),
  });
}

export function useCreatePurchaseQuote(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreatePurchaseQuoteInput) => {
      const { data, error } = await apiClient.post<
        { data: PurchaseQuoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-quotes`,
        body: { ...input },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchase-quotes", businessId] });
    },
  });
}

export function useUpdatePurchaseQuote(businessId: string) {
  return useMutation({
    mutationFn: async ({ quoteId, ...body }: UpdatePurchaseQuoteInput) => {
      const { data, error } = await apiClient.put<
        { data: PurchaseQuoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-quotes/${quoteId}`,
        body,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["purchase-quotes", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["purchase-quote", businessId, variables.quoteId],
      });
    },
  });
}

export function useDeletePurchaseQuote(businessId: string) {
  return useMutation({
    mutationFn: async (quoteId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-quotes/${quoteId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchase-quotes", businessId] });
    },
  });
}
