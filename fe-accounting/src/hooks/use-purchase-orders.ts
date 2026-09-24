import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export type PurchaseOrderStatus =
  | "Draft/Open"
  | "Partially Invoiced"
  | "Fully Invoiced/Closed";

export interface PurchaseOrderLineInput {
  accountId: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
}

export interface PurchaseOrderLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
  sortOrder: number;
}

export interface PurchaseOrder {
  id: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  reference: string | null;
  date: string;
  billingAddress: string | null;
  description: string | null;
  totalOrderAmount: number;
  invoicedAmount: number;
  status: PurchaseOrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  lines: PurchaseOrderLine[];
}

export interface PurchaseOrderFilters {
  q?: string;
  status?: PurchaseOrderStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  reference?: string;
  date?: string;
  billingAddress?: string | null;
  description?: string | null;
  lines: PurchaseOrderLineInput[];
}

export interface UpdatePurchaseOrderInput {
  orderId: string;
  supplierId?: string;
  reference?: string | null;
  date?: string;
  billingAddress?: string | null;
  description?: string | null;
  lines?: PurchaseOrderLineInput[];
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function purchaseOrdersQueryKey(
  businessId: string,
  page: number,
  filters: PurchaseOrderFilters,
) {
  return ["purchase-orders", businessId, page, filters] as const;
}

export function usePurchaseOrders(
  businessId: string,
  page: number,
  filters: PurchaseOrderFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: purchaseOrdersQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: PurchaseOrder[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-orders`,
        query: {
          page,
          pageSize,
          q: filters.q,
          status: filters.status,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function usePurchaseOrder(
  businessId: string,
  orderId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["purchase-order", businessId, orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await apiClient.get<
        { data: PurchaseOrderDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-orders/${orderId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(orderId),
  });
}

export function useCreatePurchaseOrder(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreatePurchaseOrderInput) => {
      const date = input.date?.trim() || getTodayDateString();
      const { data, error } = await apiClient.post<
        { data: PurchaseOrderDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-orders`,
        body: {
          ...input,
          date,
        },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchase-orders", businessId] });
    },
  });
}

export function useUpdatePurchaseOrder(businessId: string) {
  return useMutation({
    mutationFn: async ({ orderId, ...body }: UpdatePurchaseOrderInput) => {
      const payload: Record<string, unknown> = { ...body };
      if (body.date !== undefined) {
        payload.date = body.date.trim() || getTodayDateString();
      }

      const { data, error } = await apiClient.put<
        { data: PurchaseOrderDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-orders/${orderId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["purchase-orders", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["purchase-order", businessId, variables.orderId],
      });
    },
  });
}

export function useDeletePurchaseOrder(businessId: string) {
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-orders/${orderId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchase-orders", businessId] });
    },
  });
}
