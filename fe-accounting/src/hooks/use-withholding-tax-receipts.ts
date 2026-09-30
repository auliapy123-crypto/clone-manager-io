import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

/**
 * Withholding Tax Receipt — bukti potong PPh dari pelanggan. POSTING jurnal
 * di backend dan MENGURANGI balanceDue Sales Invoice terkait, jadi setiap
 * mutasi juga meng-invalidate cache "sales-invoices".
 */
export interface WithholdingTaxReceipt {
  id: string;
  businessId: string;
  date: string;
  customerId: string;
  customerName: string;
  salesInvoiceId: string;
  salesInvoiceReference: string | null;
  withholdingTaxAccountId: string;
  withholdingTaxAccountCode: string;
  withholdingTaxAccountName: string;
  amount: number;
  reference: string | null;
  description: string | null;
  status: "Applied";
  createdAt: string;
  updatedAt: string;
}

export interface WithholdingTaxReceiptFilters {
  q?: string;
}

export interface CreateWithholdingTaxReceiptInput {
  date: string;
  customerId: string;
  salesInvoiceId: string;
  withholdingTaxAccountId: string;
  amount: number;
  reference?: string | null;
  description?: string | null;
}

export interface UpdateWithholdingTaxReceiptInput
  extends Partial<CreateWithholdingTaxReceiptInput> {
  receiptId: string;
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function invalidate(businessId: string) {
  void queryClient.invalidateQueries({
    queryKey: ["withholding-tax-receipts", businessId],
  });
  void queryClient.invalidateQueries({
    queryKey: ["sales-invoices", businessId],
  });
}

export function useWithholdingTaxReceipts(
  businessId: string,
  page: number,
  filters: WithholdingTaxReceiptFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: [
      "withholding-tax-receipts",
      businessId,
      page,
      filters,
      pageSize,
    ] as const,
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: WithholdingTaxReceipt[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/withholding-tax-receipts`,
        query: { page, pageSize, q: filters.q },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function useCreateWithholdingTaxReceipt(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateWithholdingTaxReceiptInput) => {
      const { data, error } = await apiClient.post<
        { data: WithholdingTaxReceipt },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/withholding-tax-receipts`,
        body: { ...input } as Record<string, unknown>,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => invalidate(businessId),
  });
}

export function useUpdateWithholdingTaxReceipt(businessId: string) {
  return useMutation({
    mutationFn: async ({
      receiptId,
      ...body
    }: UpdateWithholdingTaxReceiptInput) => {
      const { data, error } = await apiClient.put<
        { data: WithholdingTaxReceipt },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/withholding-tax-receipts/${receiptId}`,
        body: { ...body } as Record<string, unknown>,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => invalidate(businessId),
  });
}

/** Duplikat bukti potong (date hari ini) — POST /:id/copy. Bisa ditolak 400. */
export function useCopyWithholdingTaxReceipt(businessId: string) {
  return useMutation({
    mutationFn: async (receiptId: string) => {
      const { data, error } = await apiClient.post<
        { data: WithholdingTaxReceipt },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/withholding-tax-receipts/${receiptId}/copy`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => invalidate(businessId),
  });
}

export function useDeleteWithholdingTaxReceipt(businessId: string) {
  return useMutation({
    mutationFn: async (receiptId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/withholding-tax-receipts/${receiptId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => invalidate(businessId),
  });
}
