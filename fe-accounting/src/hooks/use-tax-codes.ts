import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export interface TaxCode {
  id: string;
  businessId: string;
  code: string;
  name: string;
  ratePercent: number;
  isActive: boolean;
  description: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaxCodeFilters {
  q?: string;
  isActive?: boolean;
}

export interface CreateTaxCodeInput {
  code: string;
  name: string;
  ratePercent: number;
  isActive?: boolean;
  description?: string | null;
}

export interface UpdateTaxCodeInput {
  id: string;
  code?: string;
  name?: string;
  ratePercent?: number;
  isActive?: boolean;
  description?: string | null;
}

function taxCodesQueryKey(
  businessId: string,
  page: number,
  filters: TaxCodeFilters,
) {
  return ["tax-codes", businessId, page, filters] as const;
}

/** GET /businesses/:businessId/tax-codes — daftar kode pajak terpaginasi. */
export function useTaxCodes(
  businessId: string,
  page: number,
  filters: TaxCodeFilters = {},
  pageSize = 10,
) {
  return useQuery({
    queryKey: taxCodesQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: TaxCode[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/tax-codes`,
        query: {
          page,
          pageSize,
          q: filters.q,
          isActive: filters.isActive,
        },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

/** GET /businesses/:businessId/tax-codes/:id — detail satu kode pajak. */
export function useTaxCode(businessId: string, id: string | null | undefined) {
  return useQuery({
    queryKey: ["tax-code", businessId, id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await apiClient.get<{ data: TaxCode }, ApiErrorBody>({
        url: `/businesses/${businessId}/tax-codes/${id}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(id),
  });
}

/** POST /businesses/:businessId/tax-codes — buat kode pajak baru. */
export function useCreateTaxCode(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateTaxCodeInput) => {
      const { data, error } = await apiClient.post<{ data: TaxCode }, ApiErrorBody>({
        url: `/businesses/${businessId}/tax-codes`,
        body: { ...input },
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tax-codes", businessId] });
    },
  });
}

/** PUT /businesses/:businessId/tax-codes/:id — perbarui kode pajak. */
export function useUpdateTaxCode(businessId: string) {
  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateTaxCodeInput) => {
      const { data, error } = await apiClient.put<{ data: TaxCode }, ApiErrorBody>({
        url: `/businesses/${businessId}/tax-codes/${id}`,
        body: { ...body },
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["tax-codes", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["tax-code", businessId, variables.id],
      });
    },
  });
}

/** DELETE /businesses/:businessId/tax-codes/:id — hapus kode pajak (soft-delete). */
export function useDeleteTaxCode(businessId: string) {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/tax-codes/${id}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tax-codes", businessId] });
    },
  });
}

/**
 * Opsi dropdown "Tax Code" untuk baris form Sales Invoices: daftar kode
 * berstatus aktif saja. Kode yang tidak aktif tidak mungkin ada di baris
 * faktur yang masih bisa diedit (nonaktif/hapus ditolak selama dipakai
 * faktur aktif), jadi tidak perlu injeksi current seperti Divisions.
 */
export function useTaxCodeOptions(businessId: string) {
  const { data, isPending } = useTaxCodes(
    businessId,
    1,
    { isActive: true },
    100,
  );
  return { options: data?.data ?? [], isPending };
}
