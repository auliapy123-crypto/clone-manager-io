import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

/** Status divisi — mirror ProjectStatus tapi tanpa "completed". */
export type DivisionStatus = "active" | "inactive";

export interface Division {
  id: string;
  businessId: string;
  name: string;
  code: string | null;
  status: DivisionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DivisionFilters {
  q?: string;
  status?: DivisionStatus;
}

export interface CreateDivisionInput {
  name: string;
  code?: string | null;
  status?: DivisionStatus;
}

export interface UpdateDivisionInput {
  id: string;
  name?: string;
  code?: string | null;
  status?: DivisionStatus;
}

function divisionsQueryKey(
  businessId: string,
  page: number,
  filters: DivisionFilters,
) {
  return ["divisions", businessId, page, filters] as const;
}

/** GET /businesses/:businessId/divisions — daftar divisi terpaginasi. */
export function useDivisions(
  businessId: string,
  page: number,
  filters: DivisionFilters = {},
  pageSize = 10,
) {
  return useQuery({
    queryKey: divisionsQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: Division[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/divisions`,
        query: {
          page,
          pageSize,
          q: filters.q,
          status: filters.status,
        },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

/** GET /businesses/:businessId/divisions/:id — detail satu divisi. */
export function useDivision(businessId: string, id: string | null | undefined) {
  return useQuery({
    queryKey: ["division", businessId, id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await apiClient.get<
        { data: Division },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/divisions/${id}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(id),
  });
}

/** POST /businesses/:businessId/divisions — buat divisi baru. */
export function useCreateDivision(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateDivisionInput) => {
      const { data, error } = await apiClient.post<
        { data: Division },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/divisions`,
        body: { ...input },
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["divisions", businessId] });
    },
  });
}

/** PUT /businesses/:businessId/divisions/:id — perbarui divisi. */
export function useUpdateDivision(businessId: string) {
  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateDivisionInput) => {
      const { data, error } = await apiClient.put<
        { data: Division },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/divisions/${id}`,
        body: { ...body },
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["divisions", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["division", businessId, variables.id],
      });
    },
  });
}

/** DELETE /businesses/:businessId/divisions/:id — hapus divisi (soft-delete). */
export function useDeleteDivision(businessId: string) {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/divisions/${id}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["divisions", businessId] });
    },
  });
}

/**
 * Opsi dropdown "Division" untuk form transaksi 6 modul (dokumen
 * Divisions.md §10): daftar divisi berstatus active, DITAMBAH divisi
 * yang sedang tertandai pada dokumen ini (`currentDivisionId`) walau
 * statusnya sekarang inactive — supaya tag lama tidak hilang diam-diam
 * saat form edit dibuka. Mirror useProjectOptions.
 */
export function useDivisionOptions(
  businessId: string,
  currentDivisionId?: string | null,
) {
  const { data: activeData, isPending } = useDivisions(
    businessId,
    1,
    { status: "active" },
    100,
  );

  const needsCurrentLookup =
    !!currentDivisionId &&
    !(activeData?.data ?? []).some((d) => d.id === currentDivisionId);

  const { data: currentDivision } = useDivision(
    businessId,
    needsCurrentLookup ? currentDivisionId : null,
  );

  const options = useMemo(() => {
    const list = activeData?.data ?? [];
    if (currentDivision && !list.some((d) => d.id === currentDivision.id)) {
      return [...list, currentDivision];
    }
    return list;
  }, [activeData, currentDivision]);

  return { options, isPending };
}
