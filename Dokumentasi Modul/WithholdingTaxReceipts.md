# Dokumentasi Modul: Withholding Tax Receipts (Bukti Potong PPh)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis Manager.io Kebutuhan Sistem Prioritas 2 Pahrio
> Kaspiyanor, §7

## 1. Tujuan Modul

Mencatat bukti pemotongan pajak (PPh) yang diterbitkan pelanggan saat
membayar Sales Invoice. Nilai pajak yang dipotong pelanggan **mengurangi
piutang** bisnis ke pelanggan itu, TANPA lewat alur penerimaan kas/bank
(beda dari Receipts) — diakui sebagai aset "Pajak Dibayar di Muka".

## 2. Keputusan Desain Penting

1. **INI MEKANISME PERTAMA yang beneran ngurangin `balanceDue` Sales
   Invoices.** Selama ini `SalesInvoiceRepository.balanceDue` SELALU
   `= invoiceAmount` (belum ada mekanisme pelunasan sebagian kayak
   Payments→Purchase Invoice). Modul ini WAJIB mengubah
   `SalesInvoiceRepository` supaya `balanceDue` benar-benar live:
   `invoiceAmount − Σ(amount Withholding Tax Receipt aktif untuk
   invoice itu)` — pola PERSIS sama kayak yang udah dilakuin ke
   `PurchaseInvoiceRepository` waktu modul Payments dibangun.
2. **Status "Applied/Unapplied" DISEDERHANAKAN**: karena kita WAJIB
   validasi `amount` nggak boleh melebihi `balanceDue` invoice SAAT
   record dibuat (aturan bisnis §4 dokumen), skenario "Unapplied"
   (kelebihan potong) nggak akan pernah kejadian di sistem kita — jadi
   status di response SELALU `"Applied"` (informational aja, nggak
   perlu logic tambahan).
3. **"Locked Period"** (aturan #3 dokumen resmi) — SENGAJA DILEWATI,
   project ini belum punya konsep periode akuntansi yang dikunci (sama
   kayak yang udah dilewatin di modul Journal Entries).
4. **Tombol "View" digabung ke "Edit"** — konsisten sama pola SEMUA
   modul lain di project ini.
5. **"Clone"** — DIIMPLEMENTASIKAN (duplikasi data sederhana, sama pola
   kayak fitur copy di Billable Time), bukan Print/PDF yang perlu
   infrastruktur cetak.

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant (mewakili "Admin" & "Staf Piutang" dokumen resmi) | Catat, ubah, hapus, duplikat bukti potong |
| Viewer | Hanya baca |

## 4. Struktur Data

### 4.1 Tabel `withholding_tax_receipts` (TANPA baris item terpisah)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| date | date | Ya | Tanggal bukti potong diterbitkan, default hari ini |
| customer_id | uuid | Ya | FK `contacts` (is_customer=true) |
| sales_invoice_id | uuid | Ya | FK `sales_invoices` — invoice yang dipotong |
| withholding_tax_account_id | uuid | Ya | FK `chart_of_accounts` kategori Asset (akun "Pajak Dibayar di Muka") |
| amount | numeric(18,2) | Ya | Nominal pajak yang dipotong, > 0 |
| reference | varchar(50) | Tidak | Nomor bukti potong resmi |
| description | text | Tidak | Catatan tambahan |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 4.2 Field terhitung

| Field | Cara Hitung |
|---|---|
| status | SELALU `"Applied"` (lihat §2.2) |

## 5. Aturan Bisnis

1. **Wajib**: `date`, Customer, Sales Invoice (harus milik Customer
   yang sama), Withholding Tax Account (kategori Asset), `amount` > 0.
2. **`amount` TIDAK BOLEH melebihi `balanceDue` Sales Invoice SAAT INI**
   (dihitung live, exclude alokasi lama punya record ini sendiri kalau
   lagi update — pola sama persis kayak validasi Payments→Purchase
   Invoice).
3. **Posting jurnal otomatis SAAT DIBUAT**: **Debit**
   `withholding_tax_account_id` sebesar `amount`; **Kredit** akun
   kontrol Accounts Receivable bisnis (dicari otomatis, reuse
   `findArControlAccount`) sebesar `amount` juga, dengan `contactId` =
   `customer_id`.
4. **Update**: WAJIB repost jurnal kalau `sales_invoice_id`,
   `withholding_tax_account_id`, `customer_id`, ATAU `amount` berubah.
5. **Delete**: soft-delete record + jurnalnya, bebas tanpa lock (balik
   ngurangin, `balanceDue` invoice otomatis naik lagi).
6. **RBAC**: create/update/delete/duplikat perlu role `admin` atau
   `accountant`. Viewer hanya GET.

## 6. Alur Status

```
Bukti potong diterima dari pelanggan
        │
        ▼
Dicatat di sistem: validasi amount ≤ balanceDue invoice saat ini
        │
        ▼
Posting jurnal: Debit Pajak Dibayar di Muka, Kredit Piutang Usaha
        │
        ▼
balanceDue Sales Invoice berkurang otomatis (live), status "Applied"
```

## 7. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Bukti Potong Baru", kotak pencarian (reference,
  nama customer).
- **Kolom**: Date, Reference, Customer, Sales Invoice, Withholding Tax
  Account, Amount (rata kanan), Aksi (Edit, Duplikat, Hapus).
- **Baris total (footer)**: total `amount`.

## 8. Spesifikasi Form Tambah/Edit

| Field | Komponen | Validasi |
|---|---|---|
| Date | Date picker | Wajib, default hari ini |
| Customer | Dropdown (Customers) | Wajib |
| Sales Invoice | Dropdown (Sales Invoices milik Customer yang dipilih, TAMPILKAN `balanceDue`-nya, reset pilihan kalau Customer diganti) | Wajib |
| Withholding Tax Account | Dropdown (COA kategori Asset) | Wajib |
| Amount | Number input | Wajib, > 0, TIDAK BOLEH melebihi `balanceDue` invoice yang dipilih (validasi frontend bantu UX, backend tetap wajib validasi ulang) |
| Reference | Text input | Opsional |
| Description | Text input | Opsional |

## 9. Contoh Data

```json
{
  "date": "2026-08-15",
  "customerId": "<id PT Nusantara Jaya>",
  "salesInvoiceId": "<id INV-2026-004>",
  "withholdingTaxAccountId": "<id akun PPh Pasal 23 Dibayar Di Muka>",
  "amount": 400000,
  "reference": "WHT-2026-08-0012"
}
```

## 10. Relasi dengan Modul Lain

- **Customers**: `customer_id`.
- **Sales Invoices**: `sales_invoice_id` WAJIB — `balanceDue`
  berkurang (lihat §2.1, perubahan wajib di `SalesInvoiceRepository`).
- **Chart of Accounts**: debit akun Asset pilihan user, kredit akun
  kontrol Accounts Receivable (otomatis, sama pola Sales Invoices/
  Credit Notes).

## 11. Endpoint API

Base path: `/businesses/:businessId/withholding-tax-receipts`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/withholding-tax-receipts` | listWithholdingTaxReceipts | List (paginated), `?q=` |
| GET | `/businesses/:businessId/withholding-tax-receipts/:id` | getWithholdingTaxReceipt | Detail |
| POST | `/businesses/:businessId/withholding-tax-receipts` | createWithholdingTaxReceipt | Buat + posting jurnal |
| PUT | `/businesses/:businessId/withholding-tax-receipts/:id` | updateWithholdingTaxReceipt | Update, susun ulang jurnal |
| DELETE | `/businesses/:businessId/withholding-tax-receipts/:id` | deleteWithholdingTaxReceipt | Soft-delete + jurnal terkait |
| POST | `/businesses/:businessId/withholding-tax-receipts/:id/copy` | copyWithholdingTaxReceipt | Duplikat jadi record baru (Date default hari ini) — TETAP tervalidasi ulang terhadap `balanceDue` invoice saat proses duplikasi (bisa ditolak kalau `balanceDue` invoice sekarang udah nggak cukup) |

Semua endpoint tulis perlu role `admin`/`accountant`; GET boleh semua
role.