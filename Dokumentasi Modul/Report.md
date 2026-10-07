# Modul Reports (Tahap 1)

> Sumber: screenshot Manager.io asli (halaman indeks Reports + form "New Report" untuk Trial Balance, Profit and Loss Statement, Balance Sheet). Layout HASIL laporan belum terverifikasi dari screenshot; bagian itu ditandai **[ASUMSI]**.

## 1. Konsep
- Halaman **Reports** = indeks 8 grup, 28 laporan (Financial Statements, Cash & cash equivalents, General Ledger, Customers, Suppliers, Sales Invoices, Fixed Assets, Intangible Assets, Billable Time, Custom Reports).
- Klik satu jenis laporan -> daftar **laporan tersimpan** (awalnya kosong) + tombol **New Report**.
- New Report = form parameter -> **Create** -> definisi tersimpan. Klik definisi -> laporan **dihitung saat itu juga** dari buku besar. **Isi laporan TIDAK disimpan**, hanya definisinya.
- Modul ini tidak membuat dokumen posting. Hanya MEMBACA jurnal modul lain.

## 2. Cakupan Tahap 1
Dikerjakan: halaman indeks, tabel `report_definitions`, dan 3 jenis laporan yang formnya sudah terlihat:
1. Trial Balance
2. Profit and Loss Statement
3. Balance Sheet

Tahap 1b (setelah 1 lolos uji): General Ledger Summary, General Ledger Transactions.
Tahap 2/3: laporan Customers, Suppliers, Cash, Sales Invoices, Billable Time.
Ditunda: Actual vs Budget (tidak ada modul budget), Cash Flow, Changes in Equity, laporan Fixed/Intangible Assets, Custom Reports.
Item yang ditunda tampil di indeks sebagai teks abu-abu non-klik "Segera".

## 3. Struktur Data: `report_definitions`
| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid PK | |
| business_id | uuid FK | wajib, dari URL |
| type | varchar | `trial_balance` / `profit_and_loss` / `balance_sheet` |
| title | varchar(200) | wajib; default = nama laporan |
| description | text null | opsional |
| date_from | date null | TB dan P&L |
| date_to | date null | TB dan P&L |
| as_of_date | date null | Balance Sheet (field "Date") |
| accounting_method | varchar | hanya `accrual` di Tahap 1 |
| show_account_codes | bool default false | |
| exclude_zero_balances | bool default false | |
| footer | text null | P&L dan BS |
| created_at, updated_at, deleted_at | timestamp | soft delete |

Aturan: validasi per `type` (TB/P&L wajib from+to, from <= to; BS wajib as_of_date). Field yang tidak relevan ditolak atau diabaikan konsisten. Index `(business_id, type) WHERE deleted_at IS NULL`.

**Tidak dibawa dulu (ada di Manager.io, tampil nonaktif/disembunyikan):** Add comparative column, Column name, Rounding, Groups to collapse, Layout Balance Sheet selain "Assets - Liabilities = Equity", Accounting method "Cash basis". Tombol **Clone** dan unduh **PDF** di halaman hasil juga ditunda (Tahap 1: Edit + Print browser saja). Field tanggal yang tidak relevan untuk tipenya DIABAIKAN, bukan error (BS abaikan from/to; TB/P&L abaikan as_of_date).

## 4. Perhitungan (dari jurnal, bukan dari kolom saldo)
Sumber WAJIB sama dengan yang dipakai modul posting (agent mencari tabel jurnal/ledger yang sebenarnya; JANGAN mengarang nama tabel). Hanya baris dari dokumen aktif (tidak soft-deleted) dan berstatus posting.

- **Trial Balance [ASUMSI kecuali baris Net profit — terverifikasi screenshot]:** per akun, kolom Debit dan Credit. Akun neraca = saldo kumulatif sampai `date_to`; akun laba rugi = mutasi dalam from..to (kolom `From` tidak berpengaruh ke akun neraca — itu perilaku resmi, bukan bug). Setelah bagian Expenses tampil baris **Net profit (loss) = Total Income − Total Expenses** periode tersebut. Baris Total Debit dan Total Credit **harus sama**. Header hasil tampil `As at {date_to}`.
- **Profit and Loss:** pendapatan dikurangi beban dalam from..to, dikelompokkan menurut grup di Chart of Accounts. Ada baris total per grup dan **Net Profit**.
- **Balance Sheet:** posisi sampai `as_of_date`. Urutan seksi: Assets, Liabilities, baris **Net assets (= Assets − Liabilities)**, Equity, baris **Total Equity yang harus = Net assets**. Laba berjalan (net profit s.d. tanggal itu) **digabung ke baris Retained earnings** (tanpa baris laba-berjalan terpisah, mengikuti Manager.io). Assets **harus** = Liabilities + Equity.
- `exclude_zero_balances` menyembunyikan akun bersaldo 0. `show_account_codes` menampilkan kode akun.
- Sisi saldo mengikuti normal balance kategori akun (aset/beban = debit, lainnya = kredit). Agent wajib mengecek bagaimana COA proyek menyimpan kategori.

## 5. Endpoint (tanpa prefix /api)
| Method | Path | operationId |
|---|---|---|
| GET | /businesses/:businessId/report-definitions?type=&page=&pageSize= | listReportDefinitions |
| POST | /businesses/:businessId/report-definitions | createReportDefinition |
| GET | /businesses/:businessId/report-definitions/:id | getReportDefinition |
| PUT | /businesses/:businessId/report-definitions/:id | updateReportDefinition |
| DELETE | /businesses/:businessId/report-definitions/:id | deleteReportDefinition |
| GET | /businesses/:businessId/report-definitions/:id/result | getReportResult |

RBAC: admin/accountant tulis; viewer baca (termasuk result). Audit log untuk create/update/delete. `pageSize` maks 100.

## 6. Frontend
- Menu "Reports" di `menuConfig.ts` -> `/reports`.
- `/reports`: 8 grup kartu seperti screenshot; link jenis yang sudah ada -> `/reports/$type`.
- `/reports/$type`: daftar definisi (search, pagination 10, tombol New Report).
- `/reports/$type/new` dan `/$id/edit`: form sesuai bagian 3 (accounting method hanya Accrual).
- `/reports/$type/$id`: tampilan hasil + tombol Edit dan Print (cetak browser).
- Angka di hasil laporan HARUS ikut **Obscure mode** (pakai mekanisme yang sudah ada).

## 7. Celah yang harus ditutup
1. Hasil tidak boleh membocorkan data bisnis lain: semua query difilter `business_id` dari URL.
2. Dokumen soft-deleted dan draft tidak boleh ikut terhitung.
3. Definisi soft-deleted tidak bisa dibuka (404).
4. `type` di URL divalidasi terhadap daftar yang diizinkan.
5. Rentang tanggal terbalik atau tidak valid ditolak 400, bukan 500.
6. Aritmetika uang memakai tipe yang sama dengan modul lain (jangan float mentah).
7. Rentang tanggal sangat besar tetap harus selesai wajar (query teragregasi di SQL, bukan loop di JS).
## 8. Tahap 1b: General Ledger Summary, General Ledger Transactions, Aged Receivables

> Sumber: screenshot Manager.io asli (form + hasil ketiganya). Prinsip sama:
> definisi tersimpan, isi dihitung live, tanpa posting.

### 8.1 Perubahan indeks
Tiga item menjadi aktif (biru, bisa diklik): General Ledger Summary +
General Ledger Transactions (grup General Ledger), Aged Receivables
(grup Customers). Sisanya tetap "Segera".

### 8.2 Kolom baru `report_definitions` (nullable semua)
| Kolom | Tipe | Dipakai |
|---|---|---|
| account_id | uuid null | GL Transactions: filter 1 akun (null = semua akun) |
| sort_by | varchar null | Aged Receivables: `total`/`name`, default `total` |
| show_invoices | bool default false | Aged Receivables: rincian per faktur |

`accounting_method` dan `title`: ketiga form 1b TIDAK punya field Title
maupun Accounting method (terverifikasi screenshot) — `title` wajib diisi
default nama jenis laporan bila kosong; `accounting_method` diabaikan
untuk ketiga tipe ini (selalu akrual mengikuti buku).

### 8.3 Validasi per tipe
- `general_ledger_summary`: wajib from+to (from <= to).
- `general_ledger_transactions`: wajib from+to; `account_id` opsional
  (kalau diisi harus akun milik bisnis ini, kalau tidak → 400).
- `aged_receivables`: wajib `as_of_date` (satu tanggal); `sort_by`
  selain total/name → 400. Field from/to diabaikan.

### 8.4 Perhitungan
- **GL Summary** per akun: Opening (= saldo kumulatif SEBELUM from),
  Total debits, Total credits (mutasi from..to), Net movement, Closing
  (= opening + movement). Dikelompokkan kategori COA + baris
  **Profit (loss) for the period** (= net P&L periode itu). Saldo
  tampil dengan akhiran Dr/Cr. `exclude_zero_balances` menyembunyikan
  akun ber-closing 0.
- **GL Transactions** per akun: baris transaksi (tanggal, label
  ref/kontak/keterangan, debit, kredit, running balance ber-akhiran
  Dr/Cr). Label disusun dari kolom jurnal yang ADA (agent wajib cek
  struktur asli, jangan mengarang; fallback "-"). Di bawah seksi
  Retained earnings tambah baris sintetis laba periode berjalan.
  Hanya akun ber-mutasi periode itu yang tampil.
- **Aged Receivables** per customer per `as_of_date`: hanya faktur
  dengan issue_date <= as_of dan balanceDue > 0. Bucket dari due_date:
  Current (belum jatuh tempo/tanpa due), 1–30, 31–60, 61–90, 90+ hari
  lewat tempo. Kolom Total per customer + baris total. Sort: total =
  terbesar dulu, name = abjad. `show_invoices` true → baris rincian
  faktur (reference, tanggal, nominal, bucket) di bawah tiap customer.
- **Keterbatasan jujur (dicatat, bukan bug):** umur dihitung dari
  balanceDue SAAT INI (alokasi pembayaran lampau tidak diputar ulang),
  jadi untuk as_of_date = hari ini angkanya persis; untuk tanggal lampau
  sifatnya perkiraan. Uji E2E memakai as_of = hari ini.

### 8.5 Hasil & frontend
Layout kolom mengikuti screenshot (summary 5 kolom + Dr/Cr; transactions
Debit/Credit/Balance; aged 5 bucket + Total). Form per tipe HANYA berisi
field §8.2–§8.3 (tanpa Title, tanpa Accounting method). Route
`/reports/$type` yang sudah ada dipakai ulang tanpa struktur baru.
Angka hasil ikut Obscure mode. Print browser, tanpa Clone/PDF.