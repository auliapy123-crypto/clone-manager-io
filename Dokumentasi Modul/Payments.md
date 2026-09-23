# Dokumentasi Modul: Payments (Pengeluaran Kas/Bank)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis Fitur dan Kebutuhan Sistem Manager intern - Aulia, §2

## 1. Tujuan Modul

Mencatat setiap pengeluaran uang dari akun Bank/Kas — baik buat
melunasi Purchase Invoice tertentu (mengurangi `balanceDue`-nya), maupun
pembayaran umum lain yang nggak terkait invoice (beli aset, bayar beban,
prive pemilik, dst).

**Beda penting dari Receipts**: Payments punya mekanisme **alokasi ke
Purchase Invoice** — kalau baris item pilih akun kategori Liability
(kontrol Accounts Payable) dan Supplier tertentu, sistem nunjukkin daftar
Purchase Invoice supplier itu yang masih punya tagihan, dan nominal yang
dialokasikan ke situ langsung ngurangin `balanceDue` invoice tsb. Ini
titik di mana `balanceDue` Purchase Invoices (yang selama ini selalu
`= invoiceAmount`) AKHIRNYA benar-benar berfungsi.

**Sengaja DITUNDA di MVP ini** (di luar cakupan sekarang, terkait ke
modul Bank Reconciliations nanti): status "Cleared" vs "Pending
Withdrawals" berdasarkan pengaturan `canHavePendingTransactions` akun
bank. Semua Payment di versi ini langsung dianggap "Cleared" (final, sama
kayak Receipts — nggak ada status tersimpan).

## 2. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Catat, ubah, hapus pembayaran |
| Viewer | Hanya baca |

## 3. Struktur Data

### 3.1 Tabel `payments` (header)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| date | date | Ya | Default hari ini |
| reference | varchar(50) | Tidak | Nomor referensi |
| bank_account_id | uuid | Ya | FK `bank_accounts` ("Paid from") |
| contact_id | uuid | Ya | FK `contacts` ("Payee" — WAJIB, beda dari Receipts yang opsional; boleh kontak mana pun, bukan cuma Supplier) |
| description | text | Tidak | Keterangan |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 3.2 Tabel `payment_lines` (baris item)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| payment_id | uuid | Ya | FK, ON DELETE CASCADE |
| account_id | uuid | Ya | FK `chart_of_accounts`. TIDAK dibatasi ke kategori Revenue (uang keluar nggak masuk akal dibayarkan ATAS NAMA akun pendapatan) — terima Asset/Liability/Equity/Expense |
| purchase_invoice_id | uuid, nullable | Tidak | FK `purchase_invoices` — diisi KALAU baris ini melunasi invoice tertentu. Kalau diisi, `account_id` baris ini WAJIB akun kontrol Accounts Payable bisnis, dan invoice tsb harus milik `contact_id` header |
| description | varchar(255) | Tidak | Deskripsi baris |
| amount | numeric(18,2) | Ya | Nominal, > 0 |
| sort_order | integer | Ya | Urutan tampil |

### 3.3 Field terhitung

`totalAmount` = Σ(amount) semua baris, murni buat display. Tidak ada
status tersimpan (selalu "Cleared" — lihat catatan di §1).

## 4. Aturan Bisnis

1. **Wajib**: pilih `bank_account_id`, `contact_id`, minimal 1 baris
   dengan `account_id` dan `amount` > 0.
2. **Validasi alokasi invoice**: kalau baris punya `purchase_invoice_id`:
   - `account_id` baris itu HARUS akun kontrol Accounts Payable bisnis
     (dicari otomatis, sama pola kayak Sales/Purchase Invoices).
   - Invoice tsb harus milik `contact_id` yang sama dengan header Payment.
   - `amount` baris itu TIDAK BOLEH melebihi `balanceDue` invoice tsb
     SAAT INI (dihitung ulang tiap kali, karena bisa aja udah dibayar
     sebagian oleh Payment lain sebelumnya).
3. **Posting jurnal otomatis SAAT DIBUAT**: **Debit** tiap `account_id`
   baris sebesar `amount`-nya; **Kredit** akun COA yang terhubung ke
   `bank_account_id` sebesar total `amount` semua baris.
4. **`balanceDue` Purchase Invoice** dihitung ulang: `invoiceAmount −
   Σ(amount dari payment_lines yang purchase_invoice_id-nya invoice itu,
   DAN payment header-nya belum di-soft-delete)`.
5. **Update**: WAJIB repost jurnal kalau `bank_account_id`, `contact_id`,
   ATAU `lines` berubah (ikuti pelajaran #3 CLAUDE.md).
6. **Delete**: soft-delete payment + jurnalnya. Karena ini otomatis
   ngurangin alokasi ke invoice terkait (balanceDue invoice itu balik
   naik), TIDAK butuh validasi lock tambahan — bebas dihapus.
7. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

## 5. Alur Status

Tidak ada alur status tersimpan (lihat catatan §1 soal Cleared/Pending
yang ditunda). Payment yang tersimpan otomatis final, langsung
mengurangi `currentBalance` bank/kas sumber dan `balanceDue` invoice yang
dialokasikan (kalau ada).

## 6. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Catat Pembayaran", kotak pencarian.
- **Kolom**: Date, Reference, Paid from (nama bank/kas), Payee (nama
  kontak), Description, Total Amount, Aksi.
- **Baris total (footer)**: total `totalAmount`.

## 7. Spesifikasi Form Tambah/Edit

**Header:**

| Field | Komponen | Validasi |
|---|---|---|
| Date | Date picker | Wajib, default hari ini |
| Reference | Text input | Opsional |
| Paid from | Dropdown (Bank and Cash Accounts aktif) | Wajib |
| Payee | Dropdown (Contacts — semua kontak) | Wajib |
| Description | Text input | Opsional |

**Baris item (tabel dinamis):**

| Field | Komponen | Validasi |
|---|---|---|
| Account | Dropdown (Chart of Accounts, semua kategori kecuali Revenue) | Wajib |
| Invoice | Dropdown (Purchase Invoices milik Payee yang masih ada `balanceDue` > 0) — MUNCUL CUMA kalau Account yang dipilih = akun kontrol Accounts Payable | Kondisional |
| Description | Text input | Opsional |
| Amount | Number input | Wajib, > 0, tidak boleh lebih dari `balanceDue` invoice kalau baris itu teralokasi ke invoice |

## 8. Contoh Data

```json
{
  "date": "2026-09-23",
  "bankAccountId": "<id Kas Kantor Pusat>",
  "contactId": "<id CV Sumber Makmur>",
  "description": "Pelunasan invoice PI-2026-001",
  "lines": [
    {
      "accountId": "<id akun kontrol Accounts Payable, otomatis>",
      "purchaseInvoiceId": "<id Purchase Invoice yang dilunasi>",
      "amount": 500000
    }
  ]
}
```

## 9. Relasi dengan Modul Lain

- **Bank and Cash Accounts**: `bank_account_id`; `currentBalance`
  berkurang (live query, sudah ada).
- **Suppliers (Contacts)**: `contact_id` sebagai Payee.
- **Purchase Invoices**: `purchase_invoice_id` opsional per baris —
  ngurangin `balanceDue` invoice tsb secara real-time. **PENTING**:
  `PurchaseInvoiceRepository.getPurchaseInvoiceById`/`listPurchaseInvoices`
  PERLU DIUBAH supaya `balanceDue` ikut menghitung alokasi Payment ini
  (sebelumnya selalu `= invoiceAmount`).
- **Chart of Accounts**: debit ke akun pilihan user per baris, kredit ke
  akun Bank/Kas.

## 10. Endpoint API

Base path: `/businesses/:businessId/payments`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/payments` | listPayments | List (paginated), `?q=` |
| GET | `/businesses/:businessId/payments/:paymentId` | getPayment | Detail + baris item |
| POST | `/businesses/:businessId/payments` | createPayment | Buat + posting jurnal |
| PUT | `/businesses/:businessId/payments/:paymentId` | updatePayment | Update, susun ulang jurnal |
| DELETE | `/businesses/:businessId/payments/:paymentId` | deletePayment | Soft-delete + jurnal terkait |

Tambahan (opsional tapi berguna buat UX form): endpoint yang sudah ada
`GET /businesses/:businessId/purchase-invoices?status=Unpaid&q=<supplierId>`
bisa dipakai buat isi dropdown "Invoice" di form (filter manual di
frontend berdasar `supplierId`, nggak perlu endpoint baru).