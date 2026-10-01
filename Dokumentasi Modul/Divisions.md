# Dokumentasi Modul: Divisions (Departemen/Cabang)

> Status: Draft — siap diimplementasikan
> Sumber: Roadmap Fase 4, "Divisions — tag departemen/cabang, bisa
> dilekatkan ke baris transaksi" (1 kalimat doang di dokumen asli)
> **DISEDERHANAKAN** (keputusan bareng user): nempel di level DOKUMEN
> (header), BUKAN di level baris item — biar cakupannya kecil dan
> konsisten sama pola Projects yang udah terbukti jalan.

## 1. Tujuan Modul

Label/tag departemen atau cabang yang bisa ditempelin ke dokumen
transaksi, buat ngelompokin transaksi per unit bisnis internal (misal
"Cabang Jakarta", "Divisi Marketing"). **BUKAN modul transaksi** —
murni penanda, SAMA PERSIS konsepnya kayak Projects yang udah ada,
cuma beda konteks (departemen/cabang, bukan proyek).

## 2. Keputusan Desain

1. **Nempel di level DOKUMEN (header), BUKAN baris item** — field
   `Division` yang selama ini SENGAJA DILEWATI di baris item banyak
   modul (Sales Invoices, Purchase Invoices, dst) TETAP dilewati di
   baris item. Divisions ditempelin sebagai 1 tag per DOKUMEN,
   persis pola `project_id` di modul Projects.
2. **TIDAK ADA perhitungan Income/Expenses/Net Profit** (beda dari
   Projects) — Divisions murni buat PENGELOMPOKAN/filter, bukan
   pelacakan keuangan. Kalau nanti dibutuhin laporan per Divisi, itu
   TERPISAH (di luar cakupan modul ini).
3. **Field `status` buat Divisions** (active/inactive) — SAMA pola
   kayak Projects: status `inactive` ilang dari dropdown transaksi
   BARU, tapi dokumen lama yang udah ditandain tetap nunjukkin tag-nya.
4. **Tabel yang ditandain SAMA PERSIS kayak Projects**: `sales_invoices`,
   `purchase_invoices`, `receipts`, `payments`, `expense_claims`,
   `journal_entries` (khusus jurnal manual).

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Buat, ubah, hapus divisi; pilih tag divisi pas input transaksi |
| Viewer | Hanya baca |

## 4. Struktur Data

### 4.1 Tabel `divisions` (BARU)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| name | varchar(255) | Ya | Nama departemen/cabang |
| code | varchar(50) | Tidak | Kode identifikasi |
| status | varchar(20) | Ya | `active`/`inactive`, default `active` |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 4.2 Kolom `division_id` (nullable, FK `divisions`) DITAMBAH ke:

`sales_invoices`, `purchase_invoices`, `receipts`, `payments`,
`expense_claims`, `journal_entries` — PERSIS 6 tabel yang sama kayak
`project_id` (mirror pola yang sudah terbukti di modul Projects).

## 5. Aturan Bisnis

1. **Wajib**: `name`. Field lain opsional.
2. **TIDAK ADA posting jurnal** dari modul Divisions sendiri.
3. **Validasi tag**: reuse pola `validateProjectAssignment` — divisi
   harus ada, satu bisnis, belum dihapus, status `active` buat tag
   BARU; tag lama tetap boleh dipertahankan walau divisinya sekarang
   `inactive` (dropdown form tetap nunjukkin tag yang lagi dipakai).
4. **Mengubah `division_id` TIDAK memicu repost jurnal** (divisi nggak
   masuk isi jurnal, sama kayak Projects).
5. **Delete**: DITOLAK kalau masih ada dokumen aktif bertag (6 tabel di
   atas; jurnal manual aktif ikut dicek).
6. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

## 6. Alur Status

```
Active (default, muncul di semua dropdown transaksi)
   │
   └── ganti ke Inactive → hilang dari dropdown transaksi BARU,
       histori transaksi yang udah ditandai tetap ada
```

## 7. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Divisi Baru", kotak pencarian (nama/kode).
- **Filter**: status (Active/Inactive/Semua).
- **Kolom**: Code, Name, Status (badge), Aksi (Edit, Hapus).
- **PAGINATION bernomor** (komponen yang udah ada, pageSize 10).

## 8. Spesifikasi Form Tambah/Edit

| Field | Komponen | Validasi |
|---|---|---|
| Name | Text input | Wajib |
| Code | Text input | Opsional |
| Status | Dropdown | Default Active |

## 9. Contoh Data

```json
{
  "name": "Cabang Jakarta Selatan",
  "code": "DIV-JKT-SEL",
  "status": "active"
}
```

## 10. Relasi dengan Modul Lain

Sama persis §4.2 — 6 modul yang masing-masing perlu TAMBAHAN dropdown
"Division" (opsional) di form create/edit-nya, isinya cuma divisi
berstatus `active` (plus divisi lama yang lagi ditandai kalau sedang
edit dokumen lama).

## 11. Endpoint API

Base path: `/businesses/:businessId/divisions`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/divisions` | listDivisions | List (paginated), `?q=`, `?status=` |
| GET | `/businesses/:businessId/divisions/:id` | getDivision | Detail |
| POST | `/businesses/:businessId/divisions` | createDivision | Buat divisi baru |
| PUT | `/businesses/:businessId/divisions/:id` | updateDivision | Update metadata |
| DELETE | `/businesses/:businessId/divisions/:id` | deleteDivision | Hapus — TOLAK kalau ada transaksi terikat |

## 12. Rencana Implementasi (checkpoint, mirror pola Projects Bagian A+B)

1. **Checkpoint 1**: tabel `divisions` + CRUD dasar (backend+frontend
   list/form) — typecheck bersih, commit+push.
2. **Checkpoint 2**: tambah kolom `division_id` ke 6 tabel + update
   masing-masing repository (create/update terima `divisionId`
   opsional, validasi, lock delete) + endpoint-nya + frontend form
   masing-masing (dropdown Division opsional) — typecheck bersih,
   commit+push.