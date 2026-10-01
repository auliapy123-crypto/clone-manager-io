import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export interface DebitNoteLineInput {
  accountId: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
}

export interface DebitNoteLine {
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

export interface DebitNote {
  id: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  purchaseInvoiceId: string | null;
  purchaseInvoiceReference: string | null;
  debitNoteNumber: string | null;
  date: string;
  description: string | null;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DebitNoteDetail extends DebitNote {
  lines: DebitNoteLine[];
}

export interface CreateDebitNoteInput {
  supplierId: string;
  date?: string;
  debitNoteNumber?: string | null;
  purchaseInvoiceId?: string | null;
  description?: string | null;
  lines: DebitNoteLineInput[];
}

export interface UpdateDebitNoteInput {
  debitNoteId: string;
  supplierId?: string;
  date?: string;
  debitNoteNumber?: string | null;
  purchaseInvoiceId?: string | null;
  description?: string | null;
  lines?: DebitNoteLineInput[];
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function debitNotesQueryKey(businessId: string, page: number, q?: string) {
  return ["debit-notes", businessId, page, q] as const;
}

/** Invalidasi semua cache yang saling berkaitan dengan nota debet. */
function invalidateDebitNoteRelated(businessId: string) {
  void queryClient.invalidateQueries({ queryKey: ["debit-notes", businessId] });
  void queryClient.invalidateQueries({ queryKey: ["suppliers", businessId] });
  void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
  void queryClient.invalidateQueries({
    queryKey: ["purchase-invoices", businessId],
  });
}

export function useDebitNotes(
  businessId: string,
  page: number,
  q?: string,
  pageSize = 10,
) {
  return useQuery({
    queryKey: debitNotesQueryKey(businessId, page, q),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: DebitNote[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/debit-notes`,
        query: { page, pageSize, q },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useDebitNote(
  businessId: string,
  debitNoteId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["debit-note", businessId, debitNoteId],
    queryFn: async () => {
      if (!debitNoteId) return null;
      const { data, error } = await apiClient.get<
        { data: DebitNoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/debit-notes/${debitNoteId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(debitNoteId),
  });
}

export function useCreateDebitNote(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateDebitNoteInput) => {
      const date = input.date?.trim() || getTodayDateString();
      const { data, error } = await apiClient.post<
        { data: DebitNoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/debit-notes`,
        body: { ...input, date },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => invalidateDebitNoteRelated(businessId),
  });
}

export function useUpdateDebitNote(businessId: string) {
  return useMutation({
    mutationFn: async ({ debitNoteId, ...body }: UpdateDebitNoteInput) => {
      const payload: Record<string, unknown> = { ...body };
      if (body.date !== undefined) {
        payload.date = body.date.trim() || getTodayDateString();
      }

      const { data, error } = await apiClient.put<
        { data: DebitNoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/debit-notes/${debitNoteId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      invalidateDebitNoteRelated(businessId);
      void queryClient.invalidateQueries({
        queryKey: ["debit-note", businessId, variables.debitNoteId],
      });
    },
  });
}

/** Duplikat satu nota debet (Date = hari ini) — endpoint POST /:id/copy. */
export function useCopyDebitNote(businessId: string) {
  return useMutation({
    mutationFn: async (debitNoteId: string) => {
      const { data, error } = await apiClient.post<
        { data: DebitNoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/debit-notes/${debitNoteId}/copy`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => invalidateDebitNoteRelated(businessId),
  });
}

export function useDeleteDebitNote(businessId: string) {
  return useMutation({
    mutationFn: async (debitNoteId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/debit-notes/${debitNoteId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => invalidateDebitNoteRelated(businessId),
  });
}
