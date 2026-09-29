import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export interface CreditNoteLineInput {
  accountId: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
}

export interface CreditNoteLine {
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

export interface CreditNote {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  reference: string | null;
  issueDate: string;
  description: string | null;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreditNoteDetail extends CreditNote {
  lines: CreditNoteLine[];
}

export interface CreateCreditNoteInput {
  customerId: string;
  issueDate?: string;
  reference?: string;
  description?: string | null;
  lines: CreditNoteLineInput[];
}

export interface UpdateCreditNoteInput {
  creditNoteId: string;
  customerId?: string;
  issueDate?: string;
  reference?: string | null;
  description?: string | null;
  lines?: CreditNoteLineInput[];
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function creditNotesQueryKey(businessId: string, page: number, q?: string) {
  return ["credit-notes", businessId, page, q] as const;
}

export function useCreditNotes(
  businessId: string,
  page: number,
  q?: string,
  pageSize = 20,
) {
  return useQuery({
    queryKey: creditNotesQueryKey(businessId, page, q),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: CreditNote[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/credit-notes`,
        query: {
          page,
          pageSize,
          q,
        },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useCreditNote(
  businessId: string,
  creditNoteId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["credit-note", businessId, creditNoteId],
    queryFn: async () => {
      if (!creditNoteId) return null;
      const { data, error } = await apiClient.get<
        { data: CreditNoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/credit-notes/${creditNoteId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(creditNoteId),
  });
}

export function useCreateCreditNote(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateCreditNoteInput) => {
      const issueDate = input.issueDate?.trim() || getTodayDateString();
      const { data, error } = await apiClient.post<
        { data: CreditNoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/credit-notes`,
        body: {
          ...input,
          issueDate,
        },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["credit-notes", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["customers", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}

export function useUpdateCreditNote(businessId: string) {
  return useMutation({
    mutationFn: async ({ creditNoteId, ...body }: UpdateCreditNoteInput) => {
      const payload: Record<string, unknown> = { ...body };
      if (body.issueDate !== undefined) {
        payload.issueDate = body.issueDate.trim() || getTodayDateString();
      }

      const { data, error } = await apiClient.put<
        { data: CreditNoteDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/credit-notes/${creditNoteId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["credit-notes", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["credit-note", businessId, variables.creditNoteId],
      });
      void queryClient.invalidateQueries({ queryKey: ["customers", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}

export function useDeleteCreditNote(businessId: string) {
  return useMutation({
    mutationFn: async (creditNoteId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/credit-notes/${creditNoteId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["credit-notes", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["customers", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}
