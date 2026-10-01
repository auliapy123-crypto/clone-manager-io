# Dokumentasi Modul: Attachments (Lampiran File)

> Status: Draft — siap diimplementasikan
> Sumber: Roadmap Fase 4, "Attachments — lampiran file di record apa
> pun" (1 kalimat doang di dokumen asli, disusun detailnya dari sini
> karena belum ada spesifikasi rinci — ini KEPUTUSAN DESAIN kita
> sendiri, bukan hasil tebakan dari dokumen yang hilang)

## 1. Tujuan Modul

Memungkinkan user upload file (PDF, gambar, dokumen) dan nempelin ke
record APA PUN di sistem (Sales Invoice, Purchase Invoice, Customer,
Expense Claim, dst) — misal foto struk buat Expense Claim, scan bukti
transfer buat Payment, PDF kontrak buat Customer.

## 2. Keputusan Desain Penting

1. **Penyimpanan file: DISK LOKAL** (folder di server backend), BUKAN
   cloud storage (S3/dst). Project ini belum deploy production dan
   belum pakai Docker, jadi disk lokal paling simpel buat tahap ini.
   Folder penyimpanan (`backend/uploads/`) WAJIB masuk `.gitignore`
   (jangan sampai file upload ke-commit ke Git).
2. **1 tabel generik buat SEMUA modul** (polymorphic/generic
   attachment), BUKAN tabel lampiran terpisah per modul. Pola:
   `entity_type` (teks, nama modul — reuse penamaan yang udah
   dipakai `source_module` di `journal_entries`, misal
   `'sales_invoice'`, `'customer'`, `'expense_claim'`) + `entity_id`
   (uuid, nunjuk ke baris spesifik di modul itu).
3. **Nama file DI DISK dirandom (UUID)**, nama ASLI file (yang user
   lihat) disimpan terpisah di database — biar nggak bisa ditebak
   orang lain dan nggak tabrakan antar file.
4. **Validasi keamanan WAJIB**: validasi `business_id` di SETIAP akses
   (upload, lihat, download, hapus) — user dari bisnis A nggak boleh
   bisa akses file bisnis B sama sekali, walau tau ID-nya.
5. **Batasan ukuran & tipe file**: maksimal 10MB per file, tipe yang
   diizinkan: PDF, gambar (jpg/png/webp), dokumen Office (doc/docx/xls/
   xlsx). TOLAK tipe file executable (exe/sh/bat/dst).
6. **Rollout bertahap**: ini fitur yang nempel ke SEMUA modul (~32
   modul!), jadi dikerjain 2 tahap kayak Pagination/Combobox kemarin —
   Tahap 1: tabel+API+komponen frontend+2-3 modul percobaan. Tahap 2:
   sebar ke sisanya.
7. **Dependency BARU**: backend butuh library buat handle upload file
   multipart (`@fastify/multipart`, BELUM pernah dipakai di project
   ini) — WAJIB diinstall dulu (`pnpm add @fastify/multipart` di
   folder `backend/`).

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Upload, lihat, download, hapus lampiran |
| Viewer | Lihat & download doang, TIDAK bisa upload/hapus |

## 4. Struktur Data

### 4.1 Tabel `attachments` (generik, 1 tabel buat semua modul)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key, DIPAKAI JUGA sebagai nama file fisik di disk |
| business_id | uuid | Ya | Tenant scope — WAJIB divalidasi di setiap akses |
| entity_type | varchar(50) | Ya | Nama modul (misal `'sales_invoice'`, `'customer'`) |
| entity_id | uuid | Ya | ID record yang dilampirin |
| original_filename | varchar(255) | Ya | Nama file asli (yang user lihat/download) |
| mime_type | varchar(100) | Ya | Tipe file (`application/pdf`, `image/png`, dst) |
| size_bytes | integer | Ya | Ukuran file dalam bytes |
| storage_path | varchar(500) | Ya | Path relatif di disk (misal `<business_id>/<attachment_id>.pdf`) |
| uploaded_by | uuid | Ya | FK `users`, siapa yang upload |
| deleted_at | timestamp | Tidak | Soft-delete (file fisik TETAP ada di disk saat soft-delete, biar bisa dipulihkan — baru dihapus fisik kalau ada proses cleanup terpisah nanti, DI LUAR cakupan modul ini) |
| created_at | timestamp | — | Standar |

## 5. Aturan Bisnis

1. **Upload**: validasi ukuran (≤10MB) dan tipe file (whitelist) SEBELUM
   nulis ke disk. Nama file fisik = `<attachment_id>.<ekstensi_asli>`.
   Folder disk terstruktur per bisnis:
   `backend/uploads/<business_id>/<attachment_id>.<ext>`.
2. **Download**: validasi `business_id` cocok sama bisnis yang lagi
   diakses user (lewat `requireBusinessScopeParam` yang udah ada),
   kalau nggak cocok balas 403/404 (JANGAN kasih tau file itu ada tapi
   bukan milik bisnis ini — demi keamanan, balas 404 aja biar nggak
   bocor informasi).
3. **Delete**: soft-delete record di database. File fisik di disk
   TETAP dibiarkan (nggak langsung dihapus permanen).
4. **RBAC**: upload/delete perlu role `admin` atau `accountant`.
   Viewer cuma bisa lihat+download.

## 6. Komponen Frontend (reusable, dipasang di halaman detail/edit modul lain)

Widget "Lampiran" yang bisa ditaruh di halaman modul mana pun (dialog
edit, misal), terima props `entityType` + `entityId`:
- Daftar file yang udah ke-attach (nama file, ukuran, tombol Download,
  tombol Hapus — Hapus cuma kalau role admin/accountant).
- Tombol/area "Upload File" (drag-drop atau klik pilih file biasa).
- Validasi ukuran/tipe file di FRONTEND juga (buat UX cepat), TAPI
  backend tetap validasi ulang (jangan percaya validasi frontend doang).

## 7. Endpoint API

Base path: `/businesses/:businessId/attachments`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/attachments?entityType=X&entityId=Y` | listAttachments | List lampiran milik 1 record tertentu |
| POST | `/businesses/:businessId/attachments` | uploadAttachment | Upload file baru (multipart/form-data, field: file, entityType, entityId) |
| GET | `/businesses/:businessId/attachments/:id/download` | downloadAttachment | Stream file-nya (Content-Disposition attachment, nama file asli) |
| DELETE | `/businesses/:businessId/attachments/:id` | deleteAttachment | Soft-delete record (file fisik tetap ada) |

GET (list+download) boleh semua role. POST/DELETE perlu `admin`/
`accountant`.

## 8. Rencana Implementasi Bertahap

### Tahap 1 (sesi ini)
1. Install `@fastify/multipart` di backend.
2. Buat tabel `attachments` + folder `backend/uploads/` (gitignored).
3. Backend lengkap (schema, repository, routes, 4 endpoint).
4. Frontend: komponen widget "Lampiran" reusable.
5. Pasang widget itu di 2-3 modul percobaan (misal Expense Claims —
   cocok banget buat lampirin foto struk, dan Customers — buat
   lampirin dokumen kontrak).
6. Verifikasi: upload beneran 1 file percobaan, download, hapus,
   pastikan file fisik beneran ada/kehapus di disk, pastikan user
   bisnis lain nggak bisa akses (kalau ada bisnis lain buat dites).

### Tahap 2 (sesi berikutnya, setelah Tahap 1 dikonfirmasi oke)
Sebar widget itu ke sisa ~29 modul lainnya.