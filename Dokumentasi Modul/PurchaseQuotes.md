# Dokumentasi Modul: Purchase Quotes (Penawaran Pembelian)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis Manager.io Kebutuhan Sistem Prioritas 2 Pahrio
> Kaspiyanor, §8

## 1. Tujuan Modul

Mencatat dan membandingkan penawaran harga dari Supplier sebelum
keputusan pembelian dibuat. **Non-posting** — nggak nyentuh jurnal atau
stok sama sekali.

## 2. Keputusan Desain Penting

1. **BEDA dari Sales Quotes/Orders**: modul ini **PUNYA status yang
   beneran DISIMPAN** (`Draft`/`Accepted`/`Rejected`), bukan status
   dihitung otomatis. User set manual lewat form/list.
2. **BEDA lagi dari Sales Quotes/Orders**: modul ini **DIREKOMENDASIKAN
   punya tombol konversi** ("Copy to Purchase Order" dan "Copy to
   Purchase Invoice") — dokumen resmi eksplisit nyaranin ini sebagai
   "tombol akselerator". Diimplementasikan dengan pola YANG SAMA kayak
   "Convert to Invoice" di Purchase Orders (query param di URL, form
   tujuan ter-prefill).
3. **Baris item pakai `account_id`** (kategori Expense), BUKAN
   referensi ke "Item"/Inventory — project ini belum punya modul
   Inventory (sama pola simplifikasi kayak Purchase Orders).
4. **Field `Tax Code` dan `Division` per baris DILEWATI** (modul
   pendukungnya belum ada) — konsekuensinya, `Tax Amount` yang
   disebut dokumen resmi TIDAK dihitung terpisah (karena sumbernya
   dari Tax Code yang di-skip). `totalAmount` = `subtotal` aja.

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant (mewakili "Staf Pengadaan") | Buat, ubah, hapus, konversi penawaran |
| Viewer | Hanya baca |

## 4. Struktur Data

### 4.1 Tabel `purchase_quotes` (header)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| supplier_id | uuid | Ya | FK `contacts` (is_supplier=true) |
| date | date | Ya | Tanggal penerbitan, default hari ini |
| quote_number | varchar(50) | Tidak | Nomor referensi dari supplier/internal |
| description | text | Tidak | Catatan/ringkasan umum |
| status | varchar(20) | Ya | `Draft` / `Accepted` / `Rejected`, default `Draft` — DISIMPAN, user set manual |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 4.2 Tabel `purchase_quote_lines` (baris item)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| purchase_quote_id | uuid | Ya | FK, ON DELETE CASCADE |
| account_id | uuid | Ya | FK `chart_of_accounts` kategori Expense |
| description | varchar(255) | Tidak | Deskripsi barang/jasa yang ditawarkan |
| quantity | numeric(18,4) | Ya | Default 1 |
| unit_price | numeric(18,2) | Ya | |
| line_total | numeric(18,2) | Ya | quantity × unit_price, dihitung backend |
| sort_order | integer | Ya | Urutan tampil |

### 4.3 Field terhitung (real-time, TIDAK disimpan)

| Field | Cara Hitung |
|---|---|
| totalAmount | Σ(line_total) semua baris (= subtotal, TANPA pajak — lihat §2.4) |

## 5. Aturan Bisnis

1. **Wajib**: Supplier, `date`, minimal 1 baris dengan `account_id`
   (kategori Expense), `quantity` > 0, `unit_price` ≥ 0.
2. **TIDAK ADA posting jurnal** — create/update/delete murni CRUD.
3. **Status** bebas diubah user kapan pun (Draft ⇄ Accepted ⇄
   Rejected), TIDAK ada validasi transisi khusus (bebas gonta-ganti).
4. **"Copy to Purchase Order"**: buka form Purchase Order BARU
   ter-prefill Supplier + baris item dari Purchase Quote ini (bisa
   disunting sebelum simpan) — via query param, TANPA field FK
   tersimpan di `purchase_orders` (beda dari Purchase Order→Invoice
   yang emang nyimpen `purchaseOrderId`; di sini dokumen resmi nggak
   minta field pelacak balik, cukup prefill sekali pakai).
5. **"Copy to Purchase Invoice"**: sama polanya, prefill form Purchase
   Invoice.
6. **Delete**: bebas, tanpa validasi lock (murni informatif, nggak ada
   dokumen lain yang secara struktural bergantung ke sini).
7. **RBAC**: create/update/delete/konversi perlu role `admin` atau
   `accountant`. Viewer hanya GET.

## 6. Alur Status

```
Draft Penawaran (default saat dibuat)
        │
        ├── User ubah manual jadi Accepted (Diterima)
        │        │
        │        ▼
        │   User klik "Copy to Purchase Order" atau
        │   "Copy to Purchase Invoice" → form tujuan ter-prefill
        │
        └── User ubah manual jadi Rejected (Ditolak)
```

## 7. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Penawaran Baru", kotak pencarian (quote number,
  nama supplier).
- **Kolom**: Date, Quote Number, Supplier, Total Amount (rata kanan),
  Status (badge: Draft abu-abu, Accepted hijau, Rejected merah), Aksi
  (Edit, Copy to Purchase Order, Copy to Purchase Invoice, Hapus).
- **Baris total (footer)**: total `totalAmount`.

## 8. Spesifikasi Form Tambah/Edit

| Field | Komponen | Validasi |
|---|---|---|
| Date | Date picker | Wajib, default hari ini |
| Quote Number | Text input | Opsional |
| Supplier | Dropdown | Wajib |
| Status | Dropdown (Draft/Accepted/Rejected) | Wajib, default Draft |
| Summary Description | Textarea | Opsional |

**Baris item (tabel dinamis, minimal 1 baris):**

| Field | Komponen | Validasi |
|---|---|---|
| Account | Dropdown (COA kategori Expense) | Wajib |
| Description | Text input | Opsional |
| Qty | Number input | Wajib, > 0 |
| Unit Price | Number input | Wajib, ≥ 0 |
| Total | Otomatis | Read-only |

## 9. Contoh Data

```json
{
  "supplierId": "<id PT Bina Kimia Utama>",
  "date": "2026-09-01",
  "quoteNumber": "PQ-2026-003",
  "status": "Draft",
  "lines": [
    {
      "accountId": "<id akun Expense yang sesuai>",
      "description": "Biji Plastik Grade A",
      "quantity": 1000,
      "unitPrice": 15000
    }
  ]
}
```

## 10. Relasi dengan Modul Lain

- **Suppliers**: `supplier_id`.
- **Purchase Orders, Purchase Invoices**: sumber data buat "Copy to" —
  prefill sekali pakai, TANPA foreign key tersimpan balik.

## 11. Endpoint API

Base path: `/businesses/:businessId/purchase-quotes`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/purchase-quotes` | listPurchaseQuotes | List (paginated), `?q=`, `?status=` |
| GET | `/businesses/:businessId/purchase-quotes/:id` | getPurchaseQuote | Detail + baris item + totalAmount |
| POST | `/businesses/:businessId/purchase-quotes` | createPurchaseQuote | Buat penawaran |
| PUT | `/businesses/:businessId/purchase-quotes/:id` | updatePurchaseQuote | Update (termasuk ganti status) |
| DELETE | `/businesses/:businessId/purchase-quotes/:id` | deletePurchaseQuote | Soft-delete, bebas |

"Copy to Purchase Order"/"Copy to Purchase Invoice" TIDAK butuh
endpoint baru — dikerjakan di frontend (buka form tujuan dengan query
param, misal `?convertFromQuote=<id>`, ambil data lewat GET detail
Purchase Quote ini). Semua endpoint tulis perlu role `admin`/
`accountant`; GET boleh semua role.