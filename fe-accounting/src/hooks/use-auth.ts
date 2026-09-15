import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import { clearTokens, getAccessToken, setTokens } from "@/lib/auth/cookies";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

// TODO(fase berikutnya): useUpdateMe (Guide §6) — belum dibutuhkan halaman
// yang sedang dibangun saat ini.

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string };
}

export function useLogin() {
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const { data, error } = await apiClient.post<
        { data: LoginResult },
        ApiErrorBody
      >({
        url: "/auth/login",
        body: input as unknown as Record<string, unknown>,
      });

      if (error) throw new ApiError(error);

      setTokens(data.data);
      return data.data;
    },
  });
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/** Profil user aktif (Guide §9) -- dipakai header untuk tampilkan nama di dropdown. */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data, error } = await apiClient.get<{ data: SessionUser }, ApiErrorBody>({
        url: "/auth/me",
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(getAccessToken()),
  });
}

/** Guide §9: hapus sesi/cookie. Redirect ke /login jadi tanggung jawab caller. */
export function useLogout() {
  return useMutation({
    mutationFn: async () => {
      clearTokens();
      queryClient.clear();
    },
  });
}

export interface ChangePasswordInput {
  oldPassword: string;
  newPassword: string;
}

/** Guide §9: dipakai ChangePasswordDialog dari dropdown header. */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (input: ChangePasswordInput) => {
      const { data, error } = await apiClient.post<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: "/auth/change-password",
        body: input as unknown as Record<string, unknown>,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
  });
}
