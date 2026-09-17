import { useQuery } from "@tanstack/react-query";
import type { BusinessRole } from "@/config/menuConfig";
import { apiClient } from "@/integrations/setup";
import { getAccessToken } from "@/lib/auth/cookies";
import { ApiError, type ApiErrorBody } from "@/lib/errors";

export interface Business {
  id: string;
  name: string;
  baseCurrencyCode: string;
  role: BusinessRole;
}

/** Guide §3, §7: daftar bisnis yang bisa diakses user aktif (GET /businesses). */
export function useBusinesses() {
  return useQuery({
    queryKey: ["businesses"],
    queryFn: async () => {
      const { data, error } = await apiClient.get<{ data: Business[] }, ApiErrorBody>({
        url: "/businesses",
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(getAccessToken()),
  });
}
