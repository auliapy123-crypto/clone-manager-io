# Dokumentasi Modul: Tax Codes (Kode Pajak)

> Status: Draft — siap diimplementasikan
> Sumber: Kondisi existing — `sales_invoice_lines` sudah punya
> `tax_rate_percent`/`tax_amount` per baris TAPI ratenya diketik bebas
> (bukan referensi master). Modul Purchase belum punya konsep pajak sama sekali.

## 1. Tujuan Modul

Menyediakan **master referensi tarif pajak** (mis. PPN 11%, PPh 2%) supaya
pengisian pajak di baris Sales Invoice konsisten — pilih kode, tarif ngisi
otomatis — bukan ketik persen manual tiap baris.

## 2. Keputusan Desain Penting

1. **Master dulu, retrofit minimal**: sesi ini = tabel master `tax_codes`
   + CRUD + penempelan ke **Sales Invoices saja** (satu-satunya modul yang
   sudah punya kolom pajak). Purchase Invoices & modul lain MENYUSUL.
2. **Rate di-snapshot per baris**: `sales_invoice_lines.tax_rate_percent`
   TETAP jadi sumber kebenaran hitungan (tidak diubah). Kolom baru
   `tax_code_id` (nullable) cuma mencatat "rate ini berasal dari kode apa".
   Akibatnya: mengubah rate master TIDAK menulis ulang histori — hanya
   baris BARU yang pakai rate baru. (Prinsip akuntansi: dokumen lama tidak
   berubah.)
3. **Prioritas saat input**: kalau baris dikirim dengan `taxCodeId` → backend
   isi `tax_rate_percent` dari rate master saat itu. Kalau baris dikirim
   TANPA `taxCodeId` → perilaku lama (rate eksplisit/default 0). Kalau
   keduanya dikirim → `taxCodeId` menang, rate eksplisit diabaikan.
4. **Tidak menyentuh jurnal**: komputasi `tax_amount` dan posting jurnal
   Sales Invoice yang sudah ada dipakai apa adanya — modul ini cuma
   standarisasi ASAL rate-nya.
5. **Nonaktif, bukan hapus paksa**: tax code yang masih dipakai baris aktif
   manapun → hapus/nonaktifkan DITOLAK 400 (pola sama kayak Project/Division).

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Buat, ubah, nonaktifkan, hapus tax code; pakai di baris invoice |
| Viewer | Hanya baca |

## 4. Struktur Data

### 4.1 Tabel `tax_codes` (master, BARU)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| code | varchar(20) | Ya | Kode unik per bisnis (mis. `PPN11`) |
| name | varchar(100) | Ya | Nama (mis. `PPN 11%`) |
| rate_percent | numeric(5,2) | Ya | Tarif 0–100, mis. `11.00` |
| is_active | boolean | Ya | Default true; nonaktif = tak muncul di dropdown |
| description | text | Tidak | Catatan |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 4.2 Perubahan `sales_invoice_lines` (retrofit, 1 kolom)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| tax_code_id | uuid | Tidak | FK `tax_codes` nullable, validasi di aplikasi. Kolom `tax_rate_percent`/`tax_amount` yang sudah ada TIDAK diubah |

### 4.3 Field terhitung (real-time, TIDAK disimpan)

| Field | Cara Hitung |
|---|---|
| usageCount (list master) | Σ baris `sales_invoice_lines` aktif yang `tax_code_id`-nya kode ini |
| taxAmount per baris | Tidak berubah: `quantity × unit_price × tax_rate_percent` (existing) |

## 5. Aturan Bisnis

1. **Wajib**: `code` (unik per bisnis), `name`, `rate_percent` 0–100.
2. Saat create/update baris Sales Invoice dengan `taxCodeId`: validasi kode
   milik bisnis ini + aktif (400 kalau tidak), lalu set `tax_rate_percent`
   = rate master. Tanpa `taxCodeId`: perilaku lama.
3. Update rate master TIDAK menyentuh baris lama (snapshot, lihat §2.2).
4. Hapus/nonaktifkan tax code yang masih dipakai baris aktif → 400.
5. **RBAC**: tulis perlu `admin`/`accountant`; GET boleh semua role.
6. **Out of scope sesi ini**: pajak di Purchase Invoices/modul lain, laporan
   pajak, e-faktur, perubahan akun posting pajak.

## 6. Alur

```
Master: Draft data (code+name+rate) → dipakai di baris SI → rate berubah?
        → baris lama UTUH, baris baru pakai rate baru.
        → mau hapus? cek usageCount dulu → dipakai? tolak 400.
Form SI: pilih Tax Code (opsional) → rate terisi otomatis → simpan
         (tax_code_id tercatat, tax_rate tersnapshot).
```

## 7. Spesifikasi Tampilan Daftar (Master Tax Codes)

- **Header**: tombol "Kode Pajak Baru", pencarian (code, nama).
- **Kolom**: Code, Name, Rate % (rata kanan), Status (Aktif/Nonaktif),
  Terpakai (count), Aksi (Edit, Nonaktifkan/Aktifkan, Hapus).
- Filter: Semua/Aktif/Nonaktif.

## 8. Spesifikasi Form

**Form master**: Code * (unik), Name *, Rate % * (number 0–100), Status
Aktif (checkbox), Description (textarea opsional).

**Perubahan form Sales Invoice (satu dropdown per baris)**:

| Field | Komponen | Validasi |
|---|---|---|
| Tax Code | Dropdown (cuma yang aktif) + opsi "-- Manual --" | Opsional; pilih → rate tampil otomatis |

## 9. Contoh Data

```json
{ "code": "PPN11", "name": "PPN 11%", "ratePercent": 11, "isActive": true }
```

```json
// baris Sales Invoice memakai kode:
{ "accountId": "<id akun Revenue>", "quantity": 2, "unitPrice": 50000,
  "taxCodeId": "<id PPN11>" }
// → backend set tax_rate_percent=11.00, tax_amount=11000
```

## 10. Relasi dengan Modul Lain

- **Sales Invoices**: `sales_invoice_lines.tax_code_id` (satu-satunya
  konsumen sesi ini).
- **Chart of Accounts**: tidak ada FK (akun posting pajak tidak diubah).

## 11. Endpoint API

Base path: `/businesses/:businessId/tax-codes`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/tax-codes` | listTaxCodes | List (paginated), `?q=`, `?isActive=` |
| GET | `/businesses/:businessId/tax-codes/:id` | getTaxCode | Detail + usageCount |
| POST | `/businesses/:businessId/tax-codes` | createTaxCode | Buat kode |
| PUT | `/businesses/:businessId/tax-codes/:id` | updateTaxCode | Update (termasuk aktif/nonaktif) |
| DELETE | `/businesses/:businessId/tax-codes/:id` | deleteTaxCode | Soft-delete, tolak kalau dipakai |

Perubahan Sales Invoices: field `taxCodeId` (nullable) di line input
create/update + `taxCodeId`/`taxCode` di line detail; filter list opsional
`?taxCodeId=`. TIDAK ADA endpoint baru di modul SI. Semua endpoint tulis
perlu role `admin`/`accountant`; GET boleh semua role.