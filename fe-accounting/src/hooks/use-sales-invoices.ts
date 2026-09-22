import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export type SalesInvoiceStatus = "Unpaid" | "Overdue" | "Paid";

export interface SalesInvoiceLineInput {
  accountId: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  taxRatePercent?: number;
}

export interface SalesInvoiceLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  taxRatePercent: number;
  taxAmount: number;
  lineTotal: number;
  sortOrder: number;
}

export interface SalesInvoice {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  reference: string | null;
  issueDate: string;
  dueDate: string | null;
  billingAddress: string | null;
  description: string | null;
  invoiceAmount: number;
  balanceDue: number;
  status: SalesInvoiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SalesInvoiceDetail extends SalesInvoice {
  lines: SalesInvoiceLine[];
}

export interface SalesInvoiceFilters {
  q?: string;
  status?: SalesInvoiceStatus;
}

export interface CreateSalesInvoiceInput {
  customerId: string;
  reference?: string;
  issueDate?: string;
  dueDate?: string;
  billingAddress?: string | null;
  description?: string | null;
  lines: SalesInvoiceLineInput[];
}

export interface UpdateSalesInvoiceInput {
  invoiceId: string;
  customerId?: string;
  reference?: string | null;
  issueDate?: string;
  dueDate?: string | null;
  billingAddress?: string | null;
  description?: string | null;
  lines?: SalesInvoiceLineInput[];
}

/** Mengambil tanggal hari ini dalam format YYYY-MM-DD (UTC). */
export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function salesInvoicesQueryKey(
  businessId: string,
  page: number,
  filters: SalesInvoiceFilters,
) {
  return ["sales-invoices", businessId, page, filters] as const;
}

/** GET /businesses/:businessId/sales-invoices — daftar faktur penjualan terpaginasi. */
export function useSalesInvoices(
  businessId: string,
  page: number,
  filters: SalesInvoiceFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: salesInvoicesQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: SalesInvoice[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-invoices`,
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

/** GET /businesses/:businessId/sales-invoices/:invoiceId — detail satu faktur dengan baris item. */
export function useSalesInvoice(
  businessId: string,
  invoiceId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["sales-invoice", businessId, invoiceId],
    queryFn: async () => {
      if (!invoiceId) return null;
      const { data, error } = await apiClient.get<
        { data: SalesInvoiceDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-invoices/${invoiceId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(invoiceId),
  });
}

/** POST /businesses/:businessId/sales-invoices — buat faktur dan langsung posting jurnal. */
export function useCreateSalesInvoice(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateSalesInvoiceInput) => {
      const issueDate = input.issueDate?.trim() || getTodayDateString();
      const { data, error } = await apiClient.post<
        { data: SalesInvoiceDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-invoices`,
        body: {
          ...input,
          issueDate,
        },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales-invoices", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["customers", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}

/** PUT /businesses/:businessId/sales-invoices/:invoiceId — ubah faktur dan susun ulang jurnal. */
export function useUpdateSalesInvoice(businessId: string) {
  return useMutation({
    mutationFn: async ({ invoiceId, ...body }: UpdateSalesInvoiceInput) => {
      const payload: Record<string, unknown> = { ...body };
      if (body.issueDate !== undefined) {
        payload.issueDate = body.issueDate.trim() || getTodayDateString();
      }

      const { data, error } = await apiClient.put<
        { data: SalesInvoiceDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-invoices/${invoiceId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["sales-invoices", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["sales-invoice", businessId, variables.invoiceId],
      });
      void queryClient.invalidateQueries({ queryKey: ["customers", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}

/** DELETE /businesses/:businessId/sales-invoices/:invoiceId — soft-delete faktur dan jurnal terkait. */
export function useDeleteSalesInvoice(businessId: string) {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/sales-invoices/${invoiceId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales-invoices", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["customers", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
    },
  });
}
