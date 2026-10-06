import { formDataBodySerializer } from "@hey-api/client-fetch";
import { useMutation, useQuery } from "@tanstack/react-query";
import i18n from "@/i18n";
import { apiClient } from "@/integrations/setup";
import { ApiError, type ApiErrorBody } from "@/lib/errors";
import { queryClient } from "@/lib/query-client";

/**
 * Hook modul Attachments (lampiran file generik).
 *
 * Dua hal yang BEDA dari hook modul lain:
 * 1. Upload memakai `multipart/form-data`, bukan JSON. Client kita default-nya
 *    mengirim `Content-Type: application/json`, jadi header itu HARUS dibuang
 *    (dikirim `null`) supaya browser menulis sendiri boundary multipart-nya.
 * 2. Download memakai `parseAs: "blob"` — responsnya biner, bukan JSON.
 *
 * Endpoint download tetap WAJIB terautentikasi (header Authorization), jadi
 * file diambil lewat fetch ber-header lalu disimpan sebagai Blob — token
 * SENGAJA tidak pernah ditaruh di query string supaya tidak bocor ke
 * riwayat browser/log.
 */

export interface Attachment {
  id: string;
  businessId: string;
  entityType: string;
  entityId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploaderName: string | null;
  createdAt: string;
}

/** Batas ukuran (samakan dengan backend) — 10MB. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Ekstensi yang diizinkan (samakan dengan whitelist backend). */
export const ATTACHMENT_ALLOWED_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
];

function attachmentsQueryKey(
  businessId: string,
  entityType: string,
  entityId: string,
) {
  return ["attachments", businessId, entityType, entityId] as const;
}

function invalidate(
  businessId: string,
  entityType: string,
  entityId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: attachmentsQueryKey(businessId, entityType, entityId),
  });
}

/** Validasi cepat di frontend (backend tetap memvalidasi ulang). */
export function validateAttachmentFile(file: File): string | null {
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return i18n.t("attachments.errorTooLarge", { size: formatFileSize(file.size) });
  }
  if (file.size === 0) {
    return i18n.t("attachments.errorEmpty");
  }
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (!ext || !ATTACHMENT_ALLOWED_EXTENSIONS.includes(ext)) {
    return i18n.t("attachments.errorType", { name: ext || file.name });
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Daftar lampiran aktif milik satu record. */
export function useAttachments(
  businessId: string,
  entityType: string,
  entityId: string | null | undefined,
) {
  return useQuery({
    queryKey: attachmentsQueryKey(businessId, entityType, entityId ?? ""),
    queryFn: async () => {
      const { data, error } = await apiClient.get<
        { data: Attachment[] },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/attachments`,
        query: { entityType, entityId },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    enabled: Boolean(entityId),
  });
}

export function useUploadAttachment(
  businessId: string,
  entityType: string,
  entityId: string,
) {
  return useMutation({
    mutationFn: async (file: File) => {
      const { data, error } = await apiClient.post<
        { data: Attachment },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/attachments`,
        body: { file, entityType, entityId },
        // `formDataBodySerializer` dari @hey-api/client-fetch berbentuk OBJEK
        // `{ bodySerializer }`, bukan fungsi -- jadi propertinya yang diambil.
        // Salah pakai (memberi objeknya langsung) memunculkan error runtime
        // "s.bodySerializer is not a function" dan upload selalu gagal.
        bodySerializer: formDataBodySerializer.bodySerializer,
        // Buang default `application/json` supaya boundary multipart ditulis
        // browser sendiri (nilai null = hapus header di client ini).
        headers: { "Content-Type": null },
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => invalidate(businessId, entityType, entityId),
  });
}

export function useDeleteAttachment(
  businessId: string,
  entityType: string,
  entityId: string,
) {
  return useMutation({
    mutationFn: async (attachmentId: string) => {
      const { data, error } = await apiClient.delete<
        { data: { message: string } },
        ApiErrorBody
      >({
        url: `/businesses/${businessId}/attachments/${attachmentId}`,
      });
      if (error) throw new ApiError(error);
      return data.data;
    },
    onSuccess: () => invalidate(businessId, entityType, entityId),
  });
}

/**
 * Ambil isi file sebagai Blob lalu picu unduhan browser.
 * Dipakai widget lewat tombol Download (bukan <a href> langsung) karena
 * endpoint-nya butuh header Authorization.
 */
export async function downloadAttachment(
  businessId: string,
  attachment: Pick<Attachment, "id" | "originalFilename">,
): Promise<void> {
  const { data, error } = await apiClient.get<Blob, ApiErrorBody>({
    url: `/businesses/${businessId}/attachments/${attachment.id}/download`,
    parseAs: "blob",
  });
  if (error) throw new ApiError(error);

  const url = URL.createObjectURL(data);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.originalFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Beri jeda sesaat sebelum dilepas supaya unduhan sempat dimulai.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
