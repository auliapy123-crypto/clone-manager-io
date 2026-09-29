import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

/** Baris item Sales Order: TANPA account_id (sama seperti Sales Quotes). */
export interface SalesOrderLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface SalesOrderLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
}

export interface SalesOrder {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  issueDate: string;
  reference: string | null;
  description: string | null;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SalesOrderDetail extends SalesOrder {
  lines: SalesOrderLine[];
}

export interface SalesOrderFilters {
  q?: string;
}

export interface CreateSalesOrderInput {
  customerId: string;
  issueDate: string;
  reference?: string | null;
  description?: string | null;
  lines: SalesOrderLineInput[];
}

export interface UpdateSalesOrderInput {
  orderId: string;
  customerId?: string;
  issueDate?: string;
  reference?: string | null;
  description?: string | null;
  lines?: SalesOrderLineInput[];
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function salesOrdersQueryKey(
  businessId: string,
  page: number,
  filters: SalesOrderFilters,
) {
  return ["sales-orders", businessId, page, filters] as const;
}

export function useSalesOrders(
  businessId: string,
  page: number,
  filters: SalesOrderFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: salesOrdersQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: SalesOrder[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-orders`,
        query: { page, pageSize, q: filters.q },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useSalesOrder(
  businessId: string,
  orderId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["sales-order", businessId, orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await apiClient.get<
        { data: SalesOrderDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-orders/${orderId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(orderId),
  });
}

export function useCreateSalesOrder(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateSalesOrderInput) => {
      const payload: Record<string, unknown> = { ...input };
      const { data, error } = await apiClient.post<
        { data: SalesOrderDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-orders`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales-orders", businessId] });
    },
  });
}

export function useUpdateSalesOrder(businessId: string) {
  return useMutation({
    mutationFn: async ({ orderId, ...body }: UpdateSalesOrderInput) => {
      const payload: Record<string, unknown> = { ...body };
      const { data, error } = await apiClient.put<
        { data: SalesOrderDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-orders/${orderId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["sales-orders", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["sales-order", businessId, variables.orderId],
      });
    },
  });
}

export function useDeleteSalesOrder(businessId: string) {
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-orders/${orderId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales-orders", businessId] });
    },
  });
}
