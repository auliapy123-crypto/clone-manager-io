import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export interface JournalEntryLineInput {
  accountId: string;
  contactId?: string | null;
  debit?: number;
  credit?: number;
  description?: string | null;
}

export interface JournalEntryLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  contactId: string | null;
  contactName: string | null;
  debit: number;
  credit: number;
  description: string | null;
}

export interface JournalEntry {
  id: string;
  businessId: string;
  entryDate: string;
  reference: string | null;
  sourceModule: string;
  sourceId: string | null;
  description: string | null;
  isManual: boolean;
  totalDebit: number;
  totalCredit: number;
}

export interface JournalEntryDetail extends JournalEntry {
  lines: JournalEntryLine[];
}

export interface JournalEntryFilters {
  q?: string;
  sourceModule?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateJournalEntryInput {
  entryDate?: string;
  reference?: string;
  description?: string | null;
  lines: JournalEntryLineInput[];
}

export interface UpdateJournalEntryInput {
  entryId: string;
  entryDate?: string;
  reference?: string | null;
  description?: string | null;
  lines?: JournalEntryLineInput[];
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function journalEntriesQueryKey(
  businessId: string,
  page: number,
  filters: JournalEntryFilters,
) {
  return ["journal-entries", businessId, page, filters] as const;
}

export function useJournalEntries(
  businessId: string,
  page: number,
  filters: JournalEntryFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: journalEntriesQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: JournalEntry[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/journal-entries`,
        query: {
          page,
          pageSize,
          q: filters.q,
          sourceModule: filters.sourceModule,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useJournalEntry(
  businessId: string,
  entryId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["journal-entry", businessId, entryId],
    queryFn: async () => {
      if (!entryId) return null;
      const { data, error } = await apiClient.get<
        { data: JournalEntryDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/journal-entries/${entryId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(entryId),
  });
}

export function useCreateJournalEntry(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateJournalEntryInput) => {
      const entryDate = input.entryDate?.trim() || getTodayDateString();
      const { data, error } = await apiClient.post<
        { data: JournalEntryDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/journal-entries`,
        body: {
          ...input,
          entryDate,
        },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["journal-entries", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}

export function useUpdateJournalEntry(businessId: string) {
  return useMutation({
    mutationFn: async ({ entryId, ...body }: UpdateJournalEntryInput) => {
      const payload: Record<string, unknown> = { ...body };
      if (body.entryDate !== undefined) {
        payload.entryDate = body.entryDate.trim() || getTodayDateString();
      }

      const { data, error } = await apiClient.put<
        { data: JournalEntryDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/journal-entries/${entryId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["journal-entries", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["journal-entry", businessId, variables.entryId],
      });
      void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}

export function useDeleteJournalEntry(businessId: string) {
  return useMutation({
    mutationFn: async (entryId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/journal-entries/${entryId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["journal-entries", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}
