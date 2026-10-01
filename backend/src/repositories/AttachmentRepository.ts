/**
 * AttachmentRepository — metadata lampiran file (generik untuk semua modul).
 *
 * PENTING: modul ini TIDAK menyentuh jurnal sama sekali (bukan transaksi
 * akuntansi). File fisik ditulis/dibaca di LEVEL ROUTE; repository ini
 * hanya mengurus baris `attachments` + batas tenant `business_id`.
 *
 * Setiap fungsi yang menerima `id` lampiran WAJIB memfilter `business_id`
 * juga — supaya lampiran milik bisnis lain tidak bisa disentuh walau ID-nya
 * diketahui (balas gagal, route memetakannya jadi 404 tanpa bocor info).
 */
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import db from "../db/index.js";
import { attachments, users } from "../db/schema.js";

export interface AttachmentRecord {
  id: string;
  businessId: string;
  entityType: string;
  entityId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploaderName: string | null;
  createdAt: Date;
}

export interface AttachmentCreateInput {
  /**
   * Id baris DIBUAT PEMANGGIL, bukan oleh DEFAULT Postgres — supaya nama file
   * fisik di disk (`<id>.<ext>`) benar-benar sama dengan id baris di database
   * (sesuai Dokumen spesifikasi bagian 4.1).
   */
  id: string;
  entityType: string;
  entityId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  uploadedBy: string;
}

/** Kolom yang dikembalikan ke route (termasuk nama pengunggah). */
const recordSelection = {
  id: attachments.id,
  businessId: attachments.businessId,
  entityType: attachments.entityType,
  entityId: attachments.entityId,
  originalFilename: attachments.originalFilename,
  mimeType: attachments.mimeType,
  sizeBytes: attachments.sizeBytes,
  storagePath: attachments.storagePath,
  uploadedBy: attachments.uploadedBy,
  uploaderName: users.name,
  createdAt: attachments.createdAt,
};

type Row = {
  id: string;
  businessId: string;
  entityType: string;
  entityId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  uploadedBy: string;
  uploaderName: string | null;
  createdAt: Date;
};

/** Bentuk baris yang dikembalikan query (termasuk storage_path internal). */
type RowWithStorage = Row & { storagePath: string };

/**
 * Bentuk internal saat route butuh path fisik file (download).
 * `storagePath` SENGAJA tidak dimasukkan ke `AttachmentRecord` supaya tidak
 * ikut terekspos ke respons API biasa.
 */
export interface AttachmentWithStorage extends AttachmentRecord {
  storagePath: string;
}

/** `sizeBytes` integer — Number() eksplisit dijaga walau driver bisa saja
 *  mengembalikan string untuk kolom numerik. */
function toRecord(row: Row): AttachmentRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    entityType: row.entityType,
    entityId: row.entityId,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: Number(row.sizeBytes),
    uploadedBy: row.uploadedBy,
    uploaderName: row.uploaderName,
    createdAt: row.createdAt,
  };
}

/**
 * List lampiran AKTIF milik satu record tertentu.
 *
 * `entity_type` + `entity_id` murni teks/uuid yang nunjuk ke baris di modul
 * lain — sengaja TIDAK ada FK, jadi tidak dicek keberadaan record-nya di
 * sini (pemanggil/route yang tahu modulnya).
 */
export async function listByEntity(
  businessId: string,
  entityType: string,
  entityId: string,
): Promise<AttachmentRecord[]> {
  const rows = await db
    .select(recordSelection)
    .from(attachments)
    .leftJoin(users, eq(attachments.uploadedBy, users.id))
    .where(
      and(
        eq(attachments.businessId, businessId),
        eq(attachments.entityType, entityType),
        eq(attachments.entityId, entityId),
        isNull(attachments.deletedAt),
      ),
    )
    .orderBy(desc(attachments.createdAt), asc(attachments.id));
  return rows.map(toRecord);
}

/** Simpan metadata (file fisik sudah ditulis oleh route SEBELUM ini). */
export async function create(
  businessId: string,
  input: AttachmentCreateInput,
): Promise<AttachmentRecord> {
  const [row] = await db
    .insert(attachments)
    .values({
      id: input.id,
      businessId,
      entityType: input.entityType,
      entityId: input.entityId,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storagePath: input.storagePath,
      uploadedBy: input.uploadedBy,
    })
    .returning({
      id: attachments.id,
      businessId: attachments.businessId,
      entityType: attachments.entityType,
      entityId: attachments.entityId,
      originalFilename: attachments.originalFilename,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      storagePath: attachments.storagePath,
      uploadedBy: attachments.uploadedBy,
      createdAt: attachments.createdAt,
    });

  // Baris yang baru dibuat belum punya nama pengunggah di SELECT returning,
  // jadi diambil ulang supaya bentuknya konsisten dgn list/detail.
  const named = await getById(businessId, row.id);
  if (!named) throw new Error("Gagal mengambil lampiran setelah create.");
  return named;
}

/**
 * Ambil satu lampiran AKTIF milik bisnis ini.
 * Mengembalikan `null` kalau tidak ada ATAU milik bisnis lain — pemanggil
 * membalas 404 untuk keduanya (tidak membocorkan keberadaan file bisnis lain).
 */
export async function getById(
  businessId: string,
  id: string,
): Promise<AttachmentRecord | null> {
  const [row] = await db
    .select(recordSelection)
    .from(attachments)
    .leftJoin(users, eq(attachments.uploadedBy, users.id))
    .where(
      and(
        eq(attachments.id, id),
        eq(attachments.businessId, businessId),
        isNull(attachments.deletedAt),
      ),
    )
    .limit(1);
  return row ? toRecord(row) : null;
}

/**
 * Varian `getById` yang sekalian mengembalikan `storagePath` — HANYA untuk
 * keperluan internal route download (jangan dipakai untuk respons API).
 */
export async function getByIdWithStorage(
  businessId: string,
  id: string,
): Promise<AttachmentWithStorage | null> {
  const [row] = await db
    .select(recordSelection)
    .from(attachments)
    .leftJoin(users, eq(attachments.uploadedBy, users.id))
    .where(
      and(
        eq(attachments.id, id),
        eq(attachments.businessId, businessId),
        isNull(attachments.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { ...toRecord(row as RowWithStorage), storagePath: (row as RowWithStorage).storagePath };
}

/**
 * Soft-delete: tandai `deleted_at`. File fisik SENGAJA dibiarkan di disk
 * (sesuai keputusan desain modul) supaya masih bisa dipulihkan.
 * Return false kalau tidak ada baris aktif milik bisnis ini yang cocok.
 */
export async function softDelete(
  businessId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .update(attachments)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(attachments.id, id),
        eq(attachments.businessId, businessId),
        isNull(attachments.deletedAt),
      ),
    )
    .returning({ id: attachments.id });
  return rows.length > 0;
}
