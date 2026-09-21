import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export interface Supplier {
  id: string;
  businessId: string;
  name: string;
  code: string | null;
  email: string | null;
  billingAddress: string | null;
  deliveryAddress: string | null;
  purchaseInvoiceDueDateDays: number | null;
  isCustomer: boolean;
  isSupplier: true;
  accountsPayable: number;
  unallocatedPayments: number;
  /** Kompatibel dengan versi backend yang kelak mendukung nonaktif tanpa delete. */
  isInactive?: boolean;
  deletedAt?: string | null;
}

export interface SupplierFilters {
  q?: string;
}

export interface CreateSupplierInput {
  name: string;
  code?: string;
  email?: string;
  billingAddress?: string;
  deliveryAddress?: string;
  purchaseInvoiceDueDateDays?: number;
}

export interface UpdateSupplierInput {
  supplierId: string;
  name?: string;
  code?: string | null;
  email?: string | null;
  billingAddress?: string | null;
  deliveryAddress?: string | null;
  purchaseInvoiceDueDateDays?: number | null;
}

function suppliersQueryKey(businessId: string, page: number, filters: SupplierFilters) {
  return ["suppliers", businessId, page, filters] as const;
}

/** GET /businesses/:businessId/suppliers — daftar pemasok terpaginated. */
export function useSuppliers(
  businessId: string,
  page: number,
  filters: SupplierFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: suppliersQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: Supplier[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/suppliers`,
        query: { page, pageSize, q: filters.q },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useCreateSupplier(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateSupplierInput) => {
      const { data, error } = await apiClient.post<{ data: Supplier }, ApiErrorBody>({
        url: `/businesses/${businessId}/suppliers`,
        body: { ...input },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["suppliers", businessId] }),
  });
}

export function useUpdateSupplier(businessId: string) {
  return useMutation({
    mutationFn: async ({ supplierId, ...body }: UpdateSupplierInput) => {
      const { data, error } = await apiClient.patch<{ data: Supplier }, ApiErrorBody>({
        url: `/businesses/${businessId}/suppliers/${supplierId}`,
        body,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["suppliers", businessId] }),
  });
}

export function useDeleteSupplier(businessId: string) {
  return useMutation({
    mutationFn: async (supplierId: string) => {
      const { data, error } = await apiClient.delete<{ data: { message: string } }, ApiErrorBody>({
        url: `/businesses/${businessId}/suppliers/${supplierId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["suppliers", businessId] }),
  });
}
