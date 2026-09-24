# Dokumentasi Modul: Purchase Orders (Pesanan Pembelian)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis Fitur dan Kebutuhan Sistem Manager intern - pahrio
> kaspiyanor, §5

## 1. Tujuan Modul

Menerbitkan dokumen pemesanan resmi ke Supplier atas barang/jasa yang
ingin dibeli. **Dokumen NON-POSTING** — menyimpan PO TIDAK mengubah
saldo GL atau Accounts Payable sama sekali (beda total dari Purchase
Invoices). PO nantinya jadi rujukan pas bikin Purchase Invoice
sungguhan.

## 2. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Buat, ubah, hapus, konversi PO ke Purchase Invoice |
| Viewer | Hanya baca |

## 3. Struktur Data

### 3.1 Tabel `purchase_orders` (header)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| supplier_id | uuid | Ya | FK `contacts` (is_supplier=true) |
| reference | varchar(50) | Tidak | Nomor PO |
| date | date | Ya | Tanggal PO diterbitkan, default hari ini |
| billing_address | text | Tidak | Alamat penagihan/pengiriman |
| description | text | Tidak | Ringkasan/catatan umum |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 3.2 Tabel `purchase_order_lines` (baris item)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| purchase_order_id | uuid | Ya | FK, ON DELETE CASCADE |
| account_id | uuid | Ya | FK `chart_of_accounts` kategori Expense (dokumen resmi nyebut "Item/Inventory" juga, TAPI modul Inventory belum ada di project ini, jadi disederhanakan ke akun COA aja, sama pola kayak Purchase Invoices) |
| description | varchar(255) | Tidak | Deskripsi item |
| quantity | numeric(18,4) | Ya | Default 1 |
| unit_price | numeric(18,2) | Ya | |
| line_amount | numeric(18,2) | Ya | quantity × unit_price, dihitung backend |
| sort_order | integer | Ya | Urutan tampil |

**Sengaja DILEWATI di MVP ini** (modul pendukungnya belum ada di
project): field `Tax Code`, `Division`, `Project` per baris.

### 3.3 Tabel `purchase_invoices` — TAMBAH 1 KOLOM

| Kolom baru | Tipe | Keterangan |
|---|---|---|
| purchase_order_id | uuid, nullable | FK `purchase_orders` — diisi kalau invoice ini dibuat dari hasil "Convert to Invoice" sebuah PO |

### 3.4 Field terhitung (real-time, TIDAK disimpan)

| Field | Cara Hitung |
|---|---|
| totalOrderAmount | Σ(line_amount) semua baris PO |
| invoicedAmount | Σ(invoiceAmount) semua Purchase Invoice aktif yang `purchase_order_id`-nya PO ini |
| status | `Draft/Open` kalau `invoicedAmount = 0`; `Partially Invoiced` kalau `0 < invoicedAmount < totalOrderAmount`; `Fully Invoiced/Closed` kalau `invoicedAmount >= totalOrderAmount` |

## 4. Aturan Bisnis

1. **Wajib**: pilih Supplier, `date`, minimal 1 baris dengan `account_id`
   terisi, `quantity` > 0, `unit_price` ≥ 0.
2. **TIDAK ADA posting jurnal** — create/update/delete PO murni
   perubahan data, tanpa menyentuh `journal_entries` sama sekali.
3. **Convert to Invoice**: dari 1 PO, bikin 1 Purchase Invoice baru yang
   otomatis terisi Supplier + baris item dari PO itu (bisa disunting
   dulu sebelum disimpan), dengan `purchase_order_id` invoice itu diisi
   ID PO asalnya. 1 PO boleh dikonversi berkali-kali (kalau barangnya
   dikirim/ditagih bertahap) — makanya status bisa "Partially Invoiced".
4. **Delete**: TOLAK kalau PO itu udah punya minimal 1 Purchase Invoice
   yang mereferensikannya (status selain Draft/Open) — biar nggak bikin
   invoice yang udah ada jadi "nggantung" tanpa PO asalnya. PO yang masih
   Draft/Open (belum ada invoice sama sekali) bebas dihapus.
5. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

## 5. Alur Status (dihitung, bukan disimpan)

```
PO dibuat (Draft/Open, invoicedAmount = 0)
        │
        ▼
User klik "Convert to Invoice" satu kali atau lebih
        │
        ├── invoicedAmount < totalOrderAmount  →  Partially Invoiced
        └── invoicedAmount >= totalOrderAmount →  Fully Invoiced/Closed
```

## 6. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "PO Baru", kotak pencarian (reference, nama
  supplier).
- **Filter**: rentang tanggal.
- **Kolom**: Date, Reference, Supplier, Description, Total Amount,
  Status (badge: Draft/Open abu-abu, Partially Invoiced kuning, Fully
  Invoiced/Closed hijau), Aksi (Edit, **Convert to Invoice**, Hapus).

## 7. Spesifikasi Form Tambah/Edit

**Header:**

| Field | Komponen | Validasi |
|---|---|---|
| Date | Date picker | Wajib, default hari ini |
| Supplier | Dropdown | Wajib |
| Reference | Text input | Opsional |
| Billing Address | Textarea | Opsional |
| Description | Text input | Opsional |

**Baris item (tabel dinamis):**

| Field | Komponen | Validasi |
|---|---|---|
| Account | Dropdown (COA kategori Expense) | Wajib |
| Description | Text input | Opsional |
| Qty | Number input | Wajib, > 0 |
| Unit Price | Number input | Wajib, ≥ 0 |
| Line Amount | Otomatis | Read-only |

## 8. Contoh Data

```json
{
  "supplierId": "<id PT Mitra Megah Jaya>",
  "reference": "PO-2026-0042",
  "date": "2026-08-01",
  "description": "Pengadaan kertas HVS & Alat Tulis Kantor Agustus",
  "lines": [
    {
      "accountId": "<id akun Expense>",
      "description": "Kertas A4 80gr",
      "quantity": 50,
      "unitPrice": 55000
    }
  ]
}
```

## 9. Relasi dengan Modul Lain

- **Suppliers**: `supplier_id`.
- **Purchase Invoices**: PO adalah SUMBER pembuatan invoice (via
  "Convert to Invoice"); `purchase_invoices.purchase_order_id` nullable
  jadi jembatannya; status PO dihitung dari invoice-invoice yang
  merujuk balik ke PO itu.
- **Chart of Accounts**: baris item terikat ke akun kategori Expense
  (sama kayak Purchase Invoices).

## 10. Endpoint API

Base path: `/businesses/:businessId/purchase-orders`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/purchase-orders` | listPurchaseOrders | List (paginated), `?q=`, `?status=` |
| GET | `/businesses/:businessId/purchase-orders/:id` | getPurchaseOrder | Detail + baris item + totalOrderAmount/invoicedAmount/status |
| POST | `/businesses/:businessId/purchase-orders` | createPurchaseOrder | Buat PO (TANPA jurnal) |
| PUT | `/businesses/:businessId/purchase-orders/:id` | updatePurchaseOrder | Update |
| DELETE | `/businesses/:businessId/purchase-orders/:id` | deletePurchaseOrder | Hapus — TOLAK kalau sudah ada invoice terkait |

"Convert to Invoice" TIDAK butuh endpoint baru — dikerjakan di frontend:
form Purchase Invoice yang sudah ada dibuka dengan data awal (Supplier +
lines) diambil dari GET detail PO ini, ditambah field tersembunyi
`purchaseOrderId` yang ikut dikirim pas submit create Purchase Invoice
(endpoint `POST .../purchase-invoices` yang sudah ada perlu terima field
opsional ini).