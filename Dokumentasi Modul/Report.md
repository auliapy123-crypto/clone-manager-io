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
## 9. Tahap 1c: Aged Payables, Customer Summary, Supplier Summary

> Sumber: screenshot Manager.io asli (form + hasil ketiganya). Nama jenis
> mengikuti Manager.io persis: `aged_payables`, `customer_summary`,
> `supplier_summary` (BUKAN "balance").

### 9.1 Perubahan indeks
Tiga item menjadi aktif: Aged Payables (grup Suppliers), Customer Summary
(grup Customers), Supplier Summary (grup Suppliers). Sisanya tetap "Segera".

### 9.2 Kolom & validasi (tanpa kolom tabel baru)
Ketiga form TIDAK punya Title maupun Accounting method (terverifikasi
screenshot) — `title` default nama jenis laporan bila kosong;
`accounting_method` diabaikan. Validasi:
- `aged_payables`: wajib `as_of_date`; `sort_by` total/name default total;
  `show_invoices` bool. Cermin persis Aged Receivables sisi supplier
  (purchase invoices + live balanceDue).
- `customer_summary` / `supplier_summary`: wajib from+to (from <= to).
  Field lain diabaikan.

### 9.3 Perhitungan
- **Aged Payables** per supplier per `as_of_date`: hanya purchase invoice
  issue_date <= as_of dan balanceDue > 0. Bucket dari due_date: Current
  (belum tempo/tanpa due), 1–30, 31–60, 61–90, 90+ hari. Total per
  supplier + baris total. Sort total = terbesar dulu, name = abjad.
  `show_invoices` true → rincian faktur per supplier. Keterbatasan
  as-of-masa-lalu sama seperti Aged Receivables (uji pakai hari ini).
- **Customer Summary** per customer (from..to): Opening (saldo tepat
  sebelum from), Invoices (Σ invoiceAmount periode), Credit Notes
  (Σ periode, mengurangi), Late payment fees (Σ periode, menambah),
  Closing (= Opening + Invoices − CreditNotes + LateFees). Hanya
  customer ber-opening ≠ 0 atau bermutasi.
- **Supplier Summary** per supplier (from..to): Opening, Invoices
  (Σ purchase invoiceAmount periode), Payments (Σ baris payment periode
  yang teralokasi ke faktur supplier itu; baris tanpa link faktur ikut
  bila akunnya kontrol AP dan payee-nya supplier tsb.), Closing
  (= Opening + Invoices − Payments).
- Relasi tanggal yang dipakai (issue_date CN/fees, payment date, WTR
  date) WAJIB diverifikasi dari struktur asli; kalau kolomnya tidak ada,
  Opening dihitung mundur (live − mutasi periode) dan dicatat sebagai
  penyimpangan + keterbatasan. Jangan mengarang kolom.

### 9.4 Hasil & frontend
Kolom persis screenshot (Customer: Opening, Invoices, Credit Notes, Late
payment fees, Closing; Supplier: Opening, Invoices, Payments, Closing;
masing-masing + baris total). Form per tipe HANYA field §9.2. Route
`/reports/$type` dipakai ulang. Angka ikut Obscure mode. Print browser,
tanpa Clone/PDF.

### 9.5 Implementasi dan struktur asli Neon (7 Oktober 2026)

Verifikasi dilakukan lewat `information_schema.columns` sebelum implementasi;
tidak ada tabel/kolom baru atau DDL.

| Sumber | Relasi dan tanggal yang terverifikasi | Nilai uang |
|---|---|---|
| Sales Invoice | `customer_id`, `issue_date` | `SUM(sales_invoice_lines.line_total)` |
| Credit Note | `customer_id`, `issue_date` | `SUM(credit_note_lines.line_total)` |
| Late Payment Fee | `customer_id`, `sales_invoice_id`, `date` (BUKAN `issue_date`) | `amount` |
| Purchase Invoice | `supplier_id`, `issue_date`, `due_date` nullable | `SUM(purchase_invoice_lines.subtotal)` |
| Payment | `payments.date`, `contact_id`; alokasi di `payment_lines.purchase_invoice_id` | `payment_lines.amount` |
| Withholding Tax Receipt | `customer_id`, `sales_invoice_id`, `date` | `amount` |

Tidak ada tanggal di baris/alokasi payment; tanggal yang dipakai ialah tanggal
header payment. Baris teralokasi mengikuti supplier faktur aktif; baris tanpa
link faktur mengikuti payee header dan hanya masuk bila akunnya kategori
Liability dengan `is_control_account=true`, milik bisnis yang sama dan aktif.
Pembayaran akun beban/Expense Claims tidak masuk Supplier Summary.

Opening merupakan agregasi dokumen aktif dengan tanggal **strictly `< from`**;
mutasi memakai `from <= date <= to`. Dokumen setelah `to` tidak masuk, termasuk
ke Opening. Semua penjumlahan, bucket, Closing, dan total dihitung dalam sen
integer di SQL; konversi ke number/nominal hanya pada batas respons API.
Kontak aktif hanya tampil bila Opening bukan nol atau ada dokumen dalam periode,
termasuk bila mutasinya saling meniadakan. Tidak diperlukan fallback tanggal.

**Batas cakupan §9.3:** summary mengikuti tipe dokumen/kolom dan rumus yang
ditetapkan, bukan keseluruhan saldo jurnal AR/AP. WTR (tanggal tersedia), Debit
Notes, dan jurnal manual tidak menjadi komponen Opening/mutasi summary. Late
Fees justru masuk Customer Summary walaupun modulnya non-posting. Karena itu
summary bisa berbeda dari saldo kontak/buku besar jika bisnis memiliki sumber
tersebut; ini batas cakupan rumus final, bukan fallback kolom hilang. Tidak
ada WTR/Credit Notes/Late Fees aktif pada baseline dummy sesi ini. Ageing
tetap memakai **live balanceDue per faktur** (WTR untuk AR, Payment teralokasi
untuk AP); pembayaran tanpa link faktur tidak mengurangi ageing per faktur.
As-of historis tetap perkiraan sesuai §8.4/§9.3.

Validasi penuh edit dijalankan setelah payload digabung dengan definisi
tersimpan, agar edit tanpa `type` juga mengabaikan field tidak relevan.
Field relevan yang salah, tanggal tidak nyata, rentang terbalik, jenis asing,
dan sort asing pada ageing ditolak 400. Title kosong memakai nama jenis;
accounting method diabaikan pada ketiga tipe 1c. RBAC, audit, soft-delete dan
pagination maksimum 100 memakai infrastruktur yang sama.

### 9.6 Bukti pengujian Tahap 1c (7 Oktober 2026)

Lingkungan: lokal pnpm, backend `http://localhost:4000`, frontend
`http://localhost:3000`, Docker kosong. Business dummy:
`d9d9760c-38a1-4849-a646-4206022f03c1`. Password tidak diubah.

| Uji runtime | Hasil nyata |
|---|---|
| Aged Payables invoice ZZ overdue | Bucket 1–30 = **100,25**, sama dengan live balanceDue; pembayaran teralokasi **30,10** menurunkan keduanya menjadi **70,15** |
| Bucket lain | Due hari ini → Current; tanpa due → Current; overdue 31/61/91 hari → bucket 31–60/61–90/90+, masing-masing **1,01** |
| Aged Payables setelah cleanup | Total kembali **15,00**, seluruhnya Current |
| Customer Summary Pahrio, 1–7 Oktober | Opening **5.550.016,96** + Invoices **16,32** − CN **0** + Fees **0** = Closing **5.550.033,28**; total identik |
| Customer ZZ, batas tanggal + CN/Fee | Opening **8,02** (=10,01−2,02+0,03) + Invoices **12,34** − CN **1,23** + Fees **0,45** = Closing **19,58**; invoice **99,99** bertanggal 8 Oktober dikecualikan |
| Total Customer ketika ZZ aktif | Opening **5.550.024,98** + Invoices **28,66** − CN **1,23** + Fees **0,45** = Closing **5.550.052,86** |
| Supplier ZZ, 1–7 Oktober | Opening **15,03** (=20,04−5,01) + Invoices **100,25** − Payments **32,12** (=30,10 teralokasi +2,02 tanpa link akun AP) = Closing **83,16**; pembayaran akun Expense **3,03** dikecualikan |
| Supplier setelah tambahan 5 invoice bucket | ZZ Closing **88,21**; total dengan supplier lama Opening **30,03** + Invoices **105,30** − Payments **32,12** = Closing **103,21** |
| Edit tanggal ke 2 Oktober di UI | Customer ZZ Opening **20,36**, Invoices **0**, CN **1,23**, Fees **0,45**, Closing tetap **19,58**; Supplier ZZ Opening **120,33**, Invoices **0**, Payments **32,12**, Closing tetap **88,21** |
| Negatif | Create/partial edit from>to, tanggal 30 Februari, type/sort asing dan pageSize=101 → **400**; viewer create/edit/delete → **403**; bisnis tanpa akses → **403**; ID tidak ada/soft-deleted result → **404**; tanpa 500 |
| Viewer baca | Ketiga result → **200** |
| Field diabaikan/default | Title spasi → **Customer Summary**; accountingMethod dinormalisasi accrual; field tak relevan (termasuk nilai salah) pada create/edit tanpa type diabaikan |
| Audit 3 definisi uji awal | CREATE/DELETE masing-masing **1**; UPDATE Aged **3**, Customer **3**, Supplier **1** |
| Non-posting | Jumlah journal_entries identik saat create/read/edit Reports: **205** pada pemeriksaan awal; **221** sebelum/sesudah pemeriksaan akhir (selisih merupakan jurnal transaksi uji yang sudah soft-deleted) |
| Frontend New/Edit | Aged hanya Date/Sort/Show invoices; Summary hanya From/To; tanpa Title/Accounting method; edit tersimpan dan result diperbarui |
| Obscure | Ketiga hasil: semua sel nominal dan baris total menjadi **••••••**; toggle balik memulihkan angka |
| Print | Tombol dipicu pada ketiga hasil, memakai window.print dan CSS Reports yang sama. **Pratinjau/hasil cetak native belum terverifikasi**: browser bawaan tidak mengekspos dialog tersebut dan panggilan otomasi mengalami timeout; console aplikasi bersih |
| Typecheck/tests | Backend dan frontend **bersih**; 3 tes validasi Reports lulus |

Regresi sebelum dan setelah implementasi + cleanup, diverifikasi ulang lewat
endpoint `result`:

| Laporan | Sebelum | Sesudah |
|---|---:|---:|
| TB Total Debit = Total Credit | 5.550.054,61 | 5.550.054,61 |
| P&L Net Profit | 5.000.017,00 | 5.000.017,00 |
| BS Net Assets = Total Equity | 5.000.022,01 | 5.000.022,01 |
| Aged Receivables Total | 5.550.033,28 | 5.550.033,28 |

BS lama masih menghasilkan representasi float `5000022.010000001` pada API;
nominal dalam sen dan tampilan tetap identik, tanpa ketidakseimbangan.

Cleanup: **30 record aplikasi buatan sesi ini** dihapus via API menggunakan
ID yang dicatat saat create (24 pada uji utama, 6 pada verifikasi akhir),
termasuk kedua Late Fees. Query langsung berdasarkan setiap ID membuktikan
semuanya tidak aktif; hasil 10 definisi terhapus → 404. Query prefix hanya
dipakai untuk pemeriksaan read-only: **0 ZZ aktif**. Daftar API tanpa filter,
pagination <=100, juga **0 ZZ** pada Customers/Suppliers/Sales Invoices/Credit
Notes/Purchase Invoices/Payments/Reports. Jurnal yatim aktif purchase/payment:
**0**. Tombstone soft-delete dan audit dipertahankan sesuai pola modul.
PO-2020, RCV 2020, inv-102, INV-TEST-001 dan PRJ-2020 tetap aktif. Skrip
sementara dan manifest ID dibuang; tidak ikut commit.

File implementasi yang berubah:
- Backend: `src/db/schema.ts`, `src/schemas/ReportDefinition.ts`,
  `src/schemas/ReportDefinition.test.ts`, `src/repositories/ReportQueryRepository.ts`,
  `src/plugins/ReportRoutes.ts`.
- Frontend: `src/hooks/use-reports.ts`, `src/components/report-form-dialog.tsx`,
  `src/components/report-stage1b-table.tsx`, tiga route Reports
  (`reports.index`, `reports.$type`, `reports.$type.$id`),
  `src/i18n/locales/id.json` dan `en.json`.
- Dokumentasi: `Dokumentasi Modul/Report.md`.

Commit awal: backend `3ad0258`; frontend `f8ddda9`. Perbaikan detail hasil QA
dan catatan pengujian disimpan pada commit sesudahnya (lihat git log).
## 10. Tahap 1d: Sales Invoice Totals by Customer, Billable Time Summary, Receipts & Payments Summary

> Sumber: screenshot Manager.io asli (form + hasil ketiganya).

### 10.1 Perubahan indeks
Tiga item menjadi aktif: Sales Invoice Totals by Customer (grup Sales
Invoices), Billable Time Summary (grup Billable Time), Receipts &
Payments Summary (grup Cash & cash equivalents). Sisanya tetap "Segera".

### 10.2 Kolom & validasi (tanpa kolom tabel baru)
Ketiga form TIDAK punya Title maupun Accounting method — `title`
default nama jenis laporan bila kosong; `accounting_method` diabaikan.
- `sales_invoice_totals_by_customer`: wajib from+to (from <= to).
- `billable_time_summary`: wajib from+to.
- `receipts_payments_summary`: wajib from+to; `footer`,
  `show_account_codes`, `exclude_zero_balances` ikut pola Tahap 1.

### 10.3 Perhitungan
- **Totals by Customer**: per customer Σ invoiceAmount faktur aktif
  issue_date from..to + baris total. Header kolom = tanggal To
  (diselaraskan pada Tahap 2a).
- **Billable Time Summary** per customer: Opening (kumulatif sebelum
  from), New Billable Time (mutasi periode), Invoiced, Written-off,
  Closing (= Opening + New − Invoiced − Written-off) + baris total.
  CATATAN JUJUR: modul Billable Time kita berstatus statis
  ("Uninvoiced" hardcoded, tanpa link ke faktur) — kolom Invoiced dan
  Written-off SELALU 0 sampai modulnya punya status/relasi beneran.
  Itu keterbatasan yang dicatat, bukan bug laporan.
- **Receipts & Payments Summary**: seksi Receipts = Σ baris receipt
  per akun periode itu + Total; seksi Less: Payments = Σ baris payment
  per akun + Total; Net increase = Total Receipts − Total Payments;
  Cash at beginning (= saldo akun bank/kas sebelum from); Adjustments
  (= SISA: Ending − Beginning − Net, BUKAN dari jurnal manual —
  penyimpangan sadar dari spek awal; identitas End benar secara
  konstruksi, jadi tes identitas tidak membuktikan komposisi);
  Cash at end (= saldo akun bank/kas ≤ to).

### 10.4 Hasil & frontend
Layout kolom mengikuti screenshot. Form per tipe HANYA field §10.2.
Route `/reports/$type` dipakai ulang. Angka ikut Obscure mode. Print
browser, tanpa Clone/PDF.
- Catatan presisi uang: porsi Billable Time dihitung float
  (rate × menit/60 × 100 lalu ROUND di SQL) — lolos exact di uji,
  tapi berisiko drift 1 sen; follow-up: rumus integer-first.

## 11. Tahap 2a: Sales Invoice Totals by Item & by Custom Field

> Sumber: screenshot Manager.io asli (form + hasil + daftar definisi).
> Hasil uji KOSONG (test biz tanpa item/nilai custom) — bentuk baris
> [INFERENSI] mengikuti Totals by Customer; wajib dibuktikan via E2E.

### 11.1 Perubahan indeks
Dua item grup Sales Invoices menjadi aktif. Header kolom hasil = tanggal
To (bukti screenshot; sekalian revisi header Totals by Customer yang
tampil rentang → samakan ke tanggal To).

### 11.2 Kolom & validasi (tanpa kolom tabel baru)
- `sales_invoice_totals_by_item`: wajib from+to (from <= to). Tanpa Title/
  Accounting method (pola Tahap 1d).
- `sales_invoice_totals_by_custom_field`: wajib from+to + `custom_field`
  (dropdown definisi custom field modul sales invoice; kosong → 400).
  `title` diisi Name (daftar definisi Manager.io berkolom Name,
  bukan Description).

### 11.3 Perhitungan
- **Totals by Item**: per item Σ line_total baris faktur aktif
  issue_date from..to + baris total. Baris tanpa item (deskripsi bebas)
  → kelompok "Tanpa item" [fallback].
- **Totals by Custom Field**: per NILAI custom field terpilih Σ
  invoiceAmount faktur aktif periode itu + baris total. Faktur tanpa
  nilai → kelompok "(Kosong)". PRASYARAT JUJUR: butuh nilai custom field
  tersimpan per faktur — kalau Fase 1 Custom Fields ternyata hanya
  definisi tanpa nilai, LAPORKAN dan bangun fallback (satu baris total +
  catatan), JANGAN mengarang nilai.

### 11.4 Struktur asli dan keputusan implementasi (9 Oktober 2026)

Neon diperiksa melalui `information_schema` sebelum perubahan kode:
- `sales_invoice_lines` memiliki `sales_invoice_id`, `account_id`,
  `description`, `quantity`, `unit_price`, `subtotal`, `tax_rate_percent`,
  `tax_amount`, `line_total`, `sort_order`, `tax_code_id`; **tidak memiliki
  kolom/relasi item**. Tidak ada tabel bernama items/inventory atau tabel
  yang mengandung nama tersebut. `account_id` adalah akun COA, bukan item;
  deskripsi bebas juga tidak diperlakukan sebagai identitas item.
- Maka by Item memakai fallback **Tanpa item** untuk seluruh baris aktif.
  Jika periode tidak mempunyai baris faktur, hasil hanya Total 0. Catatan
  keterbatasan tampil di hasil/API. E2E pengelompokan beberapa item nyata
  belum bisa dilakukan; tidak ada item atau relasi yang dikarang.
- Nilai custom field **tersedia**: `custom_field_values.business_id`,
  `entity_type`, `record_id`, `definition_id`, `value_text`, `value_number`,
  `value_date`, `value_boolean`. `record_id` menunjuk ID faktur; definisi
  yang dipilih harus `entity_type='sales_invoice'`, satu bisnis, belum
  soft-deleted. Definisi inactive tetap boleh dilaporkan untuk data historis.
  Index unik asli `(definition_id,record_id)` diverifikasi; join tidak
  menggandakan total faktur.
- `report_definitions` **tidak mempunyai kolom custom_field**. Agar memenuhi
  batas tanpa DDL, ID pilihan disimpan sebagai JSON
  `{"customFieldId":"<uuid>"}` di kolom `description` yang sudah ada,
  khusus tipe by Custom Field. Ini parameter definisi, bukan hasil laporan.
  Request/response mengikuti camelCase proyek: **`customFieldId`**; field
  `description` respons untuk tipe ini null, ID parameter diproyeksikan dari
  JSON. Form/list menampilkan **Name/Nama** yang disimpan di `title`.
  Name kosong memakai nama jenis laporan. Field tanpa relevansi diabaikan.
  Penyimpanan JSON ini merupakan penyesuaian terhadap tidak tersedianya
  kolom parameter, bukan penambahan tabel/kolom.
- Agregasi uang memakai `SUM((line_total*100)::bigint)` dalam SQL, bukan float
  JS. By Custom Field menjumlahkan tiap faktur terlebih dahulu lalu
  mengelompokkan berdasarkan nilai typed milik field terpilih. Text/select
  kosong atau tidak ada nilai masuk **(Kosong)**; number 0 dan boolean false
  tetap nilai valid. Semua query memfilter business, tanggal inklusif,
  invoice aktif; join values juga memfilter entity/business/definition.
- Endpoint result/RBAC/audit/pagination/soft-delete dipakai ulang. Semua
  tiga laporan sales totals mempunyai header nominal **tanggal To**, termasuk
  bonus fix by Customer. Tidak ada posting jurnal dari Reports.

### 11.5 Pengujian Tahap 2a (9 Oktober 2026)

Lokal pnpm pada port 3000/4000; Docker kosong. Business dummy sama dengan
§9.6. Dua faktur ZZ buatan sesi ini (baris bebas, karena item belum tersedia):
- A, 8 Oktober: `2 × 10,01 + pajak 25% (5,01) + 3,03 = 28,06`.
- B, 9 Oktober: `7,07 + 2 × 4,04 = 15,15`.
- Gabungan: **43,21**. Total header faktur lama API sempat menghasilkan
  representasi float `28.060000000000002`; pemeriksaan dilakukan dalam sen
  (2806). Query Reports mengembalikan **28,06** sesuai sen integer.

| Uji runtime | Hasil |
|---|---|
| By Item, 8–9 Oktober | Tanpa item **43,21**, Total **43,21**; deskripsi sama/berbeda tetap kelompok bebas, tidak dijadikan item palsu |
| By Custom Field text, 2000–9 Oktober | (Kosong) **5.550.033,28** dari faktur lama; Alpha **28,06**; Beta **15,15**; Total **5.550.076,49** |
| Nilai kosong, periode 8–9 Oktober | Hapus nilai Beta dari faktur ZZ B → (Kosong) **15,15**, Alpha **28,06**, Total **43,21**; nilai kemudian dikembalikan |
| Semua tipe lain | number `0.00`/`2.50`, boolean `false`/`true`, date `2026-10-08`/`2026-10-09`, select `One`/`Two`: masing-masing **28,06**/**15,15**, Total **43,21**; tidak dianggap kosong |
| Rentang tanpa transaksi | Kedua tipe hanya Total **0** (2099-01-01–2099-01-02) |
| Header To | API by Customer `headerDate=2026-10-09`; kolom nominal ketiga tipe memakai tanggal To |
| Negatif | from>to create/partial edit, custom field hilang/kosong/null/UUID tidak ada/definisi Customer, pageSize101/type asing → **400**; bisnis tanpa akses → **403**; viewer create/edit/delete → **403**; viewer kedua result → **200**; soft-deleted report result → **404**; tanpa 500 |
| Name/default | Create Name spasi → **Sales Invoice Totals by Custom Field**; edit Name dan pilihan field tersimpan; list menggunakan Nama/Name |
| UI by Item | New/Edit hanya From/To; edit From 8→9 Oktober memindahkan total **43,21→15,15** |
| UI by Custom Field | From/To, Name, dropdown Custom Field saja; pilihan hanya definisi sales_invoice (definisi Customer uji tidak tampil); edit field ke number mengubah label/grup menjadi `0.00`/`2.50` dengan Total **43,21** |
| Obscure | Semua nominal/baris total pada kedua hasil menjadi **••••••**, toggle balik memulihkan angka. Nilai field merupakan label grup, bukan nominal faktur |
| Print | Tombol dipicu pada kedua hasil, memanggil window.print melalui pola lama. **Pratinjau/hasil cetak native belum terverifikasi**, karena browser bawaan tidak mengekspos dialog dan klik mengalami timeout; console aplikasi bersih |
| Non-posting | Jumlah journal_entries tidak berubah saat create/read definisi Reports (**221** pada awal, **223** ketika dua jurnal invoice ZZ sudah ada); tidak ada jurnal Reports |
| Audit | By Item: CREATE **1**, UPDATE **2**, DELETE **1**. By Custom Field: CREATE **1**, UPDATE **7**, DELETE **1** |
| Pemeriksaan kode | Typecheck backend/frontend **0/0**; **4** tes validasi Reports lulus |

Regresi sebelum dan setelah cleanup, dihitung pada tanggal 9 Oktober:

| Laporan | Sebelum | Sesudah |
|---|---:|---:|
| TB Debit = Credit | 5.550.054,61 | 5.550.054,61 |
| P&L Net Profit | 5.000.017,00 | 5.000.017,00 |
| BS Net Assets | 5.000.022,01 | 5.000.022,01 |
| Aged AR | 5.550.033,28 | 5.550.033,28 |
| Aged AP | 15,00 | 15,00 |

Cleanup hanya berdasarkan ID yang dicatat saat create: **13 record aplikasi**
(6 definisi custom field, 4 definisi report, 2 faktur, 1 kontak). Semua header
dihapus melalui API; nilai opsional uji dilepas lewat API terlebih dahulu.
Custom field wajib pre-existing "Diskon Special" hanya diisi pada faktur ZZ,
bukan mengubah definisinya. Sisa row nilai milik faktur ZZ yang sudah dihapus
dibersihkan dengan **ID row yang dikembalikan upsert dan dicatat**, bukan
filter/prefix/list. Tidak ada hard-delete header transaksi. Query langsung
dan API tanpa filter (pageSize<=100) menunjukkan **0 ZZ aktif**; semua nilai
dan jurnal aktif terkait dua ID faktur uji **0**. Audit dan tombstone header
dipertahankan. Tidak ada item yang dibuat. PO-2020, RCV 2020, inv-102,
INV-TEST-001 dan PRJ-2020 tetap aktif. Password tidak diubah.

File perubahan: backend `src/db/schema.ts` (enum saja),
`src/schemas/ReportDefinition.ts`, `src/schemas/ReportDefinition.test.ts`,
`src/repositories/ReportDefinitionRepository.ts`,
`src/repositories/ReportQueryRepository.ts`, `src/plugins/ReportRoutes.ts`;
frontend `src/hooks/use-reports.ts`, `src/components/report-form-dialog.tsx`,
`src/components/report-stage1b-table.tsx`, tiga route Reports (`reports.index`,
`reports.$type`, `reports.$type.$id`), `src/i18n/locales/id.json`/`en.json`;
serta dokumen ini. Skrip/manifest sementara dihapus sebelum commit.
