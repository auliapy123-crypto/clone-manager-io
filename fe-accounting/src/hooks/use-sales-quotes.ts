import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

/** Baris item Sales Quote: TANPA account_id (beda dari PO/invoice). */
export interface SalesQuoteLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface SalesQuoteLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
}

export interface SalesQuote {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  issueDate: string;
  validForDays: number | null;
  reference: string | null;
  billingAddress: string | null;
  description: string | null;
  totalAmount: number;
  expiryDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesQuoteDetail extends SalesQuote {
  lines: SalesQuoteLine[];
}

export interface SalesQuoteFilters {
  q?: string;
}

export interface CreateSalesQuoteInput {
  customerId: string;
  issueDate: string;
  validForDays?: number | null;
  reference?: string | null;
  billingAddress?: string | null;
  description?: string | null;
  lines: SalesQuoteLineInput[];
}

export interface UpdateSalesQuoteInput {
  quoteId: string;
  customerId?: string;
  issueDate?: string;
  validForDays?: number | null;
  reference?: string | null;
  billingAddress?: string | null;
  description?: string | null;
  lines?: SalesQuoteLineInput[];
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function salesQuotesQueryKey(
  businessId: string,
  page: number,
  filters: SalesQuoteFilters,
) {
  return ["sales-quotes", businessId, page, filters] as const;
}

export function useSalesQuotes(
  businessId: string,
  page: number,
  filters: SalesQuoteFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: salesQuotesQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: SalesQuote[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-quotes`,
        query: { page, pageSize, q: filters.q },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useSalesQuote(
  businessId: string,
  quoteId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["sales-quote", businessId, quoteId],
    queryFn: async () => {
      if (!quoteId) return null;
      const { data, error } = await apiClient.get<
        { data: SalesQuoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-quotes/${quoteId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(quoteId),
  });
}

export function useCreateSalesQuote(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateSalesQuoteInput) => {
      const payload: Record<string, unknown> = { ...input };
      const { data, error } = await apiClient.post<
        { data: SalesQuoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-quotes`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales-quotes", businessId] });
    },
  });
}

export function useUpdateSalesQuote(businessId: string) {
  return useMutation({
    mutationFn: async ({ quoteId, ...body }: UpdateSalesQuoteInput) => {
      const payload: Record<string, unknown> = { ...body };
      const { data, error } = await apiClient.put<
        { data: SalesQuoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-quotes/${quoteId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["sales-quotes", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["sales-quote", businessId, variables.quoteId],
      });
    },
  });
}

export function useDeleteSalesQuote(businessId: string) {
  return useMutation({
    mutationFn: async (quoteId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-quotes/${quoteId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales-quotes", businessId] });
    },
  });
}
