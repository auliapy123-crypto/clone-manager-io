import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  code: string | null;
  email: string | null;
  billingAddress: string | null;
  deliveryAddress: string | null;
  creditLimit: number;
  salesInvoiceDueDateDays: number | null;
  isCustomer: true;
  isSupplier: boolean;
  accountsReceivable: number;
  unallocatedReceipts: number;
  /** Kompatibel dengan versi backend yang kelak mendukung nonaktif tanpa delete. */
  isInactive?: boolean;
  deletedAt?: string | null;
}

export interface CustomerFilters {
  q?: string;
}

export interface CreateCustomerInput {
  name: string;
  code?: string;
  email?: string;
  creditLimit?: number;
  billingAddress?: string;
  deliveryAddress?: string;
  salesInvoiceDueDateDays?: number;
}

export interface UpdateCustomerInput {
  customerId: string;
  name?: string;
  code?: string | null;
  email?: string | null;
  billingAddress?: string | null;
  deliveryAddress?: string | null;
  salesInvoiceDueDateDays?: number | null;
}

function customersQueryKey(businessId: string, page: number, filters: CustomerFilters) {
  return ["customers", businessId, page, filters] as const;
}

/** GET /businesses/:businessId/customers — daftar pelanggan terpaginated. */
export function useCustomers(
  businessId: string,
  page: number,
  filters: CustomerFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: customersQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: Customer[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/customers`,
        query: { page, pageSize, q: filters.q },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useCreateCustomer(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateCustomerInput) => {
      const { data, error } = await apiClient.post<{ data: Customer }, ApiErrorBody>({
        url: `/businesses/${businessId}/customers`,
        body: { ...input },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["customers", businessId] }),
  });
}

export function useUpdateCustomer(businessId: string) {
  return useMutation({
    mutationFn: async ({ customerId, ...body }: UpdateCustomerInput) => {
      const { data, error } = await apiClient.patch<{ data: Customer }, ApiErrorBody>({
        url: `/businesses/${businessId}/customers/${customerId}`,
        body,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["customers", businessId] }),
  });
}

export function useDeleteCustomer(businessId: string) {
  return useMutation({
    mutationFn: async (customerId: string) => {
      const { data, error } = await apiClient.delete<{ data: { message: string } }, ApiErrorBody>({
        url: `/businesses/${businessId}/customers/${customerId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["customers", businessId] }),
  });
}
