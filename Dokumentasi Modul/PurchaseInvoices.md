# Dokumentasi Modul: Purchase Invoices (Faktur Pembelian)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis_Manager_io — Kebutuhan Sistem, Prioritas 2, §11

## 1. Tujuan Modul

Instrumen utama pencatatan tagihan pembelian dari supplier. Setiap faktur
yang diterbitkan **langsung memposting jurnal**: debit ke akun Expense
(beban) di baris item, kredit ke akun kontrol **Accounts Payable**.
Modul ini menghitung *Balance Due* (sisa tagihan) dan *Status*
(Paid/Unpaid/Overdue) secara **real-time**, BUKAN disimpan sebagai kolom di
database — dihitung dari total faktur dikurangi akumulasi pembayaran (Payments)
terkait.

## 2. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin | Terbitkan faktur, pantau utang, verifikasi jurnal |
| Accountant | Sama seperti admin untuk modul ini |
| Viewer | Hanya baca |

## 3. Struktur Data

### 3.1 Tabel `purchase_invoices` (header)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| supplier_id | uuid | Ya | FK ke `contacts` (is_supplier=true) |
| reference | varchar(50) | Tidak | Nomor faktur/referensi, boleh kosong |
| issue_date | date | Ya | Default hari ini |
| due_date | date | Tidak | Boleh diubah |
| description | text | Tidak | Keterangan umum faktur |
| quote_number | varchar(50) | Tidak | Teks nullable |
| order_number | varchar(50) | Tidak | Teks nullable |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 3.2 Tabel `purchase_invoice_lines` (baris item)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| purchase_invoice_id | uuid | Ya | FK, ON DELETE CASCADE |
| account_id | uuid | Ya | FK ke `chart_of_accounts` kategori Expense (akun Beban) |
| description | varchar(255) | Tidak | Deskripsi baris |
| quantity | numeric(18,4) | Ya | Default 1 |
| unit_price | numeric(18,2) | Ya | |
| subtotal | numeric(18,2) | Ya | quantity × unit_price, dihitung backend |
| sort_order | integer | Ya | Urutan tampil |

### 3.3 Field terhitung (real-time, TIDAK disimpan)

| Field | Cara Hitung |
|---|---|
| invoiceAmount | Σ(subtotal) semua baris |
| balanceDue | invoiceAmount − Σ(Payments teralokasi). **Untuk sekarang, selalu = invoiceAmount** karena modul Payments belum ada. |
| status | `Paid` jika balanceDue ≤ 0; `Overdue` jika balanceDue > 0 DAN hari ini > due_date; selain itu `Unpaid` |

## 4. Aturan Bisnis

1. **Wajib**: pilih Supplier, minimal 1 baris dengan Account (Expense)
   terisi. Faktur tanpa baris item tidak bisa disimpan.
2. **Posting jurnal otomatis SAAT DIBUAT**:
   - Debit: tiap `account_id` (Expense) di baris item sebesar
     `subtotal`-nya masing-masing.
   - Kredit: akun kontrol **Accounts Payable** sebesar `invoiceAmount` (total).
3. **Update**: mengubah baris item akan menyusun ulang (recalculate)
   jurnalnya — hapus jurnal lama, buat jurnal baru sesuai data terbaru,
   dalam satu transaction.
4. **Delete**: menghapus faktur ikut menghapus (soft-delete) jurnal
   terkait. Tanpa validasi lock (karena modul Payments belum ada).
5. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

## 5. Alur Status (dihitung, bukan disimpan)

```
Faktur dibuat → langsung posting jurnal
        │
        ▼
   balanceDue = invoiceAmount (belum ada Payments apa pun)
        │
        ├── hari ini ≤ due_date  →  status: Unpaid
        └── hari ini > due_date  →  status: Overdue
```

## 6. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Buat Faktur Pembelian", kotak pencarian.
- **Filter**: status (Unpaid/Overdue/Paid/semua).
- **Kolom**: Issue Date, Due Date, Reference, Supplier, Description,
  Invoice Amount, Balance Due, Status (badge warna), Aksi (Edit, Hapus).
- **Baris total (footer)**: total Invoice Amount dan total Balance Due.

## 7. Spesifikasi Form Tambah/Edit

**Header:**

| Field | Komponen | Validasi |
|---|---|---|
| Supplier | Dropdown | Wajib |
| Issue Date | Date picker | Wajib, default hari ini |
| Due Date | Date picker | Opsional |
| Reference | Text input | Opsional |
| Description | Text input | Opsional |
| Quote No | Text input | Opsional |
| Order No | Text input | Opsional |

**Baris item (tabel dinamis):**

| Field | Komponen | Validasi |
|---|---|---|
| Account (Expense) | Dropdown (COA kategori Expense) | Wajib |
| Description | Text input | Opsional |
| Qty | Number input | Wajib, > 0 |
| Unit Price | Number input | Wajib, ≥ 0 |
| Subtotal | Otomatis | Read-only |

## 8. Contoh Data

```json
{
  "supplierId": "<id Supplier>",
  "reference": "PI/2026/09/001",
  "issueDate": "2026-09-22",
  "dueDate": "2026-10-06",
  "lines": [
    {
      "accountId": "<id akun 'Beban Operasional'>",
      "description": "Pembelian Alat Tulis Kantor",
      "quantity": 1,
      "unitPrice": 500000
    }
  ]
}
```

## 9. Relasi dengan Modul Lain

- **Suppliers**: `supplier_id`; `accountsPayable` supplier otomatis
  bertambah (perhitungan live query perlu dibuat).
- **Chart of Accounts**: debit Expense, kredit Accounts Payable.

## 10. Endpoint API

Base path: `/businesses/:businessId/purchase-invoices`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/purchase-invoices` | listPurchaseInvoices | List |
| GET | `/businesses/:businessId/purchase-invoices/:invoiceId` | getPurchaseInvoice | Detail |
| POST | `/businesses/:businessId/purchase-invoices` | createPurchaseInvoice | Buat faktur |
| PUT | `/businesses/:businessId/purchase-invoices/:invoiceId` | updatePurchaseInvoice | Update |
| DELETE | `/businesses/:businessId/purchase-invoices/:invoiceId` | deletePurchaseInvoice | Hapus |
