import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export type PurchaseInvoiceStatus = "Unpaid" | "Overdue" | "Paid";

export interface PurchaseInvoiceLineInput {
  accountId: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
}

export interface PurchaseInvoiceLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  sortOrder: number;
}

export interface PurchaseInvoice {
  id: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  reference: string | null;
  issueDate: string;
  dueDate: string | null;
  description: string | null;
  quoteNumber: string | null;
  orderNumber: string | null;
  invoiceAmount: number;
  balanceDue: number;
  status: PurchaseInvoiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseInvoiceDetail extends PurchaseInvoice {
  lines: PurchaseInvoiceLine[];
}

export interface PurchaseInvoiceFilters {
  q?: string;
  status?: PurchaseInvoiceStatus;
}

export interface CreatePurchaseInvoiceInput {
  supplierId: string;
  reference?: string;
  issueDate?: string;
  dueDate?: string;
  description?: string | null;
  quoteNumber?: string | null;
  orderNumber?: string | null;
  lines: PurchaseInvoiceLineInput[];
}

export interface UpdatePurchaseInvoiceInput {
  invoiceId: string;
  supplierId?: string;
  reference?: string | null;
  issueDate?: string;
  dueDate?: string | null;
  description?: string | null;
  quoteNumber?: string | null;
  orderNumber?: string | null;
  lines?: PurchaseInvoiceLineInput[];
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function purchaseInvoicesQueryKey(
  businessId: string,
  page: number,
  filters: PurchaseInvoiceFilters,
) {
  return ["purchase-invoices", businessId, page, filters] as const;
}

export function usePurchaseInvoices(
  businessId: string,
  page: number,
  filters: PurchaseInvoiceFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: purchaseInvoicesQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: PurchaseInvoice[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-invoices`,
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

export function usePurchaseInvoice(
  businessId: string,
  invoiceId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["purchase-invoice", businessId, invoiceId],
    queryFn: async () => {
      if (!invoiceId) return null;
      const { data, error } = await apiClient.get<
        { data: PurchaseInvoiceDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-invoices/${invoiceId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(invoiceId),
  });
}

export function useCreatePurchaseInvoice(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreatePurchaseInvoiceInput) => {
      const issueDate = input.issueDate?.trim() || getTodayDateString();
      const { data, error } = await apiClient.post<
        { data: PurchaseInvoiceDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-invoices`,
        body: {
          ...input,
          issueDate,
        },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchase-invoices", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["suppliers", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}

export function useUpdatePurchaseInvoice(businessId: string) {
  return useMutation({
    mutationFn: async ({ invoiceId, ...body }: UpdatePurchaseInvoiceInput) => {
      const payload: Record<string, unknown> = { ...body };
      if (body.issueDate !== undefined) {
        payload.issueDate = body.issueDate.trim() || getTodayDateString();
      }

      const { data, error } = await apiClient.put<
        { data: PurchaseInvoiceDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-invoices/${invoiceId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["purchase-invoices", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["purchase-invoice", businessId, variables.invoiceId],
      });
      void queryClient.invalidateQueries({ queryKey: ["suppliers", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}

export function useDeletePurchaseInvoice(businessId: string) {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/purchase-invoices/${invoiceId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchase-invoices", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["suppliers", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}
