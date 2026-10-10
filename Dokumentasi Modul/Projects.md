# Dokumentasi Modul: Projects (Proyek)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis Fitur dan Kebutuhan Sistem Manager intern - pahrio
> kaspiyanor, §7
> ⚠️ MODUL PALING MENYEBAR — nyentuh 6 tabel transaksi lain sekaligus.
> Kalau kuota AI agent habis di tengah jalan, modul ini paling wajar buat
> dilanjutin di sesi terpisah (per bagian: dulu CRUD Project-nya dulu,
> baru nge-tag ke tiap modul transaksi satu-satu).

## 1. Tujuan Modul

Dimensi pelacakan keuangan sekunder — "label" yang bisa ditempelin ke
transaksi pendapatan (Sales Invoices, Receipts) dan transaksi biaya
(Purchase Invoices, Payments, Expense Claims, Journal Entries manual),
buat ngitung Income/Expenses/Net Profit per proyek/pekerjaan tertentu.

## 2. Keputusan Desain Penting

1. **Project ITU SENDIRI TIDAK bikin jurnal** — dia cuma atribut
   pengelompokan. Yang ditandain adalah DOKUMEN SUMBER (Sales Invoice,
   dst), bukan baris jurnal langsung.
2. **Implementasi tagging**: tambah kolom `project_id` (uuid, nullable,
   FK `projects`) ke tabel HEADER dari 6 modul: `sales_invoices`,
   `purchase_invoices`, `receipts`, `payments`, `expense_claims`,
   `journal_entries`. SEMUA optional/nullable — dokumen yang nggak
   ditandain proyek tetap jalan seperti biasa.
3. **Income/Expenses dihitung dari jurnal milik dokumen yang di-tag**:
   `Income` = Σ(kredit) baris jurnal kategori Revenue, dari jurnal yang
   `source_module` + `source_id`-nya nunjuk ke dokumen (Sales Invoice/
   Receipt) yang `project_id`-nya proyek ini. `Expenses` = Σ(debit)
   baris jurnal kategori Expense, dari jurnal yang dokumen sumbernya
   (Purchase Invoice/Payment/Expense Claim) `project_id`-nya proyek ini,
   DITAMBAH jurnal manual yang `project_id`-nya langsung diisi proyek
   ini juga.

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Buat, ubah, hapus proyek; pilih tag proyek pas input transaksi |
| Viewer | Hanya baca |

## 4. Struktur Data

### 4.1 Tabel `projects` (BARU)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| name | varchar(255) | Ya | Nama proyek |
| code | varchar(50) | Tidak | Kode identifikasi |
| customer_id | uuid, nullable | Tidak | FK `contacts` (is_customer=true), pemilik proyek |
| status | varchar(20) | Ya | `active` / `inactive` / `completed`, default `active` |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 4.2 Kolom `project_id` (nullable, FK `projects`) DITAMBAH ke:

`sales_invoices`, `purchase_invoices`, `receipts`, `payments`,
`expense_claims`, `journal_entries`.

### 4.3 Field terhitung (real-time, TIDAK disimpan)

| Field | Cara Hitung |
|---|---|
| totalIncome | Σ(credit − debit) baris jurnal AKTIF berkategori Revenue, dari jurnal sumber (`sales_invoices`/`receipts`) yang `project_id` = proyek ini |
| totalExpenses | Σ(debit − credit) baris jurnal AKTIF berkategori Expense, dari jurnal sumber (`purchase_invoices`/`payments`/`expense_claims`) YANG `project_id` = proyek ini, DITAMBAH jurnal manual yang `project_id`-nya langsung diisi proyek ini |
| netProfit | `totalIncome - totalExpenses` |

> Keputusan desain (Bagian C, diimplementasikan):
> - Yang dihitung adalah jurnal **AKTIF** (`journal_entries.deleted_at IS
>   NULL) dari dokumen sumber yang `project_id`-nya proyek ini **dan**
>   dokumennya belum di-soft-delete — dihubungkan lewat
>   `journal_entries.source_module` + `source_id` (`sales_invoice`,
>   `receipt`, `purchase_invoice`, `payment`, `expense_claim`,
>   `manual_journal` — sesuai konstanta di tiap repository, jangan ditebak).
> - Dihitung per KATEGORI akun (`chart_of_accounts.category`):
>   `totalIncome` hanya baris `Revenue`, `totalExpenses` hanya baris
>   `Expense`. Kategori lain (Asset, Liability — termasuk Utang Pajak dan
>   akun kontrol AP — Equity) TIDAK dihitung. Konsekuensinya: pajak pada
>   Sales Invoice tidak masuk income; pelunasan Payment ke Purchase
>   Invoice/Expense Claim (debit ke akun kontrol, bukan Expense) tidak
>   dihitung ganda sebagai beban.
> - Dihitung di database dalam 1 query agregat (UNION ALL per jalur
>   sumber, GROUP BY project) untuk seluruh proyek di satu halaman list —
>   bukan 1 query per proyek. Proyek tanpa transaksi = 0.

## 5. Aturan Bisnis

1. **Wajib**: `name`. Semua field lain opsional.
2. **TIDAK ADA posting jurnal** dari modul Projects sendiri.
3. **Proyek `inactive`/`completed` disembunyikan dari dropdown pilihan
   TRANSAKSI BARU** (di form Sales Invoice dst), TAPI histori transaksi
   yang udah ditandain proyek itu tetap ditampilkan normal.
4. **Delete**: TOLAK kalau ada minimal 1 dokumen dari 6 tabel di atas
   yang `project_id`-nya proyek ini (cek semua 6 tabel).
5. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

## 6. Alur Status

```
Active (default, muncul di semua dropdown transaksi)
   │
   ├── ganti ke Inactive  → hilang dari dropdown transaksi BARU, histori tetap ada
   └── ganti ke Completed → sama seperti Inactive
```

## 7. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Proyek Baru", kotak pencarian (nama/kode).
- **Filter**: status (Active/Completed/Inactive/Semua).
- **Kolom**: Code, Name, Customer, Income (kanan), Expenses (kanan),
  Net Profit (kanan, warna hijau kalau positif/merah kalau negatif),
  Status (badge), Aksi (View Summary, Edit, Ubah Status, Hapus).

## 8. Spesifikasi Form Tambah/Edit

| Field | Komponen | Validasi |
|---|---|---|
| Name | Text input | Wajib, min 1 karakter |
| Code | Text input | Opsional |
| Customer | Dropdown (Customers) | Opsional |
| Status | Radio/Dropdown | Default Active |

## 9. Contoh Data

```json
{
  "name": "Pengembangan Sistem E-Commerce V2",
  "code": "PRJ-2026-02",
  "customerId": "<id PT Aksara Mandiri>",
  "status": "active"
}
```

## 10. Relasi dengan Modul Lain

Semua 6 modul di §4.2 — masing-masing perlu TAMBAHAN dropdown "Project"
(opsional) di form create/edit-nya, yang isinya cuma proyek berstatus
`active`.

## 11. Endpoint API

Base path: `/businesses/:businessId/projects`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/projects` | listProjects | List (paginated) + Income/Expenses/NetProfit per baris, `?q=`, `?status=` |
| GET | `/businesses/:businessId/projects/:id` | getProject | Detail + ringkasan keuangan |
| POST | `/businesses/:businessId/projects` | createProject | Buat proyek baru |
| PUT | `/businesses/:businessId/projects/:id` | updateProject | Update metadata |
| DELETE | `/businesses/:businessId/projects/:id` | deleteProject | Hapus — TOLAK kalau ada transaksi terikat |

## 12. Urutan implementasi yang disarankan (kalau mau dipecah jadi
beberapa sesi)

1. **Bagian A**: tabel `projects` + CRUD dasar (schemas, repository,
   routes, frontend list/form) — bisa berdiri sendiri, berfungsi penuh
   walau belum ada modul lain yang nge-tag ke sini (Income/Expenses
   selalu 0 sementara).
2. **Bagian B**: tambah kolom `project_id` ke 6 tabel + update
   masing-masing repository (create/update terima `projectId` opsional)
   + schema Zod + endpoint-nya + frontend form masing-masing (dropdown
   Project opsional).
3. **Bagian C**: hitung `totalIncome`/`totalExpenses`/`netProfit` di
   `ProjectRepository` (JOIN ke jurnal lewat `source_module`/
   `source_id` dari tiap tabel yang di-tag).
## 12. Tahap 2b: Customer/Supplier Statements (Unpaid Invoices & Transactions)

> Sumber: 12 screenshot Manager.io asli (daftar + detail keempatnya).
> Pola BERBEDA dari keluarga Totals: parameter-only, TANPA definisi
> tersimpan (tanpa New/Edit, tanpa Title). Helper `isParameterOnlyReport`
> memang disiapkan untuk ini.

### 12.1 Cakupan & indeks
Empat tipe: `customer_statements_unpaid`,
`customer_statements_transactions`, `supplier_statements_unpaid`,
`supplier_statements_transactions`. Satu item abu-abu per sisi dipecah
jadi dua entri aktif sesuai nama asli: "... (Unpaid Invoices)" dan
"... (Transactions)".

### 12.2 Parameter (tanpa kolom tabel baru)
- Unpaid: SATU tanggal as-of (`Set Date`, default hari ini). Tanpa from/to.
- Transactions: from..to (`Set Period`, default from = awal waktu,
  to = hari ini). from <= to.
- Tanpa Title/Accounting method.

### 12.3 Isi
- **Unpaid list**: per kontak (Date=asOf, kontak, jumlah faktur unpaid,
  Total) + baris total. Unpaid = aktif + issue_date <= asOf +
  balance_due > 0 (logika saldo dipakai ulang dari Aged
  Receivables/Payables — JANGAN rumus baru).
- **Unpaid detail**: per faktur (Date, Order number bila ada, Invoice ref,
  Description, Invoice total, Overdue, Balance due) + footer aging
  Current / 1–30 / 31–60 / 61–90 / 90+ + Total. Overdue = max(0, asOf −
  due_date) hari. [TERJAWAB — lihat §12.5: `due_date` **ADA** di kedua
  tabel faktur, jadi tidak ada fallback yang diperlukan.]
- **Transactions list**: per kontak (From, To, kontak, jumlah transaksi,
  Balance) + baris total.
- **Transactions detail**: kronologis Date | Description | Debit | Credit |
  Balance running + footer Total debits / Total credits / Closing
  (= debits − credits). Customer: invoice & late fee = Debit, credit note
  & receipt = Credit. Supplier: purchase invoice = Credit, payment &
  debit note = Debit. [Hanya sumber ber-link kontak yang dipakai; yang tak
  ter-link dicatat sebagai keterbatasan, JANGAN dikarang.]
- Blok alamat tampil bila field-nya ada; bila tidak, nama saja (ditunda).

### 12.4 API & frontend
Endpoint daftar + detail per tipe, read-only (tanpa baris
report_definitions, tanpa audit tulis). RBAC report:read. Halaman ikut
pola $type (daftar → View → detail). Obscure. Print browser.

### 12.5 Struktur ASLI Neon — hasil verifikasi (menutup [TERBUKA] §12.3)

Diperiksa langsung ke `information_schema` Neon (bukan asumsi `schema.ts`):

| Prasyarat | Hasil |
|---|---|
| `due_date` | **ADA** di `sales_invoices` DAN `purchase_invoices` (nullable) |
| `order_number` | **HANYA** di `purchase_invoices`; `sales_invoices` TIDAK punya |
| `receipts.contact_id` | ada, nullable (receipt tanpa kontak tidak muncul — tidak dikarang) |
| `payments.contact_id` | ada, NOT NULL |
| `credit_notes.customer_id`, `debit_notes.supplier_id` | ada |
| `late_payment_fees` | `customer_id`/`date`/`amount` ada; **TANPA** reference/description |
| `contacts.billing_address` | ada → blok alamat tampil bila terisi |

Konsekuensi yang DITETAPKAN (bukan fallback, karena prasyaratnya ada):

1. **Overdue TIDAK butuh fallback.** `due_date` tersedia, jadi
   `Overdue = GREATEST(0, asOf − due_date)` hari. `due_date` NULL = belum
   jatuh tempo → bucket **Current**, sama persis dengan Aged Receivables.
2. **Kolom Order number hanya terisi di sisi supplier.** Sisi customer
   selalu kosong karena `sales_invoices` memang tidak punya kolomnya
   (dicatat sebagai keterbatasan; tidak dikarang). Catatan: CLAUDE.md
   menyebut `orderNumber` ada di Sales Invoices — **Neon membuktikan
   sebaliknya**; sumber kebenaran tetap Neon.
3. **Label transaksi** diambil dari kolom yang benar-benar ada:
   `CONCAT_WS(' — ', description, reference)` dengan default per modul
   (Sales Invoice / Credit Note / Receipt / Purchase Invoice / Payment /
   Debit Note). Khusus `late_payment_fees` (tanpa reference/description)
   label default `Late Payment Fee`.
4. **Saldo memakai ULANG rumus Aged.** Fragmen alokasi diekstrak jadi
   `invoiceAllocationsSql()` di `ReportQueryRepository` — SATU definisi
   yang dipakai Aged Receivables/Payables **dan** Statements, sehingga
   tidak mungkin ada dua rumus saldo yang berbeda:
   - Piutang: `invoiceAmount − Σ withholding_tax_receipts aktif`
   - Utang: `invoiceAmount − Σ payment_lines milik payment aktif`
5. **Kontak difilter per peran** (`is_customer` / `is_supplier`) di
   Statements — Aged tidak memfilternya. Karena itu daftar Statements
   hanya berisi kontak yang memang berperan di sisi itu; kontak peran
   salah ditolak **404**.

### 12.6 Implementasi

Backend (baru): `schemas/Statement.ts`, `repositories/StatementQueryRepository.ts`,
`plugins/StatementRoutes.ts` (didaftarkan di `index.ts`). Diubah:
`repositories/ReportQueryRepository.ts` (mengekspor
`invoiceAllocationsSql` + `centsToAmount`, tanpa mengubah hasil Aged).

- `GET /businesses/:businessId/statements/:type` — daftar kontak,
  paginated (`pageSize` maks 100), `?q=`, `headerDate`, baris `totals`.
- `GET /businesses/:businessId/statements/:type/:contactId` — detail satu
  kontak (+ `contact`, `buckets` untuk unpaid, `totals` untuk transactions).
- Agregasi uang di SQL sebagai **sen integer** (`(kolom*100)::bigint`),
  saldo berjalan pakai window function
  `SUM(debit-credit) OVER (PARTITION BY contact_id ORDER BY date, source_order, doc_id)`.
  `Closing = Total debits − Total credits` (periode saja, sesuai §12.3).
- Read-only total: tanpa endpoint tulis, tanpa audit tulis, tanpa baris
  `report_definitions`, tidak menyentuh `journal_entries`.
- Tanggal divalidasi **STRICT** (regex + kalender), beda dari `dateString`
  polos modul lain: `2026-02-31` ditolak **400**, bukan lolos ke Postgres
  lalu jadi 500.

Frontend: `hooks/use-reports.ts` (`STATEMENT_TYPE_VALUES`,
`STATEMENT_TYPE_LABELS`, `useStatementList`, `useStatementDetail`),
`components/statement-views.tsx` (dialog Set Date/Set Period + tabel
daftar/detail/footer aging/footer saldo), route `reports.$type` dan
`reports.$type.$id` (branch statement), 4 entri aktif di
`reports.index.tsx` (satu item abu-abu per sisi dipecah dua), katalog
`i18n` id+en. Semua nominal lewat `useFormatAmount()` (Obscure) — termasuk
sub-komponen tabel di berkas yang sama.

### 12.7 Bukti pengujian (9 Oktober 2026)

Lokal `pnpm` (backend `tsx watch` port 4000, frontend Vite port 3000);
Docker kosong. Bisnis dummy `d9d9760c-…`. Data uji berprefix `ZZ-`
(1 customer + 1 supplier + 2 faktur penjualan + credit note + receipt +
late fee + faktur pembelian + payment + debit note + WTR); semua dihapus
lewat API berdasarkan ID yang dicatat. **Harness E2E: 113 pemeriksaan,
0 gagal.**

Verifikasi terhadap struktur/dokumen resmi:

| Uji | Hasil |
|---|---|
| Prasyarat §12.3 | `due_date` ADA di kedua tabel → **tidak ada fallback**; `order_number` hanya di purchase_invoices (dicatat) |
| Formula saldo dipakai ulang | Total Statements (Unpaid) **=** Aged Receivables `5.550.033,28` dengan parameter sama; sisi supplier **=** Aged Payables `15,00` |
| Non-posting | 6× baca Statements: `journal_entries` **9 → 9**, `report_definitions` **10 → 10** |
| Unpaid list | customer ZZ: **2** faktur, Total **24,06**; grand total = Σ baris kontak |
| Unpaid detail | 2 baris; Σ `balanceDue` **24,06**; bucket Current **4,04** + 1–30 **20,02** + 31–60/61–90/90+ **0** = Total **24,06** |
| Overdue harian | ZZ-A (due 30 Sep, asOf 9 Okt) = **9 hari** → bucket 1–30; ZZ-B (due 20 Okt > asOf) = **0** → Current |
| Transactions list | 5 dokumen, Balance **20,06** |
| Transactions detail | urutan & saldo berjalan `20,02 → 24,06 → 22,56 → 19,56 → 20,06`; debits **24,56**, credits **4,50**, Closing **20,06** = debits − credits |
| Supplier mirror | PI **12,00** muncul sebagai unpaid SEBELUM payment, lalu **hilang** (balance 0) sesudah payment penuh; `orderNumber` `ZZ-ORD-1` tampil |
| Supplier transactions | 3 dokumen; debits **14,00**, credits **12,00**, Closing **2,00** |
| Exclusion lunas (piutang) | WTR penuh **4,04** atas ZZ-B → ZZ-B hilang dari unpaid, sisa 1 faktur **20,02** (mekanismenya ADA dan diuji) |
| Negatif | tanpa `asOfDate`, `2026-02-31`, `2026-13-01`, format salah, tanpa `dateTo`, `from > to`, tipe asing, `pageSize=101`, id kontak bukan UUID → **400**; kontak tidak ada / bisnis lain / peran salah → **404**; tanpa token → **401**; **0 respons 500** |
| Regresi (sebelum = sesudah cleanup) | TB **5.550.054,61** (debit = kredit), P&L net **5.000.017,00**, BS net assets **5.000.022,01**, AR **5.550.033,28**, AP **15,00** — IDENTIK; `journal_entries` **9 → 9** |
| Cleanup | 0 customer/supplier ZZ aktif, 0 dokumen ZZ aktif, 0 baris ZZ di statement, `report_definitions` kembali **5**; `PI-2020`, `RCV 2020`, `inv-102`, `INV-TEST-001` terbukti masih ada |

Catatan parameter regresi: definisi tersimpan memakai tanggal yang lebih
sempit (TB `2026-10-07…2026-11-07`, AP as-of `2026-09-01`) sehingga angka
dokumen TIDAK tereproduksi dari definisi itu. Angka dokumen tereproduksi
dengan TB/P&L `2026-01-01…2026-11-07`, BS as-of `2026-11-07`, AR/AP
as-of `2026-10-09` — dan itulah yang dipakai sebagai patokan regresi.
Definisi laporan sementara untuk pengujian dihapus kembali (5 → 5).

File perubahan: backend `src/schemas/Statement.ts`,
`src/repositories/StatementQueryRepository.ts`,
`src/plugins/StatementRoutes.ts`, `src/repositories/ReportQueryRepository.ts`,
`src/index.ts`; frontend `src/hooks/use-reports.ts`,
`src/components/statement-views.tsx`, tiga route Reports,
`src/i18n/locales/id.json` + `en.json`; serta dokumen ini. Skrip uji
sementara dihapus sebelum commit.