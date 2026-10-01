# Dokumentasi Modul: History (Jejak Audit)

> Status: Draft — siap diimplementasikan
> Sumber: Roadmap Fase 4, "History — jejak audit di level bisnis (siapa
> ubah apa, kapan)" (1 kalimat doang di dokumen asli, disusun detailnya
> dari sini — KEPUTUSAN DESAIN kita sendiri, tapi berdasarkan tabel
> `audit_logs` yang SUDAH ADA dan SUDAH DIPAKAI sejak modul pertama)

## 1. Tujuan Modul

Nampilin riwayat perubahan data ke user — siapa yang bikin/ubah/hapus
record apa, kapan. **BUKAN fitur baru dari nol** — tabel `audit_logs`
dan logic penulisannya (`AuditLogRepository`, `request.audit = {...}`
di tiap routes) **SUDAH ADA dan SUDAH JALAN** sejak modul pertama
(Customers) sampai modul terakhir (Attachments). Yang belum ada cuma
**tampilan buat LIHAT riwayat itu**.

## 2. Keputusan Desain

1. **TIDAK ADA tabel baru, TIDAK ADA logic penulisan baru** — modul
   ini MURNI read-only di atas data yang udah ada.
2. **Struktur tabel `audit_logs`** (cek dulu struktur ASLI di Neon
   sebelum asumsi, tapi berdasarkan pola yang konsisten dipakai di
   SEMUA routes selama ini): kemungkinan besar kolomnya `id`,
   `business_id`, `user_id`, `action` (CREATE/UPDATE/DELETE),
   `entity_type` (nama tabel/modul, misal `'credit_notes'`),
   `entity_id`, `old_values` (jsonb, nullable), `new_values` (jsonb,
   nullable), `created_at`.
3. **Resolusi nama user**: tampilkan nama/email user yang melakukan
   perubahan (JOIN ke tabel `users`), bukan cuma `user_id` mentah.
4. **`entity_type` → label modul yang dibaca manusia**: bikin mapping
   sederhana di frontend (misal `'credit_notes'` → "Credit Notes",
   `'sales_invoices'` → "Sales Invoices") buat ditampilin, BUKAN nama
   tabel mentah.
5. **Detail perubahan (`old_values`/`new_values`)**: tampilkan sebagai
   JSON yang di-format rapi (bisa expand/collapse per baris), JANGAN
   coba bikin "diff visual" yang canggih dulu — itu di luar cakupan
   MVP ini.

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Lihat riwayat (filter, cari) |
| Viewer | Lihat juga (read-only di semua tempat lain, konsisten) |

TIDAK ADA role yang bisa nulis/ubah/hapus — history itu sendiri
append-only, modul ini cuma baca.

## 4. Struktur Data

TIDAK ADA tabel baru. Pakai tabel `audit_logs` yang udah ada —
**WAJIB cek struktur ASLI-nya di Neon dulu** sebelum implementasi
(pelajaran CLAUDE.md: jangan asumsi skema, cek selalu).

## 5. Aturan Bisnis

1. **TIDAK ADA create/update/delete dari modul ini** — cuma GET.
2. **Filter**: rentang tanggal, modul (`entity_type`), user yang
   melakukan perubahan, jenis aksi (Create/Update/Delete).
3. **RBAC**: GET boleh semua role (admin/accountant/viewer).

## 6. Spesifikasi Tampilan Daftar (List View)

- **Header**: kotak pencarian/filter (TANPA tombol "Buat Baru", ini
  read-only).
- **Filter**: rentang tanggal, dropdown modul, dropdown user, dropdown
  aksi (Create/Update/Delete).
- **Kolom**: Waktu (created_at), User (nama/email), Aksi (badge warna:
  hijau Create/kuning Update/merah Delete), Modul (label yang dibaca
  manusia), Entity ID (ringkas, 8 karakter pertama + "..."), Aksi
  (tombol "Lihat Detail" buka old_values/new_values).
- **PAGINATION bernomor** (pakai komponen yang udah ada,
  components/ui/pagination.tsx, pageSize 10) — ini kemungkinan jadi
  modul dengan data PALING BANYAK di seluruh sistem (setiap create/
  update/delete di SEMUA modul lain nyumbang 1 baris ke sini).

## 7. Spesifikasi Detail (buka dari tombol "Lihat Detail")

Dialog/modal nampilin:
- Info header: Waktu, User, Aksi, Modul, Entity ID.
- `old_values` (kalau ada) — JSON ter-format, collapsible.
- `new_values` (kalau ada) — JSON ter-format, collapsible.

## 8. Relasi dengan Modul Lain

- **SEMUA modul** — ini "pengamat" pasif dari semua modul lain. Nggak
  ada modul yang perlu diubah buat mendukung ini (mereka UDAH nulis
  audit log).
- **Users**: `user_id` di-JOIN buat nampilin nama/email.

## 9. Endpoint API

Base path: `/businesses/:businessId/history` (atau `/audit-logs`, cek
dulu apakah ada endpoint audit log yang mungkin udah pernah dibikin
buat keperluan lain sebelum nentuin nama final — kalau belum ada,
`/history` lebih enak dibaca user).

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/history` | listHistory | List (paginated), `?dateFrom=`, `?dateTo=`, `?entityType=`, `?userId=`, `?action=` |
| GET | `/businesses/:businessId/history/:id` | getHistoryDetail | Detail 1 entry (old_values/new_values lengkap) |

Semua endpoint GET, boleh semua role.