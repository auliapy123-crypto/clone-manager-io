import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

/**
 * Billable Time — catatan jam kerja yang berpotensi ditagihkan.
 * BERDIRI SENDIRI: tidak ada relasi ke Sales Invoices apa pun.
 * amount & status dihitung/ ditentukan backend real-time; status
 * SELALU "Uninvoiced" (statis).
 */
export interface BillableTimeEntry {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  employeeContactId: string;
  employeeName: string;
  date: string;
  description: string;
  hourlyRate: number;
  timeSpentMinutes: number;
  amount: number;
  status: "Uninvoiced";
  createdAt: string;
  updatedAt: string;
}

export interface BillableTimeEntryFilters {
  q?: string;
}

export interface CreateBillableTimeEntryInput {
  customerId: string;
  employeeContactId: string;
  date: string;
  description: string;
  hourlyRate: number;
  timeSpentMinutes: number;
}

export interface UpdateBillableTimeEntryInput {
  entryId: string;
  customerId?: string;
  employeeContactId?: string;
  date?: string;
  description?: string;
  hourlyRate?: number;
  timeSpentMinutes?: number;
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function billableTimeQueryKey(
  businessId: string,
  page: number,
  filters: BillableTimeEntryFilters,
) {
  return ["billable-time", businessId, page, filters] as const;
}

export function useBillableTimeEntries(
  businessId: string,
  page: number,
  filters: BillableTimeEntryFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: billableTimeQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: BillableTimeEntry[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/billable-time`,
        query: { page, pageSize, q: filters.q },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useBillableTimeEntry(
  businessId: string,
  entryId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["billable-time-entry", businessId, entryId],
    queryFn: async () => {
      if (!entryId) return null;
      const { data, error } = await apiClient.get<
        { data: BillableTimeEntry },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/billable-time/${entryId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(entryId),
  });
}

export function useCreateBillableTimeEntry(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateBillableTimeEntryInput) => {
      const { data, error } = await apiClient.post<
        { data: BillableTimeEntry },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/billable-time`,
        body: { ...input },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["billable-time", businessId],
      });
    },
  });
}

export function useUpdateBillableTimeEntry(businessId: string) {
  return useMutation({
    mutationFn: async ({ entryId, ...body }: UpdateBillableTimeEntryInput) => {
      const { data, error } = await apiClient.put<
        { data: BillableTimeEntry },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/billable-time/${entryId}`,
        body,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["billable-time", businessId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["billable-time-entry", businessId, variables.entryId],
      });
    },
  });
}

/** Duplikat entry jadi baru (date hari ini, sisanya sama) — POST /:id/copy. */
export function useCopyBillableTimeEntry(businessId: string) {
  return useMutation({
    mutationFn: async (entryId: string) => {
      const { data, error } = await apiClient.post<
        { data: BillableTimeEntry },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/billable-time/${entryId}/copy`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["billable-time", businessId],
      });
    },
  });
}

export function useDeleteBillableTimeEntry(businessId: string) {
  return useMutation({
    mutationFn: async (entryId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/billable-time/${entryId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["billable-time", businessId],
      });
    },
  });
}
