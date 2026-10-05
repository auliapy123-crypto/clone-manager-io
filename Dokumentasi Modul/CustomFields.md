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
   tidak bisa satu FK). Index `(business_id, entity_type, record_id)`.
   Values milik record yang di-soft-delete ikut tidak tampil (query
   selalu join/filter record aktif di sisi modul — Fase 1: frontend
   hanya fetch untuk record yang sedang dibuka).
6. **Tipe definisi IMMUTABLE setelah ada values** (ganti tipe → 400).
   Hapus/nonaktifkan definisi yang masih punya values → 400 (pola
   Project/Division/TaxCode).

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

### 4.2 Tabel `custom_field_values` (BARU)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| definition_id | uuid | Ya | FK definitions ON DELETE CASCADE (guard 400 membuat cascade jarang kepakai) |
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
| valuesCount (list definisi) | Σ values milik definisi ini |

## 5. Aturan Bisnis

1. **Wajib definisi**: `entity_type` (Fase 1 cuma 2 nilai itu — nilai
   lain → 400), `key` (unik per bisnis+entity, pola `^[a-z0-9_]+$`),
   `label`, `field_type`.
2. `options` wajib (array string ≥1) kalau `select`, dilarang untuk
   tipe lain.
3. Upsert values (`PUT .../custom-field-values`): tiap item divalidasi
   definisi milik bisnis+entity ini + aktif + tipe value cocok
   (salah tipe → 400). Value `null`/`""` = HAPUS value itu.
4. Setelah upsert, semua definisi `is_required`+aktif milik entity itu
   wajib punya value non-kosong untuk record ini (kurang → 400).
5. Ganti `field_type`/`key` definisi yang sudah punya values → 400.
   Ganti `label`/`options`/`sort_order`/`is_active` bebas.
6. Hapus/nonaktifkan definisi yang masih punya values → 400.
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