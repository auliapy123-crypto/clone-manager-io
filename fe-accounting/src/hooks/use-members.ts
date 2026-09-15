import { useMutation, useQuery } from "@tanstack/react-query";
import type { BusinessRole } from "@/config/menuConfig";
import { apiClient } from "@/integrations/setup";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

/**
 * Data layer Members (Guide §3, §7.2 -- UserRoutes.ts). Semua request di sini
 * ber-scope tenant: WAJIB kirim header `x-business-id`.
 */
export interface BusinessMember {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  role: BusinessRole;
}

export interface PaginationInfo {
  total: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
}

function businessScopeHeaders(businessId: string): Record<string, string> {
  return { "x-business-id": businessId };
}

function membersQueryKey(businessId: string, page: number) {
  return ["members", businessId, page] as const;
}

/** GET /users -- daftar anggota bisnis aktif beserta role (paginated). */
export function useMembers(businessId: string, page: number, pageSize = 20) {
  return useQuery({
    queryKey: membersQueryKey(businessId, page),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: BusinessMember[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: "/users",
        headers: businessScopeHeaders(businessId),
        query: { page, pageSize },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export interface AddMemberInput {
  name: string;
  email: string;
  password: string;
  role: BusinessRole;
}

/**
 * POST /users lalu POST /users/assign -- backend sengaja memisah "buat akun"
 * dari "hubungkan ke bisnis" (lihat komentar UserRoutes.ts), jadi FE yang
 * merangkai dua panggilan ini jadi satu aksi "Tambah Anggota".
 */
export function useAddMember(businessId: string) {
  return useMutation({
    mutationFn: async (input: AddMemberInput) => {
      const headers = businessScopeHeaders(businessId);

      const created = await apiClient.post<{ data: { id: string } }, ApiErrorBody>({
        url: "/users",
        headers,
        body: { name: input.name, email: input.email, password: input.password },
      });
      if (created.error) throw new ApiError(created.error);

      const assigned = await apiClient.post<
        { data: { id: string; userId: string; businessId: string; role: BusinessRole } },
        ApiErrorBody
      >({
        url: "/users/assign",
        headers,
        body: { userId: created.data.data.id, role: input.role },
      });
      if (assigned.error) throw new ApiError(assigned.error);

      return assigned.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["members", businessId] });
    },
  });
}

export interface UpdateMemberRoleInput {
  userId: string;
  role: BusinessRole;
}

/** PATCH /users/:userId/role -- backend menolak jika ini admin terakhir. */
export function useUpdateMemberRole(businessId: string) {
  return useMutation({
    mutationFn: async ({ userId, role }: UpdateMemberRoleInput) => {
      const { data, error } = await apiClient.patch<
        { data: { id: string; userId: string; businessId: string; role: BusinessRole } },
        ApiErrorBody
      >({
        url: `/users/${userId}/role`,
        headers: businessScopeHeaders(businessId),
        body: { role },
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["members", businessId] });
    },
  });
}

/** DELETE /users/:userId -- lepas keanggotaan; akun user-nya tidak dihapus. */
export function useRemoveMember(businessId: string) {
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/users/${userId}`,
        headers: businessScopeHeaders(businessId),
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["members", businessId] });
    },
  });
}
