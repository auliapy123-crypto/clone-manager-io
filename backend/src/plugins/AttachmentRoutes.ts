/**
 * Attachments — lampiran file generik untuk record apa pun.
 *
 * BUKAN modul akuntansi: tidak ada jurnal. Yang disimpan cuma metadata di
 * tabel `attachments` + file fisik di disk (`uploads/<businessId>/`).
 *
 * Alur upload (urutan PENTING — validasi dulu, tulis disk belakangan):
 *   1. Cek ukuran & mime_type dari metadata part SEBELUM menulis apa pun.
 *   2. Generate id lampiran + nama file fisik `<id>.<ext>`.
 *   3. Stream file ke disk, hitung byte sebenarnya sambil jalan.
 *   4. Insert metadata. Kalau insert gagal, file yang sudah ditulis dibuang
 *      supaya tidak ada file yatim di disk.
 *
 * Download SELALU tervalidasi tenant lebih dulu (404 kalau bukan milik
 * bisnis ini), dan TIDAK pernah menaruh token di URL — otentikasi tetap
 * lewat header Authorization seperti endpoint lain.
 */
import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError } from "../libs/reply.js";
import {
  create as createAttachment,
  getById as getAttachmentById,
  getByIdWithStorage,
  listByEntity,
  softDelete as softDeleteAttachment,
} from "../repositories/AttachmentRepository.js";
import { BusinessIdParamsSchema } from "../schemas/Business.js";
import {
  AttachmentIdParamsSchema,
  AttachmentListQuerySchema,
  AttachmentResponseSchema,
} from "../schemas/Attachment.js";
import {
  BadRequest,
  createDataResponseSchema,
  Forbidden,
  InternalServerError,
  MessageResponseSchema,
  NotFound,
  Unauthorized,
} from "../schemas/globals.js";
import { z } from "zod";

const TAG = "Attachments";

/** Batas ukuran file lampiran: 10MB. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Tipe file yang diizinkan (whitelist, bukan blacklist) — PDF, gambar,
 * dan dokumen Office. Executable (.exe/.sh/.bat/dst) otomatis tertolak
 * karena tidak ada di daftar ini.
 */
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/** Ekstensi yang diizinkan — dipakai HANYA untuk nama file fisik di disk. */
const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
]);

/**
 * Ekstensi executable yang SELALU ditolak walau mime_type-nya dipalsukan
 * jadi tipe yang diizinkan.
 */
const FORBIDDEN_EXTENSIONS = new Set([
  ".exe",
  ".sh",
  ".bat",
  ".cmd",
  ".com",
  ".msi",
  ".scr",
  ".ps1",
  ".jar",
  ".dll",
]);

/** Folder penyimpanan: backend/uploads (relatif terhadap cwd proses). */
function uploadsRoot(): string {
  return resolve(process.cwd(), "uploads");
}

/** Folder per bisnis: uploads/<businessId>. */
async function ensureBusinessDir(businessId: string): Promise<string> {
  const dir = join(uploadsRoot(), businessId);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Ambil ekstensi nama file asli, dipakai buat nama fisik. */
function extensionOf(filename: string): string {
  return extname(filename).toLowerCase();
}

const UploadResponseSchema = createDataResponseSchema(AttachmentResponseSchema);
const ListResponseSchema = z.object({ data: z.array(AttachmentResponseSchema) });

export async function attachmentRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  // ===================================================================
  // GET /businesses/:businessId/attachments?entityType=X&entityId=Y
  // ===================================================================
  app.get(
    "/businesses/:businessId/attachments",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.ATTACHMENT_READ),
      ],
      schema: {
        tags: [TAG],
        operationId: "listAttachments",
        summary: "Daftar lampiran aktif milik satu record",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: AttachmentListQuerySchema,
        response: {
          200: ListResponseSchema,
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;
      const { entityType, entityId } = request.query;

      const data = await listByEntity(businessId, entityType, entityId);
      return sendData(reply, data);
    },
  );

  // ===================================================================
  // POST /businesses/:businessId/attachments  (multipart/form-data)
  //
  // Field: file (binary), entityType (text), entityId (text uuid)
  // ===================================================================
  app.post(
    "/businesses/:businessId/attachments",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.ATTACHMENT_WRITE),
      ],
      schema: {
        tags: [TAG],
        operationId: "uploadAttachment",
        summary: "Unggah lampiran baru (multipart/form-data)",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        consumes: ["multipart/form-data"],
        response: {
          201: UploadResponseSchema,
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          413: BadRequest,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;

      if (!request.isMultipart()) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "Permintaan harus multipart/form-data.",
        );
      }

      // Hasil yang dikumpulkan sambil stream dikonsumsi di dalam loop.
      // PENTING: part.file WAJIB dikonsumsi di dalam iterasi yang sama --
      // kalau disimpan dulu untuk ditulis setelah loop, stream-nya sudah
      // di-abort parser dan pipeline() akan menggantung tanpa akhir.
      let savedFile: {
        attachmentId: string;
        absolutePath: string;
        writtenBytes: number;
      } | null = null;
      let fileMeta: {
        originalFilename: string;
        mimeType: string;
        ext: string;
      } | null = null;
      let fileError: { status: number; message: string } | null = null;
      let fileCount = 0;
      let entityType: string | null = null;
      let entityId: string | null = null;

      // Field non-file boleh datang sebelum ATAU sesudah file (urutan
      // ditentukan klien), jadi semua divalidasi dari metadata part lebih
      // dulu, dan penulisan disk dilakukan sambil mengalirkan stream.
      try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          fileCount += 1;

          if (part.fieldname !== "file" || fileCount > 1) {
            // Field file asing / file kedua: buang stream-nya supaya
            // koneksi tidak menggantung.
            part.file.resume();
            continue;
          }

          const originalFilename = (part.filename ?? "").trim();
          const mimeType = (part.mimetype ?? "").trim().toLowerCase();
          const ext = extensionOf(originalFilename);

          fileMeta = { originalFilename, mimeType, ext };

          // --- Validasi metadata SEBELUM satu byte pun ditulis -----------
          if (!originalFilename) {
            fileError = {
              status: 400,
              message: "Nama file tidak terbaca dari permintaan.",
            };
            part.file.resume();
            continue;
          }

          if (FORBIDDEN_EXTENSIONS.has(ext) || !ALLOWED_EXTENSIONS.has(ext)) {
            fileError = {
              status: 400,
              message:
                `Tipe file "${ext || originalFilename}" tidak diizinkan. ` +
                "Yang diizinkan: PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX, XLS, XLSX.",
            };
            part.file.resume();
            continue;
          }

          if (!ALLOWED_MIME_TYPES.has(mimeType)) {
            fileError = {
              status: 400,
              message:
                `Tipe file "${mimeType || "tidak dikenal"}" tidak diizinkan. ` +
                "Yang diizinkan: PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX, XLS, XLSX.",
            };
            part.file.resume();
            continue;
          }

          const attachmentId = randomUUID();
          const dir = await ensureBusinessDir(businessId);
          const absolutePath = join(dir, `${attachmentId}${ext}`);

          // Tulis ke disk sambil menghitung byte sebenarnya (batas ukuran
          // ditegakkan dari jumlah byte yang benar-benar diterima).
          let writtenBytes = 0;
          const counter = new Transform({
            transform(chunk, _encoding, callback) {
              writtenBytes += chunk.length;
              if (writtenBytes > MAX_FILE_BYTES) {
                callback(new Error("FILE_TOO_LARGE"));
                return;
              }
              callback(null, chunk);
            },
          });

          try {
            await pipeline(
              part.file,
              counter,
              createWriteStream(absolutePath),
            );
          } catch (error) {
            // Buang file parsial -- jangan tinggalkan sampah di disk.
            await unlink(absolutePath).catch(() => undefined);

            const message = error instanceof Error ? error.message : "";
            const code =
              error instanceof Error && "code" in error
                ? (error as { code?: string }).code
                : undefined;

            if (
              message === "FILE_TOO_LARGE" ||
              message === "Request file too large" ||
              code === "FST_REQ_FILE_TOO_LARGE"
            ) {
              fileError = {
                status: 400,
                message: "Ukuran file melebihi batas maksimal 10MB.",
              };
            } else {
              throw error;
            }
          }

          if (writtenBytes === 0) {
            await unlink(absolutePath).catch(() => undefined);
            fileError = {
              status: 400,
              message: "File yang dikirim kosong (0 byte).",
            };
          } else if (!fileError) {
            savedFile = { attachmentId, absolutePath, writtenBytes };
          }
        } else if (part.fieldname === "entityType") {
          entityType = String(part.value).trim();
        } else if (part.fieldname === "entityId") {
          entityId = String(part.value).trim();
        }
      }
      } catch (error) {
        // Batas keras parser multipart: Fastify melempar error ini saat file
        // melewati `limits.fileSize`, SEBELUM validator kita sempat bicara.
        // Tangkap di sini supaya klien menerima pesan yang jelas (400),
        // bukan 413 mentah dari framework.
        if (savedFile) {
          await unlink(savedFile.absolutePath).catch(() => undefined);
        }
        const code =
          error instanceof Error && "code" in error
            ? (error as { code?: string }).code
            : undefined;
        const message = error instanceof Error ? error.message : "";
        if (
          code === "FST_REQ_FILE_TOO_LARGE" ||
          message === "Request file too large"
        ) {
          return sendError(
            reply,
            400,
            ErrorCode.BAD_REQUEST,
            "Ukuran file melebihi batas maksimal 10MB.",
          );
        }
        throw error;
      }

      // --- Validasi field non-file (setelah semua part terbaca) ---------
      if (!entityType || entityType.length > 50) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "entityType wajib diisi (maksimal 50 karakter).",
        );
      }

      if (
        !entityId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          entityId,
        )
      ) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "entityId wajib diisi dan harus UUID yang valid.",
        );
      }

      if (fileError) {
        return sendError(
          reply,
          fileError.status,
          ErrorCode.BAD_REQUEST,
          fileError.message,
        );
      }

      if (fileCount > 1) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "Hanya boleh mengunggah satu file per permintaan.",
        );
      }

      if (!savedFile || !fileMeta) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "File belum dipilih (field 'file' wajib diisi).",
        );
      }

      const storagePath = `${businessId}/${savedFile.absolutePath.split(/[\\/]/).pop()}`;

      // --- Simpan metadata; kalau gagal, file fisik dibuang --------------
      try {
        const created = await createAttachment(businessId, {
          // Id yang SAMA dengan nama file di disk dipakai untuk baris DB
          // (lihat komentar di AttachmentRepository.create).
          id: savedFile.attachmentId,
          entityType,
          entityId,
          originalFilename: fileMeta.originalFilename,
          mimeType: fileMeta.mimeType,
          sizeBytes: savedFile.writtenBytes,
          storagePath,
          uploadedBy: request.user!.id,
        });

        request.audit = {
          action: "CREATE",
          entityType: "attachments",
          entityId: created.id,
          newValues: {
            entityType: created.entityType,
            entityId: created.entityId,
            originalFilename: created.originalFilename,
            sizeBytes: created.sizeBytes,
          },
        };

        return sendData(reply, created, 201);
      } catch (error) {
        await unlink(savedFile.absolutePath).catch(() => undefined);
        throw error;
      }
    },
  );

  // ===================================================================
  // GET /businesses/:businessId/attachments/:id/download
  // ===================================================================
  app.get(
    "/businesses/:businessId/attachments/:id/download",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.ATTACHMENT_READ),
      ],
      schema: {
        tags: [TAG],
        operationId: "downloadAttachment",
        summary: "Unduh isi file lampiran (Content-Disposition attachment)",
        security: [{ bearerAuth: [] }],
        params: AttachmentIdParamsSchema,
        response: {
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, id } = request.params;

      // Validasi tenant DULU: kalau bukan milik bisnis ini, jawab 404 --
      // status yang sama seperti file yang memang tidak ada, supaya tidak
      // membocorkan bahwa file itu eksis di bisnis lain.
      const attachment = await getByIdWithStorage(businessId, id);
      if (!attachment) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Lampiran tidak ditemukan.");
      }

      const absolutePath = join(uploadsRoot(), attachment.storagePath);

      // Sabuk pengaman tambahan: pastikan path hasil join tidak keluar dari
      // folder uploads (storage_path berasal dari DB, bukan input user, tapi
      // murah untuk dipastikan).
      const rootWithSep = uploadsRoot() + sep;
      if (!resolve(absolutePath).startsWith(rootWithSep)) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Lampiran tidak ditemukan.");
      }

      try {
        await stat(absolutePath);
      } catch {
        // Metadata ada tapi file fisiknya hilang dari disk.
        request.log.error(
          { attachmentId: id, storagePath: attachment.storagePath },
          "Metadata lampiran ada tapi file fisik tidak ditemukan",
        );
        return sendError(
          reply,
          404,
          ErrorCode.NOT_FOUND,
          "File lampiran tidak ditemukan di penyimpanan server.",
        );
      }

      // RFC 5987: filename* dipakai supaya nama file non-ASCII tetap utuh;
      // filename= versi ASCII jadi fallback klien lama.
      const asciiFallback =
        attachment.originalFilename.replace(/[^\x20-\x7e]/g, "_") || "lampiran";
      const encoded = encodeURIComponent(attachment.originalFilename);

      reply
        .header("Content-Type", attachment.mimeType || "application/octet-stream")
        .header(
          "Content-Disposition",
          `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`,
        )
        .header("Content-Length", String(attachment.sizeBytes))
        .header("X-Content-Type-Options", "nosniff");

      // Respons biner berupa stream, sengaja di luar skema respons Zod
      // (ZodTypeProvider mengetikkan send() dari peta `response`), jadi
      // perlu cast eksplisit di sini.
      return reply.send(createReadStream(absolutePath) as unknown as never);
    },
  );

  // ===================================================================
  // DELETE /businesses/:businessId/attachments/:id
  // ===================================================================
  app.delete(
    "/businesses/:businessId/attachments/:id",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.ATTACHMENT_DELETE),
      ],
      schema: {
        tags: [TAG],
        operationId: "deleteAttachment",
        summary: "Soft-delete lampiran (file fisik tetap di disk)",
        security: [{ bearerAuth: [] }],
        params: AttachmentIdParamsSchema,
        response: {
          200: MessageResponseSchema,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, id } = request.params;

      const existing = await getAttachmentById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Lampiran tidak ditemukan.");
      }

      const deleted = await softDeleteAttachment(businessId, id);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Lampiran tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "attachments",
        entityId: id,
        oldValues: {
          entityType: existing.entityType,
          entityId: existing.entityId,
          originalFilename: existing.originalFilename,
        },
      };

      return sendData(reply, { message: "Lampiran berhasil dihapus." });
    },
  );
}

export default attachmentRoutesPlugin;
