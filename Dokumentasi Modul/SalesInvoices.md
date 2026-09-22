# Dokumentasi Modul: Sales Invoices (Faktur Penjualan)

> Status: Draft — siap diimplementasikan (REVISI)
> Sumber: Analisis_Manager_io — Kebutuhan Sistem, Prioritas 1, §10
> (dokumen resmi ditemukan setelah draf pertama disusun dari konteks
> tersebar — draf pertama DIBATALKAN, dokumen ini yang jadi acuan)

## 1. Tujuan Modul

Instrumen utama pencatatan tagihan penjualan ke pelanggan. Setiap faktur
yang diterbitkan **langsung memposting jurnal**: debit ke akun kontrol
Accounts Receivable, kredit ke akun Income (pendapatan) dan akun Tax
Payable (kalau ada pajak). Modul ini menghitung *Balance Due* (sisa
tagihan) dan *Status* (Paid/Unpaid/Overdue) secara **real-time**, BUKAN
disimpan sebagai kolom di database — dihitung dari total faktur dikurangi
akumulasi penerimaan kas (Receipts) dan retur (Credit Notes) terkait.

## 2. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin | Terbitkan faktur, pantau umur piutang, verifikasi jurnal |
| Accountant | Sama seperti admin untuk modul ini |
| Viewer | Hanya baca |

## 3. Struktur Data

### 3.1 Tabel `sales_invoices` (header)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| customer_id | uuid | Ya | FK ke `contacts` (is_customer=true) |
| reference | varchar(50) | Tidak | Nomor faktur/referensi, boleh kosong |
| issue_date | date | Ya | Default hari ini |
| due_date | date | Tidak | Auto dari `customer.salesInvoiceDueDateDays` kalau ada, boleh diubah |
| billing_address | text | Tidak | Default dari alamat customer, bisa disesuaikan |
| description | text | Tidak | Keterangan umum faktur |
| deleted_at | timestamp | Tidak | Soft-delete (juga membatalkan jurnal terkait — lihat §4.4) |
| created_at / updated_at | timestamp | — | Standar |

### 3.2 Tabel `sales_invoice_lines` (baris item)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| sales_invoice_id | uuid | Ya | FK, ON DELETE CASCADE |
| account_id | uuid | Ya | FK ke `chart_of_accounts` kategori Revenue (akun Income tujuan) |
| description | varchar(255) | Tidak | Deskripsi baris |
| quantity | numeric(18,4) | Ya | Default 1 |
| unit_price | numeric(18,2) | Ya | |
| subtotal | numeric(18,2) | Ya | quantity × unit_price, dihitung backend |
| tax_rate_percent | numeric(5,2) | Ya | Default 0 (No Tax) |
| tax_amount | numeric(18,2) | Ya | subtotal × tax_rate_percent / 100, dihitung backend |
| line_total | numeric(18,2) | Ya | subtotal + tax_amount, dihitung backend |
| sort_order | integer | Ya | Urutan tampil |

### 3.3 Field terhitung (real-time, TIDAK disimpan)

| Field | Cara Hitung |
|---|---|
| invoiceAmount | Σ(line_total) semua baris |
| balanceDue | invoiceAmount − Σ(Receipts teralokasi) − Σ(Credit Notes terkait). **Untuk sekarang, selalu = invoiceAmount** karena modul Receipts & Credit Notes belum ada — belum ada yang mengurangi. |
| status | `Paid` jika balanceDue ≤ 0; `Overdue` jika balanceDue > 0 DAN hari ini > due_date; selain itu `Unpaid` |

## 4. Aturan Bisnis

1. **Wajib**: pilih Customer, minimal 1 baris dengan Account (Income)
   terisi. Faktur tanpa baris item tidak bisa disimpan.
2. **Posting jurnal otomatis SAAT DIBUAT** (bukan tahap "draft" terpisah
   — beda dari rancangan awal saya kemarin, mengikuti dokumen resmi):
   - Debit: akun kontrol **Accounts Receivable** sebesar `invoiceAmount`.
   - Kredit: tiap `account_id` (Income) di baris item sebesar
     `subtotal`-nya masing-masing (SEBELUM pajak).
   - Kredit: akun kontrol **Tax Payable** sebesar total `tax_amount`
     (kalau ada, kalau semua baris "No Tax" maka baris jurnal ini
     dilewati).
   - Total debit harus sama dengan total kredit.
3. **Update**: mengubah baris item pada faktur yang sudah pernah
   diposting akan menyusun ulang (recalculate) jurnalnya — hapus jurnal
   lama, buat jurnal baru sesuai data terbaru, dalam satu transaction.
4. **Delete**: menghapus faktur ikut menghapus (soft-delete) jurnal
   terkait, sehingga otomatis mengembalikan saldo Accounts
   Receivable/Income seperti sebelum faktur itu ada.
5. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

**Sengaja DIABAIKAN dulu di tahap ini** (dari dokumen resmi §10.7, tapi
di luar cakupan MVP — belum ada sistem cetak dokumen/PDF di aplikasi
ini): opsi tampilan cetak (custom title, footer, hide due date/balance,
show item image, relay/webhook), early payment discount, late payment
fee %, rounding, "amount in words", konversi mata uang dasar, "also act
as delivery note". Field `Tax Code` disederhanakan jadi `tax_rate_percent`
langsung per baris (bukan tabel kode pajak terpisah) untuk MVP ini.

## 5. Alur Status (dihitung, bukan disimpan)

```
Faktur dibuat → langsung posting jurnal
        │
        ▼
   balanceDue = invoiceAmount (belum ada Receipts/Credit Note apa pun)
        │
        ├── hari ini ≤ due_date  →  status: Unpaid
        └── hari ini > due_date  →  status: Overdue

   (status Paid baru mungkin muncul setelah modul Receipts ada,
    yang mengurangi balanceDue sampai ≤ 0)
```

## 6. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Buat Faktur", kotak pencarian.
- **Filter**: status (Unpaid/Overdue/Paid/semua).
- **Kolom**: Issue Date, Due Date, Reference, Customer, Description,
  Invoice Amount, Balance Due, Status (badge warna), Aksi (Edit, Hapus).
- **Baris total (footer)**: total Invoice Amount dan total Balance Due.

## 7. Spesifikasi Form Tambah/Edit

**Header:**

| Field | Komponen | Validasi |
|---|---|---|
| Customer | Dropdown | Wajib |
| Issue Date | Date picker | Wajib, default hari ini |
| Due Date | Date picker | Opsional, auto dari pengaturan customer |
| Reference | Text input | Opsional |
| Billing Address | Textarea | Opsional, auto dari customer |
| Description | Text input | Opsional |

**Baris item (tabel dinamis):**

| Field | Komponen | Validasi |
|---|---|---|
| Account (Income) | Dropdown (COA kategori Revenue) | Wajib |
| Description | Text input | Opsional |
| Qty | Number input | Wajib, > 0 |
| Unit Price | Number input | Wajib, ≥ 0 |
| Subtotal | Otomatis | Read-only |
| Tax Rate (%) | Number input | Opsional, default 0 |
| Tax Amount | Otomatis | Read-only |
| Total baris | Otomatis | Read-only |

## 8. Contoh Data

```json
{
  "customerId": "<id PT Telekomindo Sentosa>",
  "reference": "INV/2026/09/001",
  "issueDate": "2026-09-22",
  "dueDate": "2026-10-06",
  "billingAddress": "Jl. Jend. Sudirman No. 45, Jakarta",
  "lines": [
    {
      "accountId": "<id akun 'Pendapatan Penjualan'>",
      "description": "Jasa Konsultasi IT - September 2026",
      "quantity": 1,
      "unitPrice": 15000000,
      "taxRatePercent": 0
    }
  ]
}
```

## 9. Relasi dengan Modul Lain

- **Customers**: `customer_id`; `accountsReceivable` pelanggan otomatis
  bertambah (perhitungan ini sudah disiapkan sejak modul Customers
  dibuat).
- **Chart of Accounts**: debit Accounts Receivable, kredit Income +
  Tax Payable.
- **Sales Quotes, Sales Orders, Delivery Notes, Credit Notes, Receipts,
  Late Payment Fees, Inventory Items** (semua modul mendatang):
  disebutkan di dokumen resmi sebagai relasi, TAPI belum diimplementasikan
  di tahap ini karena modul-modulnya belum ada — `balanceDue` untuk
  sekarang akan selalu sama dengan `invoiceAmount`.

## 10. Endpoint API

Base path: `/businesses/:businessId/sales-invoices` (TANPA prefix `/api`,
konsisten dengan endpoint lain di project ini — dokumen resmi menulis
`/api/businesses/...` tapi itu tidak diikuti di sini).

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/sales-invoices` | listSalesInvoices | List (paginated), `?q=`, `?status=` |
| GET | `/businesses/:businessId/sales-invoices/:invoiceId` | getSalesInvoice | Detail + baris item + balanceDue + status |
| POST | `/businesses/:businessId/sales-invoices` | createSalesInvoice | Buat faktur (header+lines) DAN langsung posting jurnal dalam satu transaction |
| PUT | `/businesses/:businessId/sales-invoices/:invoiceId` | updateSalesInvoice | Update, susun ulang jurnal |
| DELETE | `/businesses/:businessId/sales-invoices/:invoiceId` | deleteSalesInvoice | Soft-delete faktur + jurnal terkait |

Endpoint `POST .../chart-of-accounts/reorder` yang disebut di dokumen
resmi tidak relevan di sini (itu punya modul Chart of Accounts, sudah
selesai duluan).