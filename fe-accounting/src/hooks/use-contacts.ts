import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import type { PaginationInfo } from "@/hooks/use-members";

export interface ContactOption { id: string; name: string; code: string | null }
export function useContacts(businessId: string) {
  return useQuery({
    queryKey: ["contacts", businessId],
    queryFn: async () => {
      const contacts: ContactOption[] = [];
      let page = 1;
      while (true) {
        const { data, error } = await apiClient.get<{ data: ContactOption[]; pagination: PaginationInfo }, ApiErrorBody>({
          url: `/businesses/${businessId}/contacts`, query: { page, pageSize: 100 },
        });
        if (error) throw new ApiError(error);
        contacts.push(...data.data);
        if (page >= data.pagination.totalPages) return contacts;
        page++;
      }
    },
  });
}
