import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export type ProjectStatus = "active" | "inactive" | "completed";

export interface Project {
  id: string;
  businessId: string;
  name: string;
  code: string | null;
  customerId: string | null;
  customerName: string | null;
  status: ProjectStatus;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFilters {
  q?: string;
  status?: ProjectStatus;
}

export interface CreateProjectInput {
  name: string;
  code?: string | null;
  customerId?: string | null;
  status?: ProjectStatus;
}

export interface UpdateProjectInput {
  id: string;
  name?: string;
  code?: string | null;
  customerId?: string | null;
  status?: ProjectStatus;
}

function projectsQueryKey(
  businessId: string,
  page: number,
  filters: ProjectFilters,
) {
  return ["projects", businessId, page, filters] as const;
}

/** GET /businesses/:businessId/projects — daftar proyek terpaginasi. */
export function useProjects(
  businessId: string,
  page: number,
  filters: ProjectFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: projectsQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: Project[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/projects`,
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

/** GET /businesses/:businessId/projects/:id — detail satu proyek. */
export function useProject(businessId: string, id: string | null | undefined) {
  return useQuery({
    queryKey: ["project", businessId, id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await apiClient.get<
        { data: Project },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/projects/${id}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(id),
  });
}

/** POST /businesses/:businessId/projects — buat proyek baru. */
export function useCreateProject(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      const { data, error } = await apiClient.post<
        { data: Project },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/projects`,
        body: { ...input },
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", businessId] });
    },
  });
}

/** PUT /businesses/:businessId/projects/:id — perbarui proyek. */
export function useUpdateProject(businessId: string) {
  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateProjectInput) => {
      const { data, error } = await apiClient.put<
        { data: Project },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/projects/${id}`,
        body: { ...body },
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["projects", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["project", businessId, variables.id],
      });
    },
  });
}

/**
 * Opsi dropdown "Project" untuk form transaksi 6 modul (§10 dokumen
 * Projects): daftar proyek berstatus active, DITAMBAH proyek yang
 * sedang tertandai pada dokumen ini (`currentProjectId`) walau
 * statusnya sekarang inactive/completed -- supaya tag lama tidak
 * hilang diam-diam saat form edit dibuka.
 */
export function useProjectOptions(
  businessId: string,
  currentProjectId?: string | null,
) {
  const { data: activeData, isPending } = useProjects(
    businessId,
    1,
    { status: "active" },
    100,
  );

  const needsCurrentLookup =
    !!currentProjectId &&
    !(activeData?.data ?? []).some((p) => p.id === currentProjectId);

  const { data: currentProject } = useProject(
    businessId,
    needsCurrentLookup ? currentProjectId : null,
  );

  const options = useMemo(() => {
    const list = activeData?.data ?? [];
    if (currentProject && !list.some((p) => p.id === currentProject.id)) {
      return [...list, currentProject];
    }
    return list;
  }, [activeData, currentProject]);

  return { options, isPending };
}

/** DELETE /businesses/:businessId/projects/:id — hapus proyek (soft-delete). */
export function useDeleteProject(businessId: string) {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/projects/${id}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", businessId] });
    },
  });
}
