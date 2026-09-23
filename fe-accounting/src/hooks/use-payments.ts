import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

export interface PaymentLineInput {
  accountId: string;
  purchaseInvoiceId?: string | null;
  description?: string | null;
  amount: number;
}

export interface PaymentLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  purchaseInvoiceId: string | null;
  description: string | null;
  amount: number;
  sortOrder: number;
}

export interface Payment {
  id: string;
  businessId: string;
  date: string;
  reference: string | null;
  bankAccountId: string;
  bankAccountName: string;
  contactId: string;
  contactName: string;
  description: string | null;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentDetail extends Payment {
  lines: PaymentLine[];
}

export interface PaymentFilters {
  q?: string;
}

export interface CreatePaymentInput {
  date?: string;
  reference?: string;
  bankAccountId: string;
  contactId: string;
  description?: string | null;
  lines: PaymentLineInput[];
}

export interface UpdatePaymentInput {
  paymentId: string;
  date?: string;
  reference?: string | null;
  bankAccountId?: string;
  contactId?: string;
  description?: string | null;
  lines?: PaymentLineInput[];
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function paymentsQueryKey(
  businessId: string,
  page: number,
  filters: PaymentFilters,
) {
  return ["payments", businessId, page, filters] as const;
}

export function usePayments(
  businessId: string,
  page: number,
  filters: PaymentFilters = {},
  pageSize = 20,
) {
  return useQuery({
    queryKey: paymentsQueryKey(businessId, page, filters),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: Payment[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/payments`,
        query: {
          page,
          pageSize,
          q: filters.q,
        },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

export function usePayment(
  businessId: string,
  paymentId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["payment", businessId, paymentId],
    queryFn: async () => {
      if (!paymentId) return null;
      const { data, error } = await apiClient.get<
        { data: PaymentDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/payments/${paymentId}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(paymentId),
  });
}

export function useCreatePayment(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreatePaymentInput) => {
      const date = input.date?.trim() || getTodayDateString();
      const { data, error } = await apiClient.post<
        { data: PaymentDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/payments`,
        body: {
          ...input,
          date,
        },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payments", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["purchase-invoices", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["suppliers", businessId] });
    },
  });
}

export function useUpdatePayment(businessId: string) {
  return useMutation({
    mutationFn: async ({ paymentId, ...body }: UpdatePaymentInput) => {
      const payload: Record<string, unknown> = { ...body };
      if (body.date !== undefined) {
        payload.date = body.date.trim() || getTodayDateString();
      }

      const { data, error } = await apiClient.put<
        { data: PaymentDetail },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/payments/${paymentId}`,
        body: payload,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["payments", businessId] });
      void queryClient.invalidateQueries({
        queryKey: ["payment", businessId, variables.paymentId],
      });
      void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["purchase-invoices", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["suppliers", businessId] });
    },
  });
}

export function useDeletePayment(businessId: string) {
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/payments/${paymentId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payments", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["bank-accounts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["purchase-invoices", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["suppliers", businessId] });
    },
  });
}
