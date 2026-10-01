import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";

/**
 * Skema modul Attachments.
 *
 * CATATAN: upload memakai `multipart/form-data`, jadi validasi FILE
 * (ukuran & mime_type) TIDAK bisa lewat Zod body biasa — itu ditangani di
 * level route sebelum file ditulis ke disk (lihat AttachmentRoutes.ts).
 * Zod di sini hanya mengurus query/params JSON biasa dan bentuk respons.
 */

/** Nama modul pemilik lampiran (penamaan sama dgn `source_module` jurnal). */
export const AttachmentEntityTypeSchema = z
  .string()
  .trim()
  .min(1, "entityType wajib diisi")
  .max(50, "entityType maksimal 50 karakter")
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "entityType hanya boleh huruf kecil, angka, dan garis bawah",
  );

export const AttachmentListQuerySchema = z.object({
  entityType: AttachmentEntityTypeSchema,
  entityId: z.string().uuid("entityId harus UUID yang valid"),
});

export const AttachmentIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid(),
});

export const AttachmentResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  originalFilename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  uploadedBy: z.string(),
  uploaderName: z.string().nullable(),
  createdAt: z.date(),
});
