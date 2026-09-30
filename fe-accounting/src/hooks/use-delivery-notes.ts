import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

/**
 * Delivery Note (Surat Jalan) — dokumen administratif NON-POSTING.
 * Baris item TANPA unit_price/line_total — cuma Description + Qty,
 * tidak ada nilai uang sama sekali.
 */
export interface DeliveryNoteLineInput {
  description: string;
  quantity: number;
}

export interface DeliveryNoteLine {
  id: string;
  description: string;
  quantity: number;
  sortOrder: number;
}

export interface DeliveryNote {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  deliveryDate: string;
  reference: string | null;
  salesOrderId: string | null;
  salesOrderReference: string | null;
  salesInvoiceId: string | null;
  salesInvoiceReference: string | null;
  deliveryAddress: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryNoteDetail extends DeliveryNote {
  lines: DeliveryNoteLine[];
}

export interface DeliveryNoteFilters {
  q?: string;
}

export interface CreateDeliveryNoteInput {
  customerId: string;
  deliveryDate: string;
  salesOrderId?: string | null;
  salesInvoiceId?: string | null;
  reference?: string | null;
  deliveryAddress?: string | null;
  description?: string | null;
  lines: DeliveryNoteLineInput[];
}

export interface UpdateDeliveryNoteInput {
  noteId: string;
  customerId?: string;
  deliveryDate?: string;
  salesOrderId?: string | null;
  salesInvoiceId?: string | null;
  reference?: string | null;
  deliveryAddress?: string | null;
  description?: string | null;
  lines?: DeliveryNoteLineInput[];
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function deliveryNotesQueryKey(
  businessId: string,
  page: number,
  filters: DeliveryNoteFilters,
) {
  return ["delivery-notes", businessId, page, filters] as const;
}

export function useDeliveryNotes(
  businessId: string,
  page: number,
  filters: DeliveryNoteFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: deliveryNotesQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: DeliveryNote[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/delivery-notes`,
        query: { page, pageSize, q: filters.q },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useDeliveryNote(
  businessId: string,
  noteId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["delivery-note", businessId, noteId],
    queryFn: async () => {
      if (!noteId) return null;
      const { data, error } = await apiClient.get<
        { data: DeliveryNoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/delivery-notes/${noteId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(noteId),
  });
}

export function useCreateDeliveryNote(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateDeliveryNoteInput) => {
      const payload: Record<string, unknown> = { ...input };
      const { data, error } = await apiClient.post<
        { data: DeliveryNoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/delivery-notes`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["delivery-notes", businessId],
      });
    },
  });
}

export function useUpdateDeliveryNote(businessId: string) {
  return useMutation({
    mutationFn: async ({ noteId, ...body }: UpdateDeliveryNoteInput) => {
      const payload: Record<string, unknown> = { ...body };
      const { data, error } = await apiClient.put<
        { data: DeliveryNoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/delivery-notes/${noteId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["delivery-notes", businessId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["delivery-note", businessId, variables.noteId],
      });
    },
  });
}

export function useDeleteDeliveryNote(businessId: string) {
  return useMutation({
    mutationFn: async (noteId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/delivery-notes/${noteId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["delivery-notes", businessId],
      });
    },
  });
}
