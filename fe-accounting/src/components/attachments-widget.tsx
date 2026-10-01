import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  downloadAttachment,
  formatFileSize,
  type Attachment,
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
  validateAttachmentFile,
} from "@/hooks/use-attachments";
import { getApiErrorMessage } from "@/lib/errors";

/**
 * Widget "Lampiran" yang bisa dipasang di modul mana pun.
 *
 * Pemakaian: taruh di dalam dialog/halaman yang SUDAH punya id record,
 * mis. `<AttachmentsWidget businessId={businessId} entityType="customer"
 * entityId={customer.id} canWrite={canWrite} />`. Widget TIDAK menampilkan
 * apa pun kalau `entityId` kosong (record belum tersimpan).
 *
 * `entityType` memakai penamaan yang sama dengan `source_module` di jurnal
 * (mis. "customer", "expense_claim") supaya konsisten lintas modul.
 */
export function AttachmentsWidget({
  businessId,
  entityType,
  entityId,
  canWrite,
  title = "Lampiran",
}: {
  businessId: string;
  entityType: string;
  entityId: string | null | undefined;
  canWrite: boolean;
  title?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: attachments, isPending, isError, error: loadError } = useAttachments(
    businessId,
    entityType,
    entityId,
  );
  const upload = useUploadAttachment(businessId, entityType, entityId ?? "");
  const remove = useDeleteAttachment(businessId, entityType, entityId ?? "");

  // Record belum punya id (form create) -> tidak ada yang bisa dilampiri.
  if (!entityId) return null;

  async function handleFilePicked(file: File) {
    setError(null);
    setNotice(null);

    // Validasi cepat di frontend untuk UX; backend tetap memvalidasi ulang.
    const validationError = validateAttachmentFile(file);
    if (validationError) {
      setError(validationError);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const created = await upload.mutateAsync(file);
      setNotice(`File "${created.originalFilename}" berhasil diunggah.`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      // Reset input supaya file yang sama bisa dipilih ulang bila perlu.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownload(attachment: Attachment) {
    setError(null);
    setNotice(null);
    try {
      await downloadAttachment(businessId, attachment);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  async function handleDelete(attachment: Attachment) {
    if (
      !window.confirm(
        `Hapus lampiran "${attachment.originalFilename}"? File fisik di server tetap disimpan.`,
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await remove.mutateAsync(attachment.id);
      setNotice(`Lampiran "${attachment.originalFilename}" dihapus.`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  const count = attachments?.length ?? 0;

  return (
    <section className="flex flex-col gap-2 rounded-md border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          {title}
          {attachments ? ` (${count})` : ""}
        </h3>
        {canWrite && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              aria-label="Pilih file untuk diunggah"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFilePicked(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={upload.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {upload.isPending ? "Mengunggah..." : "Unggah File"}
            </Button>
          </>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Maksimal 10MB per file. Tipe yang diizinkan: PDF, JPG, JPEG, PNG, WEBP,
        DOC, DOCX, XLS, XLSX.
      </p>

      {notice && (
        <p role="status" className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">
          {notice}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {isPending ? (
        <p className="text-sm text-gray-500">Memuat lampiran...</p>
      ) : isError ? (
        <p role="alert" className="text-sm text-red-700">
          {getApiErrorMessage(loadError)}
        </p>
      ) : count === 0 ? (
        <p className="text-sm text-gray-500">Belum ada lampiran.</p>
      ) : (
        <ul className="divide-y">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">
                  {attachment.originalFilename}
                </p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(attachment.sizeBytes)}
                  {attachment.uploaderName ? ` · ${attachment.uploaderName}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDownload(attachment)}
                >
                  Unduh
                </Button>
                {canWrite && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => void handleDelete(attachment)}
                  >
                    Hapus
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
