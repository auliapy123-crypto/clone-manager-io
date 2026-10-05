# Dokumentasi Modul: Custom Fields (Field Tambahan Bebas)

> Status: Draft — siap diimplementasikan (Fase 1)
> Sumber: Roadmap Fase 4. Pola akrab: mirip fitur Custom Fields di
> Manager.io — field bebas per jenis record tanpa ubah skema tiap modul.

## 1. Tujuan Modul

Memungkinkan user menambah field sendiri per jenis record (mis. "No. PO
Pelanggan" di Sales Invoice, "Golongan Darah" di Customer) — definisi
sekali, isi per record, tampil di form + detail.

## 2. Keputusan Desain Penting

1. **Penyimpanan EAV, 2 tabel baru, NOL ubah tabel existing.**
   Alternatif JSONB-per-tabel DITOLAK (harus ALTER 30+ tabel).
2. **Fase 1 = infra generik + 2 modul**: Customers, Sales Invoices.
   Modul lain MENYUSUL cukup dari frontend (endpoint generik, backend
   tidak disentuh lagi).
3. **Level record/header SAJA** — custom field per BARIS item tidak
   masuk Fase 1 (scope meledak: validasi × N baris × tiap modul).
4. **Satu kolom value per tipe** (`value_text`/`value_number`/
   `value_date`/`value_boolean`); tipe `select` disimpan sebagai text
   + daftar opsi di definisi.
5. **`record_id` dipercaya tanpa FK lintas entity** (entity heterogen
   tidak bisa satu FK) — KOMPENSASINYA: upsert values WAJIB memvalidasi
   keberadaan record (customer/faktur di bisnis itu, belum soft-delete)
   lewat repository modul terkait, kalau tidak values yatim bisa
   terbentuk diam-diam. Index `(business_id, entity_type, record_id)`
   di tabel values (kolom `entity_type` di values DENORMALISASI dari
   definisi — lihat 4.2). Values milik record yang di-soft-delete
   ikut tidak tampil (query selalu join/filter record aktif di sisi
   modul — Fase 1: frontend hanya fetch untuk record yang sedang
   dibuka).
6. **Tipe definisi IMMUTABLE setelah ada values** (ganti tipe → 400).
   Hapus/nonaktifkan definisi yang masih punya values AKTIF → 400
   (pola Project/Division/TaxCode). Values milik record yang sudah
   dihapus TIDAK dihitung (valuesCount = Σ values pemilik record
   aktif) dan dibersihkan fisik saat definisi dihapus.

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Kelola definisi + isi values |
| Viewer | Hanya baca |

## 4. Struktur Data

### 4.1 Tabel `custom_field_definitions` (BARU)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope, FK cascade |
| entity_type | varchar(50) | Ya | Fase 1: `customer`, `sales_invoice` |
| key | varchar(50) | Ya | Unik per bisnis+entity, snake_case (mis. `no_po_pelanggan`) |
| label | varchar(100) | Ya | Tampil di form (mis. `No. PO Pelanggan`) |
| field_type | varchar(20) | Ya | `text`/`number`/`date`/`boolean`/`select` |
| is_required | boolean | Ya | Default false |
| options | jsonb | Tidak | Wajib untuk `select`: array string min 1 |
| sort_order | integer | Ya | Default 0, urutan tampil di form |
| is_active | boolean | Ya | Default true; nonaktif = tak muncul di form (values lama tetap tampil di detail) |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

Unique `(business_id, entity_type, key)` sebagai **PARTIAL UNIQUE
INDEX `WHERE deleted_at IS NULL`** — key yang sama boleh dipakai ulang
setelah definisi lamanya dihapus (soft-deleted tidak memblokir).

### 4.2 Tabel `custom_field_values` (BARU)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| definition_id | uuid | Ya | FK definitions ON DELETE CASCADE (guard 400 membuat cascade jarang kepakai) |
| entity_type | varchar(50) | Ya | **DENORMALISASI dari definisi** — dibutuhkan index (business_id, entity_type, record_id) tanpa JOIN; diisi dari entity definisi saat upsert |
| record_id | uuid | Ya | ID record pemilik, TANPA FK |
| value_text | text | Tidak | Untuk `text`/`select` |
| value_number | numeric(18,2) | Tidak | Untuk `number` |
| value_date | date | Tidak | Untuk `date` |
| value_boolean | boolean | Tidak | Untuk `boolean` |
| created_at / updated_at | timestamp | — | Standar (tanpa deleted_at: value null = baris dihapus fisik) |

Unique `(definition_id, record_id)`.

### 4.3 Field terhitung (real-time, TIDAK disimpan)

| Field | Cara Hitung |
|---|---|
| valuesCount (list definisi) | Σ values milik definisi ini yang pemilik record-nya masih AKTIF (values yatim tidak dihitung) |

## 5. Aturan Bisnis

1. **Wajib definisi**: `entity_type` (Fase 1 cuma 2 nilai itu — nilai
   lain → 400), `key` (unik per bisnis+entity, pola `^[a-z0-9_]+$`),
   `label`, `field_type`.
2. `options` wajib (array string ≥1) kalau `select`, dilarang untuk
   tipe lain.
3. Upsert values (`PUT .../custom-field-values`): **record pemilik
   wajib ada di bisnis ini dan belum di-soft-delete** (cek lewat
   repository modul terkait — getCustomerById/getSalesInvoiceById;
   tidak ada → 400, TIDAK membuat baris values). Tiap item divalidasi
   definisi milik bisnis+entity ini + aktif; value `null`/`""` =
   HAPUS value itu (sinyal hapus TIDAK divalidasi tipe/opsi — kosong
   selalu boleh). Value non-kosong divalidasi tipe cocok: text harus
   string; number harus typeof number (string "123" ditolak 400);
   date string `YYYY-MM-DD` valid (2026-02-30 ditolak); boolean harus
   true/false; select HARUS salah satu opsi di definisi (di luar
   options → 400). Salah tipe → 400.
4. Setelah upsert, semua definisi `is_required`+aktif milik entity itu
   wajib punya value non-kosong untuk record ini (kurang → 400,
   transaksi rollback). **boolean `false` dianggap TERISI** (bukan
   kosong) — satu-satunya falsy yang sah. Frontend (form Customer &
   Sales Invoice) memvalidasi field wajib ini SEBELUM submit record
   utama, dan setelah create sukses id record disimpan sehingga submit
   ulang saat upsert gagal menjadi UPDATE (tidak ada dokumen duplikat).
5. Ganti `field_type`/`key` definisi yang sudah punya values → 400.
   Ganti `label`/`options`/`sort_order`/`is_active` bebas.
6. Hapus/nonaktifkan definisi yang masih punya values (pemilik record
   aktif) → 400. Hapus definisi yang hanya punya values YATIM
   (pemilik record sudah dihapus) → BERHASIL, dan values yatim itu
   dibersihkan fisik bersamaan.
7. **RBAC**: tulis perlu `admin`/`accountant` (permission
   `custom_field:read/write/delete`); GET boleh semua role.
8. **Out of scope Fase 1**: custom field per baris item, tampil di
   kolom list, lapor/cetak, entity selain 2 di atas.

## 6. Alur

```
Definisi: pilih entity → key+label+tipe (+opsi) → aktif.
Form record: section dinamis sesuai definisi aktif entity itu
             (urut sort_order, * untuk required) → simpan via upsert.
Detail record: tampilkan label + value (termasuk dari definisi yang
               kini nonaktif).
Hapus definisi: cek valuesCount → >0? tolak 400.
```

## 7. Spesifikasi Tampilan Daftar (Manager Definisi)

- **Header**: tombol "Field Baru", filter entity (Customer / Sales Invoice), pencarian (key, label).
- **Kolom**: Entity, Key (mono), Label, Tipe, Required (Ya/—), Status, Terpakai (count), Aksi (Edit, Nonaktifkan/Aktifkan, Hapus).

## 8. Spesifikasi Form

**Form definisi**: Entity * (select 2 nilai, terkunci saat edit),
Key * (snake_case, terkunci kalau sudah ada values), Label *,
Tipe * (terkunci kalau sudah ada values), Required (checkbox),
Options (textarea 1 baris 1 opsi, khusus select), Urutan (number),
Status Aktif.

**Section dinamis di form Customer & Sales Invoice (header)**:
input menyesuaikan tipe (text/number/date/checkbox/select);
kosongkan = hapus value.

## 9. Contoh Data

```json
{ "entityType": "sales_invoice", "key": "no_po_pelanggan",
  "label": "No. PO Pelanggan", "fieldType": "text", "isRequired": true }
```

```json
// PUT .../custom-field-values
{ "entityType": "sales_invoice", "recordId": "<id faktur>",
  "values": [{ "definitionId": "<id def>", "value": "PO-2026-118" }] }
```

## 10. Relasi dengan Modul Lain

- **Generik**: tidak ada FK ke tabel modul (sengaja). Fase 1
  dikonsumsi frontend Customers + Sales Invoices (level header).
- **Businesses**: `business_id` cascade seperti biasa.

## 11. Endpoint API

Base path: `/businesses/:businessId/custom-field-definitions` dan
`/businesses/:businessId/custom-field-values`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `.../custom-field-definitions` | listCustomFieldDefinitions | List, `?entityType=`, `?q=`, `?isActive=` |
| GET | `.../custom-field-definitions/:id` | getCustomFieldDefinition | Detail + valuesCount |
| POST | `.../custom-field-definitions` | createCustomFieldDefinition | Buat definisi |
| PUT | `.../custom-field-definitions/:id` | updateCustomFieldDefinition | Update (guard tipe/key) |
| DELETE | `.../custom-field-definitions/:id` | deleteCustomFieldDefinition | Soft-delete, tolak kalau ada values |
| GET | `.../custom-field-values?entityType=&recordId=` | listCustomFieldValues | Values 1 record (+ label/tipe definisi) |
| PUT | `.../custom-field-values` | upsertCustomFieldValues | Upsert batch + cek required |

Semua endpoint tulis perlu role `admin`/`accountant`; GET boleh semua
role. TIDAK ADA endpoint/ubahan di modul Customers & Sales Invoices.