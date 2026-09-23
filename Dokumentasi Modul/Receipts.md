# Dokumentasi Modul: Receipts (Penerimaan Kas/Bank)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis Fitur dan Kebutuhan Sistem Manager intern - Aulia, §3

## 1. Tujuan Modul

Mencatat setiap penerimaan/pemasukan uang ke akun Bank atau Kas
perusahaan — baik dari pelunasan pelanggan, refund dari supplier, maupun
penerimaan lain di luar transaksi penjualan biasa. **Berbeda dari Sales
Invoices**: modul ini BUKAN sistem alokasi pembayaran ke faktur
tertentu, melainkan pencatatan kas-masuk generik yang langsung membentuk
jurnal — tidak ada status "Unpaid/Overdue/Paid" sama sekali, begitu
disimpan langsung dianggap selesai.

## 2. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Catat, ubah, hapus penerimaan |
| Viewer | Hanya baca |

## 3. Struktur Data

### 3.1 Tabel `receipts` (header)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| date | date | Ya | Tanggal penerimaan, default hari ini |
| reference | varchar(50) | Tidak | Nomor referensi, teks bebas (opsi "Automatic" di Manager.io TIDAK diimplementasikan di MVP ini — user isi manual atau kosongkan) |
| bank_account_id | uuid | Ya | FK ke `bank_accounts` ("Received in" — akun bank/kas tujuan) |
| contact_id | uuid, nullable | Tidak | FK ke `contacts` ("Paid by" — siapa pun: customer, supplier, atau kontak lain, TANPA pembatasan tipe) |
| description | text | Tidak | Keterangan penerimaan |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 3.2 Tabel `receipt_lines` (baris item)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| receipt_id | uuid | Ya | FK, ON DELETE CASCADE |
| account_id | uuid | Ya | FK ke `chart_of_accounts` — akun pendapatan/kategori tujuan kredit. TIDAK dibatasi ke kategori Revenue saja (di Manager.io defaultnya akun "Suspense" yang bisa kategori apa pun) — MVP ini terima kategori Revenue ATAU Equity ATAU Liability (fleksibel, sesuai kebutuhan nyata pencatatan kas masuk yang beragam) |
| description | varchar(255) | Tidak | Deskripsi baris |
| amount | numeric(18,2) | Ya | Nominal, > 0 |
| sort_order | integer | Ya | Urutan tampil |

### 3.3 Field terhitung

Tidak ada field status/balance yang dihitung — modul ini nggak punya
konsep "sisa tagihan". `totalAmount` = Σ(amount) semua baris, ditampilkan
di UI tapi murni buat display, bukan dipakai buat validasi status.

## 4. Aturan Bisnis

1. **Wajib**: pilih `bank_account_id`, minimal 1 baris dengan `account_id`
   dan `amount` > 0.
2. **Posting jurnal otomatis SAAT DIBUAT**: **Debit** akun COA yang
   terhubung ke `bank_account_id` yang dipilih (ambil dari
   `bankAccounts.accountId`) sebesar total `amount`; **Kredit** tiap
   `account_id` di baris item sebesar `amount` masing-masing.
3. **Update**: ganti baris item / bank_account_id akan menyusun ulang
   jurnal (soft-delete jurnal lama, posting jurnal baru), dalam 1
   transaction — **PENTING** ikuti pelajaran dari Purchase Invoices:
   trigger reposting kalau `bank_account_id` ATAU `lines` berubah, bukan
   cuma salah satu.
4. **Delete**: soft-delete receipt + jurnalnya, bebas tanpa validasi lock
   (belum ada modul yang "mengunci" receipt).
5. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

## 5. Alur Status

Tidak ada alur status. Receipt yang tersimpan otomatis "selesai" dan
langsung menambah `currentBalance` akun Bank/Kas yang dipilih (lewat
jurnal, bukan kolom terpisah — `currentBalance` BankAccounts sudah
didesain live-query dari jurnal sejak awal, jadi otomatis benar tanpa
perubahan tambahan).

## 6. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Catat Penerimaan", kotak pencarian (reference,
  description, nama kontak).
- **Kolom**: Date, Reference, Received in (nama bank/kas), Paid by (nama
  kontak, kalau ada), Description, Total Amount, Aksi (Edit, Hapus).
- **Baris total (footer)**: total `totalAmount` dari receipt yang tampil.

## 7. Spesifikasi Form Tambah/Edit

**Header:**

| Field | Komponen | Validasi |
|---|---|---|
| Date | Date picker | Wajib, default hari ini |
| Reference | Text input | Opsional |
| Received in | Dropdown (Bank and Cash Accounts) | Wajib |
| Paid by | Dropdown (Contacts — semua kontak, customer maupun supplier) | Opsional |
| Description | Text input | Opsional |

**Baris item (tabel dinamis):**

| Field | Komponen | Validasi |
|---|---|---|
| Account | Dropdown (Chart of Accounts, semua kategori kecuali Asset — supaya nggak dobel-catat dengan akun bank/kas sendiri) | Wajib |
| Description | Text input | Opsional |
| Amount | Number input | Wajib, > 0 |

## 8. Contoh Data

```json
{
  "date": "2026-09-23",
  "bankAccountId": "<id akun Kas Kantor>",
  "contactId": "<id PT Media Cepat Indonesia, kalau ada di contacts>",
  "description": "Penerimaan pembayaran jasa dari PT Media Cepat Indonesia",
  "lines": [
    {
      "accountId": "<id akun Pendapatan Penjualan>",
      "description": "Pelunasan jasa",
      "amount": 100000
    }
  ]
}
```

## 9. Relasi dengan Modul Lain

- **Bank and Cash Accounts**: `bank_account_id`; `currentBalance` akun
  ini otomatis bertambah (live query, sudah ada dari awal).
- **Customers & Suppliers**: `contact_id` opsional, murni referensi/
  catatan siapa yang membayar — TIDAK mengurangi `accountsReceivable`/
  `accountsPayable` kontak tsb secara otomatis di MVP ini (itu baru akan
  relevan kalau nanti dibuat mekanisme "alokasi ke invoice" terpisah,
  di luar cakupan modul Receipts versi Manager.io yang dianalisis).
- **Chart of Accounts**: debit ke akun Bank/Kas, kredit ke akun pilihan
  user per baris.

## 10. Endpoint API

Base path: `/businesses/:businessId/receipts`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/receipts` | listReceipts | List (paginated), `?q=` |
| GET | `/businesses/:businessId/receipts/:receiptId` | getReceipt | Detail + baris item |
| POST | `/businesses/:businessId/receipts` | createReceipt | Buat + langsung posting jurnal |
| PUT | `/businesses/:businessId/receipts/:receiptId` | updateReceipt | Update, susun ulang jurnal |
| DELETE | `/businesses/:businessId/receipts/:receiptId` | deleteReceipt | Soft-delete + jurnal terkait |

Semua endpoint tulis perlu role `admin`/`accountant`; GET boleh semua
role.