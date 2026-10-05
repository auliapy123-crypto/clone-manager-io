import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/integrations/setup";
import type { PaginationInfo } from "@/hooks/use-members";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

/** Entity yang terdaftar di Fase 1 (sinkron dengan backend CUSTOM_FIELD_ENTITY_TYPES). */
export const CUSTOM_FIELD_ENTITY_TYPES = ["customer", "sales_invoice"] as const;
export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Teks",
  number: "Angka",
  date: "Tanggal",
  boolean: "Ya/Tidak",
  select: "Pilihan",
};

type CustomFieldType = "text" | "number" | "date" | "boolean" | "select";

export interface CustomFieldDefinition {
  id: string;
  businessId: string;
  entityType: string;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  isRequired: boolean;
  options: string[] | null;
  sortOrder: number;
  isActive: boolean;
  valuesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomFieldValue {
  id: string;
  definitionId: string;
  entityType: string;
  recordId: string;
  value: string | number | boolean | null;
  definition: {
    key: string;
    label: string;
    fieldType: CustomFieldType;
    isRequired: boolean;
    isActive: boolean;
    options: string[] | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CustomFieldDefinitionFilters {
  q?: string;
  entityType?: CustomFieldEntityType;
  isActive?: boolean;
}

export interface CreateCustomFieldDefinitionInput {
  entityType: CustomFieldEntityType;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  isRequired?: boolean;
  options?: string[] | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateCustomFieldDefinitionInput {
  id: string;
  label?: string;
  fieldType?: CustomFieldType;
  isRequired?: boolean;
  options?: string[] | null;
  sortOrder?: number;
  isActive?: boolean;
}

/** Satu item value untuk upsert — null berarti hapus value. */
export interface CustomFieldValueUpsertItem {
  definitionId: string;
  value: string | number | boolean | null;
}

function definitionsUrl(businessId: string) {
  return `/businesses/${businessId}/custom-field-definitions`;
}

/** GET /businesses/:businessId/custom-field-definitions — daftar terpaginasi. */
export function useCustomFieldDefinitions(
  businessId: string,
  page: number,
  filters: CustomFieldDefinitionFilters = {},
  pageSize = 10,
) {
  return useQuery({
    queryKey: ["custom-field-definitions", businessId, page, filters],
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: CustomFieldDefinition[]; pagination: PaginationInfo },
        ApiErrorBody
      >({
        url: definitionsUrl(businessId),
        query: {
          page,
          pageSize,
          q: filters.q,
          entityType: filters.entityType,
          isActive: filters.isActive,
        },
      });

      if (error) throw new ApiError(error);
      return data;
    },
  });
}

/** GET /businesses/:businessId/custom-field-definitions/:id — detail + valuesCount. */
export function useCustomFieldDefinition(
  businessId: string,
  id: string | null | undefined,
) {
  return useQuery({
    queryKey: ["custom-field-definition", businessId, id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await apiClient.get<
        { data: CustomFieldDefinition },
        ApiErrorBody
      >({
        url: `${definitionsUrl(businessId)}/${id}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(id),
  });
}

/** POST /businesses/:businessId/custom-field-definitions — buat definisi. */
export function useCreateCustomFieldDefinition(businessId: string) {
  return useMutation({
    mutationFn: async (input: CreateCustomFieldDefinitionInput) => {
      const { data, error } = await apiClient.post<
        { data: CustomFieldDefinition },
        ApiErrorBody
      >({
        url: definitionsUrl(businessId),
        body: { ...input },
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["custom-field-definitions", businessId],
      });
    },
  });
}

/** PUT /businesses/:businessId/custom-field-definitions/:id — perbarui definisi. */
export function useUpdateCustomFieldDefinition(businessId: string) {
  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateCustomFieldDefinitionInput) => {
      const { data, error } = await apiClient.put<
        { data: CustomFieldDefinition },
        ApiErrorBody
      >({
        url: `${definitionsUrl(businessId)}/${id}`,
        body: { ...body },
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["custom-field-definitions", businessId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["custom-field-definition", businessId, variables.id],
      });
    },
  });
}

/** DELETE /businesses/:businessId/custom-field-definitions/:id — soft-delete. */
export function useDeleteCustomFieldDefinition(businessId: string) {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `${definitionsUrl(businessId)}/${id}`,
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["custom-field-definitions", businessId],
      });
    },
  });
}

/**
 * Definisi AKTIF untuk satu entity (urut sort_order) — dipakai section
 * dinamis di form Customer & Sales Invoice.
 */
export function useActiveCustomFieldDefinitions(
  businessId: string,
  entityType: CustomFieldEntityType,
) {
  const { data, isPending } = useCustomFieldDefinitions(
    businessId,
    1,
    { entityType, isActive: true },
    100,
  );
  return { definitions: data?.data ?? [], isPending };
}

/** GET /businesses/:businessId/custom-field-values?entityType=&recordId= — values 1 record. */
export function useCustomFieldValues(
  businessId: string,
  entityType: CustomFieldEntityType,
  recordId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["custom-field-values", businessId, entityType, recordId],
    queryFn: async () => {
      if (!recordId) return [];
      const { data, error } = await apiClient.get<
        { data: CustomFieldValue[] },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/custom-field-values`,
        query: { entityType, recordId },
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(recordId),
  });
}

/** PUT /businesses/:businessId/custom-field-values — upsert batch + validasi required. */
export function useUpsertCustomFieldValues(businessId: string) {
  return useMutation({
    mutationFn: async (input: {
      entityType: CustomFieldEntityType;
      recordId: string;
      values: CustomFieldValueUpsertItem[];
    }) => {
      const { data, error } = await apiClient.put<
        { data: CustomFieldValue[] },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/custom-field-values`,
        body: { ...input },
      });

      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [
          "custom-field-values",
          businessId,
          variables.entityType,
          variables.recordId,
        ],
      });
    },
  });
}
