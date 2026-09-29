# Dokumentasi Modul: Sales Orders (Pesanan Penjualan)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis Fitur dan Kebutuhan Sistem Manager intern - Aulia, §11

## 1. Tujuan Modul

Mencatat pesanan resmi dari pelanggan yang sudah disepakati, sebagai
dasar sebelum Sales Invoice diterbitkan. **Non-posting** — tidak
membentuk jurnal, belum jadi tagihan resmi.

## 2. Keputusan Desain (penyesuaian dari dokumen resmi)

1. **TIDAK ADA konversi otomatis ke Sales Invoice** — sama seperti Sales
   Quotes, tombol "Copy to" di tool asli cuma nawarin New Sales Quote,
   New Sales Order, New Purchase Invoice, New Recurring Sales Order,
   BUKAN Sales Invoice langsung. Sengaja TIDAK dikasih tombol konversi
   otomatis.
2. **TANPA Billing Address** — beda dari Sales Quotes, field ini memang
   nggak disebut di struktur data resmi Sales Orders. Ikuti dokumen apa
   adanya, jangan ditambah sendiri.
3. **Field Order number di Sales Invoices** (sudah ada dari modul Sales
   Invoices, teks bebas nullable) dipakai user buat nulis manual nomor
   referensi Sales Order ini kalau perlu — TETAP teks bebas, TIDAK
   diubah jadi foreign key, karena dokumen resmi sendiri bilang nggak
   ada jalur otomatis.
4. **Tombol Clone, Copy to, Print, PDF** di halaman detail — SENGAJA
   DILEWATI di MVP ini (butuh sistem cetak dokumen yang belum ada).

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Buat, ubah, hapus pesanan |
| Viewer | Hanya baca |

## 4. Struktur Data

### 4.1 Tabel `sales_orders` (header)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| customer_id | uuid | Ya | FK `contacts` (is_customer=true) |
| issue_date | date | Ya | Default hari ini |
| reference | varchar(50) | Tidak | Nomor referensi pesanan |
| description | text | Tidak | Keterangan umum |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 4.2 Tabel `sales_order_lines` (baris item)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| sales_order_id | uuid | Ya | FK, ON DELETE CASCADE |
| description | varchar(255) | Ya | Nama barang/jasa yang dipesan |
| quantity | numeric(18,4) | Ya | Default 1 |
| unit_price | numeric(18,2) | Ya | |
| line_total | numeric(18,2) | Ya | quantity × unit_price, dihitung backend |
| sort_order | integer | Ya | Urutan tampil |

Sama seperti Sales Quotes: baris item **TANPA `account_id`**.

### 4.3 Field terhitung (real-time, TIDAK disimpan)

| Field | Cara Hitung |
|---|---|
| totalAmount | Σ(line_total) semua baris |

## 5. Aturan Bisnis

1. **Wajib**: pilih Customer, `issue_date`, minimal 1 baris dengan
   `description`, `quantity` > 0, `unit_price` ≥ 0.
2. **TIDAK ADA posting jurnal** — create/update/delete murni CRUD.
3. **Delete**: bebas, tanpa validasi lock.
4. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

## 6. Alur Status

TIDAK ADA status bertahap. Dibuat → secara konsep diproses lanjut jadi
Sales Invoice, TAPI manual (isi Order number di form Sales Invoice
sendiri kalau perlu referensi balik).

## 7. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Pesanan Baru", kotak pencarian (reference, nama
  customer, deskripsi).
- **Kolom**: Issue Date, Reference, Customer, Description, Total
  Amount, Aksi (Edit, Hapus).
- **Baris total (footer)**: total `totalAmount`.

## 8. Spesifikasi Form Tambah/Edit

| Field | Komponen | Validasi |
|---|---|---|
| Issue Date | Date picker | Wajib, default hari ini |
| Customer | Dropdown | Wajib |
| Reference | Text input | Opsional |
| Description | Text input | Opsional |

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
  "reference": "1",
  "description": "Pesanan Paket Internet Corporate Bulan September 2026",
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

- **Customers**: `customer_id`.
- **Sales Invoices**: field `orderNumber` (sudah ada, teks bebas) buat
  referensi manual ke pesanan ini — TANPA jalur konversi otomatis.

## 11. Endpoint API

Base path: `/businesses/:businessId/sales-orders`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/sales-orders` | listSalesOrders | List (paginated), `?q=` |
| GET | `/businesses/:businessId/sales-orders/:id` | getSalesOrder | Detail + baris item + totalAmount |
| POST | `/businesses/:businessId/sales-orders` | createSalesOrder | Buat pesanan |
| PUT | `/businesses/:businessId/sales-orders/:id` | updateSalesOrder | Update |
| DELETE | `/businesses/:businessId/sales-orders/:id` | deleteSalesOrder | Soft-delete, bebas |

Semua endpoint tulis perlu role `admin`/`accountant`; GET boleh semua
role. TIDAK ADA logic jurnal di modul ini.