# Dokumentasi Modul: Debit Notes (Nota Debet / Retur Pembelian)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis Manager.io Kebutuhan Sistem Prioritas 2 Pahrio
> Kaspiyanor, §9

## 1. Tujuan Modul

Mencatat pengurangan Utang Usaha (Accounts Payable) ke Supplier akibat
retur pembelian, diskon susulan, atau koreksi kesalahan tagihan di
Purchase Invoice. **Modul TRANSAKSI** — posting jurnal langsung saat
dibuat, **KEBALIKAN PERSIS dari Credit Notes** yang sudah ada
(Credit Notes ngurangin Piutang/AR, Debit Notes ngurangin Utang/AP).

## 2. Keputusan Desain Penting

1. **Jurnal kebalikan dari Credit Notes**: Debit akun kontrol Accounts
   Payable (ngurangin utang), Kredit akun Expense pilihan per baris
   (reuse `findApControlAccount` yang sudah ada dari Purchase
   Invoices).
2. **TANPA mekanisme Inventory** (qty on hand, nilai persediaan,
   average costing) — project ini belum punya modul Inventory.
   Baris item pakai `account_id` (kategori Expense) kayak Purchase
   Invoices/Credit Notes, BUKAN referensi ke Item/Inventory.
3. **`purchase_invoice_id` OPSIONAL dan MURNI INFORMATIF** — beda dari
   Withholding Tax Receipts yang wajib dan ngurangin `balanceDue`
   invoice spesifik. Di sini, dokumen resmi bilang jurnalnya cuma
   ngurangin AP Supplier secara umum (pola sama kayak Credit Notes
   ke AR Customer), TIDAK terikat buat ngurangin `balanceDue` satu
   invoice tertentu. Dropdown-nya difilter per Supplier yang dipilih,
   TAPI cuma referensi sekali pakai, bukan FK yang mempengaruhi
   perhitungan invoice itu.
4. **TANPA status tersimpan** — dokumen resmi cuma nunjukkin 1 alur
   ("Diterbitkan/Posted" langsung aktif), beda dari Purchase Quotes
   yang punya Draft/Accepted/Rejected. Debit Note yang tersimpan
   langsung final.
5. **"Copy to Purchase Order" DILEWATI** — nggak masuk akal secara
   bisnis (dokumen retur/pengurangan nggak logis dijadiin dasar bikin
   pesanan BARU). Kemungkinan cuma template list aksi yang kebawa dari
   modul lain di dokumen aslinya.
6. **"Clone" DIIMPLEMENTASIKAN** (duplikasi sederhana), pola sama kayak
   Billable Time/Withholding Tax Receipts.
7. **Field `Tax Code`/`Division` per baris DILEWATI** (modul
   pendukungnya belum ada).

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant (mewakili "Staf Utang/AP Specialist") | Buat, ubah, hapus, duplikat nota debet |
| Viewer | Hanya baca |

## 4. Struktur Data

### 4.1 Tabel `debit_notes` (header)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| date | date | Ya | Tanggal penerbitan, default hari ini |
| debit_note_number | varchar(50) | Tidak | Nomor referensi |
| supplier_id | uuid | Ya | FK `contacts` (is_supplier=true) |
| purchase_invoice_id | uuid, nullable | Tidak | FK `purchase_invoices` — referensi informatif, dropdown difilter per Supplier |
| description | text | Tidak | Ringkasan/catatan |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 4.2 Tabel `debit_note_lines` (baris item)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| debit_note_id | uuid | Ya | FK, ON DELETE CASCADE |
| account_id | uuid | Ya | FK `chart_of_accounts` kategori Expense |
| description | varchar(255) | Tidak | Deskripsi barang/jasa yang diretur/dikoreksi |
| quantity | numeric(18,4) | Ya | Default 1 |
| unit_price | numeric(18,2) | Ya | |
| line_total | numeric(18,2) | Ya | quantity × unit_price, dihitung backend |
| sort_order | integer | Ya | Urutan tampil |

### 4.3 Field terhitung

| Field | Cara Hitung |
|---|---|
| totalAmount | Σ(line_total) semua baris |

## 5. Aturan Bisnis

1. **Wajib**: Supplier, `date`, minimal 1 baris dengan `account_id`
   (kategori Expense), `quantity` > 0, `unit_price` ≥ 0.
2. **`purchase_invoice_id` kalau diisi HARUS milik `supplier_id` yang
   sama** (validasi silang, pola sama kayak Late Payment Fees/Delivery
   Notes).
3. **Posting jurnal otomatis SAAT DIBUAT**: **Debit** akun kontrol
   Accounts Payable bisnis (dicari otomatis, reuse
   `findApControlAccount`) sebesar `totalAmount`, dengan `contactId` =
   `supplier_id`; **Kredit** tiap `account_id` baris sebesar
   `line_total`-nya.
4. **Update**: WAJIB repost jurnal kalau `supplier_id` ATAU `lines`
   berubah.
5. **Delete**: soft-delete + jurnalnya, bebas tanpa lock.
6. **RBAC**: create/update/delete/duplikat perlu role `admin` atau
   `accountant`. Viewer hanya GET.

## 6. Alur Status

TIDAK ADA status bertahap. Debit Note yang tersimpan langsung final —
jurnal langsung terbentuk, utang Supplier langsung berkurang.

## 7. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Nota Debet Baru", kotak pencarian (nomor nota,
  nama supplier).
- **Kolom**: Date, Debit Note Number, Supplier, Purchase Invoice
  (kalau ada), Total Amount (rata kanan), Aksi (Edit, Duplikat, Hapus).
- **Baris total (footer)**: total `totalAmount`.

## 8. Spesifikasi Form Tambah/Edit

| Field | Komponen | Validasi |
|---|---|---|
| Date | Date picker | Wajib, default hari ini |
| Debit Note Number | Text input | Opsional |
| Supplier | Dropdown | Wajib |
| Purchase Invoice | Dropdown (Purchase Invoices milik Supplier yang dipilih, reset kalau Supplier diganti) | Opsional |
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
  "date": "2026-08-20",
  "debitNoteNumber": "DN-2026-001",
  "supplierId": "<id PT Mitra Perdana>",
  "purchaseInvoiceId": "<id PI-2026-089>",
  "description": "Retur 5 Pcs Barang Cacat",
  "lines": [
    {
      "accountId": "<id akun Expense terkait>",
      "description": "Barang Cacat",
      "quantity": 5,
      "unitPrice": 200000
    }
  ]
}
```

Jurnal: Debit Utang Usaha (PT Mitra Perdana) 1.000.000, Kredit akun
Expense terkait 1.000.000.

## 10. Relasi dengan Modul Lain

- **Suppliers**: `supplier_id`; `accountsPayable` berkurang (live,
  pola sama kayak Credit Notes ke AR).
- **Purchase Invoices**: `purchase_invoice_id` opsional, murni
  referensi (TIDAK mempengaruhi `balanceDue` invoice itu).
- **Chart of Accounts**: debit akun kontrol AP (otomatis), kredit akun
  Expense pilihan user per baris.

## 11. Endpoint API

Base path: `/businesses/:businessId/debit-notes`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/debit-notes` | listDebitNotes | List (paginated), `?q=` |
| GET | `/businesses/:businessId/debit-notes/:id` | getDebitNote | Detail + baris item + totalAmount |
| POST | `/businesses/:businessId/debit-notes` | createDebitNote | Buat + posting jurnal |
| PUT | `/businesses/:businessId/debit-notes/:id` | updateDebitNote | Update, susun ulang jurnal |
| DELETE | `/businesses/:businessId/debit-notes/:id` | deleteDebitNote | Soft-delete + jurnal terkait |
| POST | `/businesses/:businessId/debit-notes/:id/copy` | copyDebitNote | Duplikat jadi record baru (Date default hari ini) |

Semua endpoint tulis perlu role `admin`/`accountant`; GET boleh semua
role.