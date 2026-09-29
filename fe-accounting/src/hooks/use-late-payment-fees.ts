import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

/**
 * Late Payment Fee — denda keterlambatan pembayaran, NON-POSTING.
 *
 * Modul PALING SIMPEL: TANPA baris item, TANPA jurnal, TANPA hook
 * get-detail terpisah (form edit pakai data yang sudah ada di baris list).
 */
export interface LatePaymentFee {
  id: string;
  businessId: string;
  date: string;
  customerId: string;
  customerName: string;
  salesInvoiceId: string;
  salesInvoiceReference: string | null;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LatePaymentFeeFilters {
  q?: string;
}

export interface CreateLatePaymentFeeInput {
  date: string;
  customerId: string;
  salesInvoiceId: string;
  amount: number;
}

export interface UpdateLatePaymentFeeInput {
  feeId: string;
  date?: string;
  customerId?: string;
  salesInvoiceId?: string;
  amount?: number;
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function latePaymentFeesQueryKey(
  businessId: string,
  page: number,
  filters: LatePaymentFeeFilters,
) {
  return ["late-payment-fees", businessId, page, filters] as const;
}

export function useLatePaymentFees(
  businessId: string,
  page: number,
  filters: LatePaymentFeeFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: latePaymentFeesQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: LatePaymentFee[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/late-payment-fees`,
        query: { page, pageSize, q: filters.q },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useCreateLatePaymentFee(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateLatePaymentFeeInput) => {
      const payload: Record<string, unknown> = { ...input };
      const { data, error } = await apiClient.post<
        { data: LatePaymentFee },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/late-payment-fees`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["late-payment-fees", businessId] });
    },
  });
}

export function useUpdateLatePaymentFee(businessId: string) {
  return useMutation({
    mutationFn: async ({ feeId, ...body }: UpdateLatePaymentFeeInput) => {
      const payload: Record<string, unknown> = { ...body };
      const { data, error } = await apiClient.put<
        { data: LatePaymentFee },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/late-payment-fees/${feeId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["late-payment-fees", businessId] });
    },
  });
}

export function useDeleteLatePaymentFee(businessId: string) {
  return useMutation({
    mutationFn: async (feeId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/late-payment-fees/${feeId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["late-payment-fees", businessId] });
    },
  });
}
