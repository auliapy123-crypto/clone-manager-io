# Dokumentasi Modul: Sales Quotes (Penawaran Harga)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis Fitur dan Kebutuhan Sistem Manager intern - Aulia, §10

## 1. Tujuan Modul

Dokumen penawaran harga formal ke calon pelanggan, sebelum transaksi
disepakati — tahap PALING AWAL siklus penjualan (sebelum Sales Order
maupun Sales Invoice). **Non-posting** — tidak membentuk jurnal, tidak
menyentuh saldo apa pun.

## 2. Keputusan Desain (penyesuaian dari dokumen resmi)

1. **TIDAK ADA konversi otomatis ke Sales Order/Sales Invoice.**
   Dokumen resmi eksplisit menyebut tombol "Copy to" di Manager.io asli
   cuma nawarin "New Sales Quote", "New Purchase Invoice" (aneh, tapi
   itu yang tertulis), dan "New Recurring Sales Quote" — BUKAN Sales
   Order/Sales Invoice langsung. Berbeda dari Purchase Orders yang kita
   bikin ada tombol "Convert to Invoice", modul ini **sengaja TIDAK**
   dikasih tombol konversi otomatis, ngikutin apa yang tertulis di
   dokumen resmi. User yang mau bikin Sales Invoice dari sini, isi
   manual sendiri (biasa, bukan bug).
2. **Field pengaturan cetak/tampilan DILEWATI** (di luar cakupan MVP,
   butuh sistem cetak dokumen yang belum ada): Rounding, Column Line
   number, Column Discount, Withholding tax, Hide total amount, Custom
   title, Show item images.
3. **Kolom List View mengikuti pola modul serupa** (Purchase Orders)
   karena dokumen resmi bilang belum sempat diamati detail.

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Buat, ubah, hapus penawaran |
| Viewer | Hanya baca |

## 4. Struktur Data

### 4.1 Tabel `sales_quotes` (header)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| customer_id | uuid | Ya | FK `contacts` (is_customer=true) |
| issue_date | date | Ya | Default hari ini |
| valid_for_days | integer, nullable | Tidak | Masa berlaku (hari) |
| reference | varchar(50) | Tidak | Nomor referensi |
| billing_address | text | Tidak | Auto dari Customer, bisa diedit manual |
| description | text | Tidak | Keterangan umum |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 4.2 Tabel `sales_quote_lines` (baris item)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| sales_quote_id | uuid | Ya | FK, ON DELETE CASCADE |
| description | varchar(255) | Ya | Nama barang/jasa yang ditawarkan |
| quantity | numeric(18,4) | Ya | Default 1 |
| unit_price | numeric(18,2) | Ya | |
| line_total | numeric(18,2) | Ya | quantity × unit_price, dihitung backend |
| sort_order | integer | Ya | Urutan tampil |

**Catatan**: beda dari Purchase Orders/Sales Invoices, baris item di
sini **TANPA `account_id`** — dokumen resmi cuma minta Description, Qty,
Unit price (belum ada konsep akun Revenue di tahap penawaran, wajar
karena belum jadi transaksi akuntansi).

### 4.3 Field terhitung (real-time, TIDAK disimpan)

| Field | Cara Hitung |
|---|---|
| totalAmount | Σ(line_total) semua baris |
| expiryDate | `issue_date + valid_for_days` hari (null kalau `valid_for_days` kosong) |

## 5. Aturan Bisnis

1. **Wajib**: pilih Customer, `issue_date`, minimal 1 baris dengan
   `description`, `quantity` > 0, `unit_price` ≥ 0.
2. **TIDAK ADA posting jurnal** — create/update/delete murni CRUD.
3. **Billing address** otomatis terisi dari alamat Customer yang
   dipilih saat create, tapi bisa diedit manual sesudahnya tanpa
   terpengaruh perubahan data Customer di masa depan.
4. **Delete**: bebas, tanpa validasi lock (dokumen ini nggak ngait ke
   dokumen lain).
5. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

## 6. Alur Status

TIDAK ADA status bertahap. Sales Quote yang tersimpan langsung final
sebagai penawaran (bukan berarti "disetujui" — cuma dokumen tercatat).
Alur konseptual: dibuat → dikirim ke calon pelanggan (di luar sistem) →
kalau disetujui, user bikin Sales Order/Sales Invoice BARU secara
manual (bukan konversi otomatis dari sini).

## 7. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Penawaran Baru", kotak pencarian (reference, nama
  customer, deskripsi).
- **Kolom**: Issue Date, Reference, Customer, Description, Total
  Amount, Expiry Date, Aksi (Edit, Hapus).
- **Baris total (footer)**: total `totalAmount`.

## 8. Spesifikasi Form Tambah/Edit

| Field | Komponen | Validasi |
|---|---|---|
| Issue Date | Date picker | Wajib, default hari ini |
| Customer | Dropdown | Wajib |
| Valid For (hari) | Number input | Opsional |
| Reference | Text input | Opsional |
| Billing Address | Textarea | Opsional, auto dari Customer |
| Description | Text input | Opsional |

Di bawah header, tampilkan **Expiry Date** (read-only, dihitung live
dari Issue Date + Valid For) kalau `Valid For` diisi.

**Baris item (tabel dinamis, minimal 1 baris):**

| Field | Komponen | Validasi |
|---|---|---|
| Description | Text input | Wajib |
| Qty | Number input | Wajib, > 0 |
| Unit Price | Number input | Wajib, ≥ 0 |
| Total | Otomatis | Read-only |

## 9. Contoh Data

```json
{
  "customerId": "<id PT Klien>",
  "issueDate": "2026-09-29",
  "validForDays": 2,
  "description": "Penawaran Harga Paket Internet Corporate Bulan September 2026",
  "lines": [
    {
      "description": "Paket Internet Dedicated 50 Mbps",
      "quantity": 1,
      "unitPrice": 2500000
    }
  ]
}
```

## 10. Relasi dengan Modul Lain

- **Customers**: `customer_id`, sumber Billing Address.
- **Sales Orders, Sales Invoices**: kelanjutan konsep siklus penjualan,
  TAPI TANPA jalur konversi otomatis (lihat §2.1).

## 11. Endpoint API

Base path: `/businesses/:businessId/sales-quotes` (TANPA prefix `/api`,
konsisten dengan endpoint lain di project ini).

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/sales-quotes` | listSalesQuotes | List (paginated), `?q=` |
| GET | `/businesses/:businessId/sales-quotes/:id` | getSalesQuote | Detail + baris item + totalAmount/expiryDate |
| POST | `/businesses/:businessId/sales-quotes` | createSalesQuote | Buat penawaran |
| PUT | `/businesses/:businessId/sales-quotes/:id` | updateSalesQuote | Update |
| DELETE | `/businesses/:businessId/sales-quotes/:id` | deleteSalesQuote | Soft-delete, bebas |

Semua endpoint tulis perlu role `admin`/`accountant`; GET boleh semua
role. TIDAK ADA logic jurnal di modul ini.