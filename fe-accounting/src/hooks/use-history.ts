import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";

/**
 * History (Riwayat / jejak audit) — MURNI READ-ONLY: hanya GET list +
 * detail, TANPA create/update/delete. Backend membaca tabel audit_logs
 * yang sudah ada (append-only).
 */
export type HistoryAction = "CREATE" | "UPDATE" | "DELETE";

export interface HistoryFilters {
  dateFrom?: string;
  dateTo?: string;
  entityType?: string;
  userId?: string;
  action?: HistoryAction;
}

export interface HistoryEntry {
  id: string;
  businessId: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

export interface HistoryDetail extends HistoryEntry {
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
}

export function useHistoryEntries(
  businessId: string,
  page: number,
  filters: HistoryFilters = {},
  pageSize = 10,
) {
  return useQuery({
    queryKey: ["history", businessId, page, filters, pageSize],
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: HistoryEntry[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/history`,
        query: {
          page,
          pageSize,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          entityType: filters.entityType,
          userId: filters.userId,
          action: filters.action,
        },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useHistoryEntry(
  businessId: string,
  entryId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["history-entry", businessId, entryId],
    queryFn: async () => {
      if (!entryId) return null;
      const { data, error } = await apiClient.get<
        { data: HistoryDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/history/${entryId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(entryId),
  });
}
