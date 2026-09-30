# Clone Manager.io — Konteks Project

Aplikasi akuntansi custom-built, dibangun dari nol terpisah sepenuhnya dari
Manager.io (yang cuma dipakai sebagai referensi riset di Fase 0). Proyek
PKL — mahasiswa: Muhammad Aulia Saputra, PT Media Cepat Indonesia (Rapid
Network), Divisi App Developer.

## Struktur Folder Repo

```
clone-manager-io/              <- root repo Git (git init di sini)
├── CLAUDE.md                   <- file ini
├── Schema.sql                  <- skema database awal (referensi historis, sudah agak basi)
├── Dokumentasi Modul/          <- spesifikasi tiap modul Fase 2 (format: Tujuan, Aktor,
│                                  Struktur Data, Aturan Bisnis, Alur Status, List View, Form,
│                                  Contoh Data, Relasi Modul, Endpoint API)
├── backend/                    <- backend AKTIF (Fastify). INI yang dipakai.
├── backend-legacy-express/     <- backend LAMA (Express), diarsipkan, JANGAN disentuh
└── fe-accounting/               <- frontend (React + Vite)
```

**Catatan:** ada file/folder nyasar dari eksperimen tools lain
(`.aider.tags.cache.v4`, `start-ai-grid.bat`, dll) — abaikan, tidak relevan
ke aplikasi. **JANGAN PERNAH** tulis API key/credential langsung ke file
apa pun di dalam repo ini (pernah ada insiden kebocoran) — selalu pakai
environment variable atau `.env` yang sudah di-gitignore.

## Backend (`backend/`)

- Stack: **Fastify 5 + TypeScript + Drizzle ORM + Zod**, pnpm (JANGAN pakai
  npm/npx, `devEngines` menolak npm).
- Database: PostgreSQL di Neon (cloud). **TIDAK ADA folder migrations** —
  semua perubahan skema dilakukan lewat `ALTER TABLE`/`CREATE TABLE` manual
  ke Neon SQL Editor, lalu `db/schema.ts` disesuaikan manual juga. SELALU
  cek struktur tabel ASLI di Neon dulu sebelum asumsi skema di `schema.ts`
  sudah sinkron — beberapa kali ditemukan tabel yang sudah ada dari Fase
  1.1 tapi strukturnya beda dari dokumen spesifikasi terbaru.
- Port: **4000**.
- Pola arsitektur: **route → repository** (flat, tanpa service layer).
  Setiap modul: `schemas/X.ts` (Zod, PascalCase singular),
  `repositories/XRepository.ts` (pure function, tidak tahu HTTP),
  `plugins/XRoutes.ts` (Fastify route, PascalCase, `requireBusinessScopeParam`,
  `requireRole`/`requirePermissions`, audit log via `AuditLogRepository`,
  `operationId` wajib di tiap endpoint).
- Auth: JWT (access token berumur pendek, ~15 menit — sering perlu login
  ulang saat testing manual lewat Swagger/PowerShell), refresh token,
  multi-tenant, role: admin/accountant/viewer.
- Base path: `/businesses/:businessId/<resource>` (TIDAK ada prefix `/api`).
- Duplicate check: SELALU pakai `isPgUniqueViolation` (di
  `libs/safe-error.ts`) untuk translate error unik constraint jadi 409 —
  jangan biarkan error mentah lolos jadi 500.

### ⚠️ Pelajaran pahit — WAJIB diikuti modul berikutnya

1. **Bug alias SQL mentah**: kolom Drizzle yang diinterpolasi ke `sql`
   mentah dirender TANPA nama tabel (`"contact_id" = "id"` — selalu salah
   di konteks JOIN!). SELALU pakai `alias` (`drizzle-orm/pg-core`) untuk
   tabel dalam + tulis nama tabel luar eksplisit. Kalau lupa, hasil query
   selalu 0 tanpa error yang jelas.
2. **Bug string-vs-number**: SEMUA field `numeric`/`decimal` Postgres
   dikembalikan sebagai STRING oleh driver, padahal skema Zod response
   minta `number`. WAJIB `Number(...)` eksplisit di fungsi `toRecord`
   sebelum return, kalau tidak GET detail gagal dengan
   `ResponseSerializationError` (500) — padahal datanya sendiri sukses
   tersimpan, cuma responsnya yang gagal diserialisasi.
3. **Bug "ganti relasi tanpa ganti detail"**: kalau invoice/receipt punya
   field yang nge-trigger reposting jurnal (misal `lines`), field LAIN
   yang mempengaruhi isi jurnal (`supplierId`/`customerId`/
   `bank_account_id`/`contactId` — apa pun yang nyambung ke `contactId`
   atau akun tujuan di jurnal) HARUS JUGA jadi trigger reposting, walau
   `lines`-nya sendiri tidak berubah. Sudah diterapkan dengan benar di
   Sales Invoices, Purchase Invoices, dan Receipts — selalu tanya "field
   apa saja yang nentuin isi jurnal ini?" lalu jadikan SEMUA itu trigger
   repost.
4. **Jangan hard-delete header transaksi tanpa jurnalnya** — kalau mau
   bersihkan data uji yang gagal ke-DELETE lewat API, JANGAN main
   hard-delete row header manual di Neon tanpa ikut soft-delete jurnal
   terkaitnya. Itu bikin "jurnal yatim" yang bikin saldo salah terus tanpa
   ada baris header yang bisa dicek balik. Kalau kejadian, cek dengan:
   `SELECT * FROM journal_entries WHERE source_module = '<nama modul>'
   AND deleted_at IS NULL;` lalu cocokkan tiap `source_id` masih punya
   baris header aktif atau tidak — kalau tidak, itu yatim, soft-delete
   manual.
5. **AI agent JANGAN reset password user (`admin@test.com` dkk) untuk
   keperluan testing sendiri tanpa bilang JELAS ke user password barunya
   apa** — pernah kejadian testing otomatis reset password diam-diam,
   user jadi nggak bisa login pakai password yang biasa dipakai. Kalau
   AI agent butuh reset password buat testing, WAJIB tulis eksplisit di
   laporan akhir: "Password admin@test.com sudah diubah ke: `<isi>`" —
   atau lebih baik, balikin ke password semula setelah selesai testing.
6. Uang dihitung dalam **sen (integer)** kalau perlu presisi tinggi,
   hindari drift floating point.
7. Script sementara buat cek sesuatu ditaruh di folder `backend/`,
   jalankan pakai `tsx`, lalu **HAPUS** setelah dipakai — dan **PASTIKAN
   BENERAN TERHAPUS SEBELUM COMMIT** (pernah kejadian script sementara
   kelewat ikut ke-commit ke Git, harus dibersihkan belakangan).
8. **Request GET/DELETE TANPA body jangan dikirimi header
   `Content-Type: application/json`** — Fastify membalas 400 karena
   mencoba parse body JSON yang kosong. Jebakan ini sudah menjebak DUA
   sesi AI agent berbeda di skrip tes mereka (sekali bikin cleanup gagal
   dan meninggalkan jurnal yatim, sekali bikin E2E pertama gagal).
   Kirim header itu HANYA kalau request memang punya body.
9. **Skrip debugging/probing dilarang menghapus atau mengubah data
   berdasarkan "baris pertama" atau query tanpa filter.** Hanya boleh
   menyentuh ID yang DIBUAT skrip itu sendiri (catat ID-nya waktu
   dibuat). Pernah kejadian skrip probe menghapus receipt tes milik user
   ("RCV 2020") karena tidak difilter; untung ketahuan, diaku, dan
   dipulihkan. Kalau AI agent melakukan kesalahan semacam ini, wajib
   dilaporkan jujur seperti itu, dan user memverifikasi pemulihannya
   sendiri (bandingkan saldo dan daftar dokumen).

### Modul yang sudah ada (backend + frontend kecuali disebutkan)

- **Auth** — login, refresh, profil sendiri, ganti password
- **Users** — manajemen user (legacy path, masih dipakai)
- **Business** — CRUD bisnis + kelola anggota (`/businesses`,
  `/businesses/:id/members/*`)
- **ChartOfAccounts** — `/businesses/:id/accounts`, kategori
  Asset/Liability/Equity/Revenue/Expense
- **Customers & Suppliers** — SATU tabel `contacts` dibagi dua peran lewat
  flag `is_customer`/`is_supplier` (SATU kontak bisa jadi dua-duanya).
  Customers: `/businesses/:id/customers`. Suppliers:
  `/businesses/:id/suppliers`. `accountsReceivable`/`accountsPayable`
  SUDAH live query dari jurnal.
- **BankAccounts** — `/businesses/:id/bank-accounts`, terikat ke
  `chartOfAccounts` (kategori Asset), `currentBalance` live dari jurnal
  (mengecualikan baris jurnal yang soft-deleted). Kalau akun sudah pernah
  ada transaksi jurnal, DELETE ditolak (harus "archive" lewat
  `PATCH .../status` alih-alih dihapus permanen).
- **SalesInvoices** — `/businesses/:id/sales-invoices`. Header TANPA
  status/total tersimpan, `sales_invoice_lines` ADA pajak per baris.
  Status (Unpaid/Overdue/Paid) & `balanceDue` real-time. Create langsung
  posting jurnal (Debit AR, Kredit Income+Tax Payable).
- **PurchaseInvoices** — `/businesses/:id/purchase-invoices`. Cerminan
  Sales Invoices, arah jurnal berlawanan (Debit Expense per baris, Kredit
  akun kontrol Accounts Payable). TANPA pajak, TANPA billing_address.
- **Receipts** — `/businesses/:id/receipts`. LEBIH SIMPEL dari 2 modul
  invoice: TIDAK ADA status/balanceDue sama sekali (begitu disimpan
  langsung final). Header: `date`, `reference` nullable, `bank_account_id`
  (wajib, "Received in"), `contact_id` nullable ("Paid by", murni
  referensi, TIDAK mengurangi AR/AP kontak). Lines: `account_id` (WAJIB
  kategori Revenue/Equity/Liability — Asset dan Expense DITOLAK, karena
  uang masuk logisnya dari salah satu 3 kategori itu, bukan dari akun
  beban atau akun aset lain) + `amount`. Create posting jurnal: Debit ke
  akun COA milik `bank_account_id`, Kredit ke tiap `account_id` baris.
- Akun AR/AP kontrol dicari OTOMATIS di modul invoice: satu-satunya akun
  kategori Asset(AR)/Liability(AP) + `isControlAccount=true` di bisnis
  itu — JANGAN hardcode kode akun tertentu.
- **Payments** — `/businesses/:id/payments`. LEBIH KOMPLEKS dari Receipts:
  baris item bisa dialokasikan ke Purchase Invoice tertentu (field
  `purchase_invoice_id` nullable di `payment_lines`). Kalau baris pilih
  akun kontrol Accounts Payable, validasi: invoice harus milik
  `contact_id` header, `amount` tidak boleh melebihi `balanceDue` invoice
  SAAT INI (exclude alokasi lama punya payment yang sama kalau lagi
  update). `PurchaseInvoiceRepository.balanceDue` SEKARANG BENERAN LIVE:
  `invoiceAmount − Σ(alokasi Payment aktif)` — bukan selalu
  `=invoiceAmount` lagi. Frontend: dropdown "Invoice" cuma muncul kalau
  Account baris = akun kontrol AP, nunjukkin daftar invoice Unpaid/
  Overdue milik Payee yang dipilih.
- **InterAccountTransfers** — `/businesses/:id/inter-account-transfers`.
  Modul PALING SIMPEL — TANPA baris item dinamis (cuma 2 akun bank + 1
  nominal, TIDAK ADA tabel lines terpisah). Debit akun tujuan, Kredit
  akun sumber, sama besar. Repost jurnal kalau `from`/`to`/`amount`
  berubah.
- **BankReconciliations** — `/businesses/:id/bank-reconciliations`. BEDA
  dari semua modul lain: TIDAK POSTING JURNAL SAMA SEKALI, murni alat
  verifikasi baca-saja. Fungsi kunci: hitung `bookBalance` akun bank
  PER TANGGAL TERTENTU (filter `entry_date <= cutoff`, beda dari
  `currentBalance` yang selalu live/all-time). `discrepancy = statement
  - book`, status Reconciled/Not Reconciled dari situ.
- **JournalEntries** — `/businesses/:id/journal-entries`. TIDAK ADA
  tabel baru (murni CRUD terbatas di atas `journal_entries`/
  `journal_entry_lines` yang udah ada sejak Fase 1.1). List nampilin
  SEMUA jurnal (dari modul manapun, read-only) + jurnal manual
  (`source_module='manual_journal'`, satu-satunya yang bisa
  diedit/dihapus dari modul ini — jurnal dari modul lain WAJIB ditolak
  kalau dicoba diedit/dihapus dari sini, harus lewat dokumen sumbernya).
  Field `Division`/`Tax Code` dan "Locked Period" dari dokumen resmi
  SENGAJA DILEWATI (modul pendukungnya belum ada).
- **PurchaseOrders** — `/businesses/:id/purchase-orders`. Dokumen
  NON-POSTING (tidak membuat jurnal). Tabel `purchase_orders` +
  `purchase_order_lines`; kolom `purchase_invoices.purchase_order_id`
  (nullable) jadi jembatan ke faktur turunan. Status dihitung
  (Draft/Open → Partially Invoiced → Fully Invoiced/Closed) dari
  Σ invoiceAmount faktur aktif yang merujuk PO itu vs total PO. Delete
  ditolak kalau sudah ada faktur turunan. "Convert to Invoice" dikerjakan
  di frontend (halaman Purchase Invoices dibuka dengan query
  `?convertFromPO=<id>`, form ter-prefill, `purchaseOrderId` ikut
  terkirim saat create faktur).
- **ExpenseClaims** — `/businesses/:id/expense-claims`. Payer = kontak
  mana pun di tabel `contacts` (tanpa flag khusus). Posting jurnal:
  Debit akun Expense/Asset per baris, Kredit akun kontrol Expense Claims
  (kolom BARU `chart_of_accounts.is_expense_claims_control_account`,
  TERPISAH dari `is_control_account` yang dipakai AR/AP; di bisnis dummy
  = akun 2300 "Utang Reimbursement Karyawan" dengan `isControlAccount`
  FALSE — jangan sampai ada dua akun kontrol AP). Pelunasan lewat
  Payments: `payment_lines.expense_claim_id` (XOR dengan
  `purchase_invoice_id`; satu baris cuma boleh salah satu). Status cuma
  Paid/Unpaid (tanpa Overdue). Catatan gaya kode: repository modul ini
  menyimpang dari pola modul lain (helper `cents`/`money`, `scope()`,
  error class sendiri, locking `for update`) — fungsional dan teruji,
  tapi kandidat penyeragaman kalau ada waktu refactor.
- **Projects** — `/businesses/:id/projects`. BUKAN modul transaksi:
  penanda (tag). Tabel `projects`; kolom `project_id` (nullable, FK) di
  6 tabel: `sales_invoices`, `purchase_invoices`, `receipts`, `payments`,
  `expense_claims`, `journal_entries` (khusus jurnal MANUAL; jurnal
  otomatis tidak mengisi project_id sendiri, tag melekat di dokumen
  sumbernya). Mengubah `project_id` TIDAK memicu repost jurnal (proyek
  tidak masuk isi jurnal). Validasi tag terpusat di
  `validateProjectAssignment` (ProjectRepository): proyek harus ada,
  satu bisnis, belum dihapus, dan berstatus `active` untuk tag BARU;
  tag yang sama pada dokumen lama tetap boleh walau proyeknya sudah
  inactive/completed (dropdown frontend juga tetap menampilkan proyek
  yang sedang tertanda). Delete proyek DITOLAK kalau masih ada dokumen
  aktif bertag (6 tabel; jurnal manual aktif ikut dicek).
  `totalIncome`/`totalExpenses`/`netProfit` dihitung live oleh
  `getProjectTotals` (1 query agregat UNION ALL untuk seluruh halaman):
  Income = Σ(kredit−debit) baris akun kategori Revenue, Expenses =
  Σ(debit−kredit) baris akun kategori Expense, dari jurnal aktif milik
  dokumen bertag (atau jurnal manual bertag). Kategori lain (Asset,
  Liability termasuk Utang Pajak & akun kontrol AP, Equity) TIDAK
  dihitung, jadi pajak tidak masuk income dan pelunasan Payment tidak
  dihitung ganda sebagai beban.
- **SalesQuotes** — `/businesses/:id/sales-quotes`. Non-posting, TANPA
  status, TANPA konversi otomatis ke Sales Order/Invoice (dokumen resmi
  sendiri bilang nggak ada jalur otomatis di tool asli — sengaja diikuti
  apa adanya). Baris item TANPA `account_id` (beda dari modul transaksi
  lain — belum ada konsep akun Revenue di tahap penawaran).
  `billingAddress` auto-isi dari Customer saat create (kalau body nggak
  kirim field itu eksplisit), `expiryDate` dihitung live dari
  `issueDate + validForDays`.
- **SalesOrders** — `/businesses/:id/sales-orders`. Struktur HAMPIR
  SAMA PERSIS Sales Quotes tapi lebih sedikit field: TANPA Valid For/
  Expiry Date, TANPA Billing Address (dokumen resmi sendiri nggak nyebut
  field itu buat modul ini — jangan ditambah sendiri). Field
  `orderNumber` yang udah ada di Sales Invoices tetap teks bebas (bukan
  FK), karena TIDAK ADA jalur konversi otomatis dari sini juga.
- **CreditNotes** — `/businesses/:id/credit-notes`. Modul TRANSAKSI
  (posting jurnal), TAPI TIDAK terikat ke Sales Invoice tertentu — beda
  dari pola alokasi Payments→Purchase Invoice. Jurnal KEBALIKAN dari
  Sales Invoices: Debit akun Revenue pilihan per baris, Kredit akun
  kontrol Accounts Receivable (`contactId`=customer), langsung ngurangin
  `accountsReceivable` Customer secara umum (live, sama pola perhitungan
  yang udah ada). Reuse `findArControlAccount` yang tadinya cuma dipakai
  SalesInvoiceRepository.
- **LatePaymentFees** — `/businesses/:id/late-payment-fees`. Modul
  PALING SIMPEL sejauh ini: TANPA baris item (1 tabel datar), TANPA
  jurnal sama sekali, TANPA endpoint GET detail terpisah (cuma
  list/create/update/delete — dokumen resmi eksplisit cuma minta 4
  endpoint). `amount` diisi MANUAL (bukan dihitung otomatis dari %/hari
  telat). WAJIB validasi silang: `salesInvoiceId` yang dipilih harus
  benar-benar milik `customerId` yang sama, ditolak 400 kalau nggak
  cocok — SELALU diuji dengan bikin 1 customer/invoice yang SENGAJA
  nggak cocok, bukan cuma diasumsikan.
- **DeliveryNotes** — `/businesses/:id/delivery-notes`. Murni
  administratif: baris item CUMA `description`+`quantity`, TANPA
  `unit_price`/`line_total`/`account_id` sama sekali (satu-satunya
  modul yang beneran nol nilai uang di baris itemnya). `sales_order_id`
  dan `sales_invoice_id` nullable, dropdown-nya difilter per Customer
  yang dipilih — TANPA jalur konversi otomatis.
- **BillableTime** — `/businesses/:id/billable-time`. **TIDAK ADA di
  dokumen spesifikasi asli Fase 3** — sempat 2x salah desain karena
  disusun dari riset forum Manager.io yang sudah lama (draft awal
  bikin mekanisme "Jadikan Invoice" otomatis yang TERNYATA NGGAK ADA di
  Manager.io versi sekarang). Setelah user eksplorasi LANGSUNG ke
  Manager.io asli dan menulis dokumen sendiri, ketahuan modul ini
  **100% berdiri sendiri** — TANPA jurnal, TANPA relasi ke Sales
  Invoices sama sekali (status "Uninvoiced" itu STATIS/hardcoded,
  bukan dihitung), penagihan harus diketik ulang manual di Sales
  Invoice. `employee_contact_id` reuse tabel `contacts` yang sama
  (kontak mana pun, pola sama kayak `payerContactId` Expense Claims) —
  project belum punya modul Employees sendiri. **Pelajaran baru**:
  kalau riset dari sumber publik/forum lama dipakai buat modul yang
  nggak ada di dokumen internal, ANGGAP SEMENTARA sampai user (atau
  orang yang lebih paham produknya) konfirmasi/eksplorasi langsung —
  jangan langsung eksekusi ke AI agent sebelum dikonfirmasi, sesuatu
  yang keliru di tool asli itu KEMUNGKINAN BESAR berubah dari waktu ke
  waktu (versi Manager.io berkembang), forum lama bisa udah basi.

### Status fase

- **Fase 0 (riset Manager.io), Fase 1 (fondasi), dan Fase 2 (13 modul
  Prioritas 1) SELESAI.** Urutan Fase 2 yang sudah tuntas: Customers,
  Suppliers, Bank and Cash Accounts, Sales Invoices, Purchase Invoices,
  Receipts, Payments, Inter Account Transfers, Bank Reconciliations,
  Journal Entries, Purchase Orders, Expense Claims, Projects.
- **Fase 3 (Modul Prioritas 2) — SEDANG BERJALAN.** Sudah selesai:
  Sales Quotes, Sales Orders, Credit Notes, Late Payment Fees, Delivery
  Notes, Billable Time (6 modul). **Berikutnya: Withholding Tax
  Receipts** — file "Analisis Manager.io kebutuhan Sistem Prioritas 2
  Pahrio Kaspiyanor.docx" (BEDA dari 6 modul di atas yang semuanya dari
  file "...Intern- Aulia.docx"). Sisa daftar dari roadmap:
  Withholding Tax Receipts, Purchase Quotes, Debit Notes, Goods
  Receipts, Inventory (Items, Transfers, Write-offs), Production
  Orders, Employees & Payslips (Payroll), Fixed Assets & Depreciation
  Entries, Intangible Assets & Amortization Entries, Capital Accounts,
  Special Accounts, Folders. Payroll dan Fixed Assets butuh analisis
  kebutuhan tambahan sebelum spesifikasinya ditulis (catatan roadmap).
  Billable Time (spesifikasi TIDAK ADA sebelumnya) sekarang sudah
  ADA — file "Analisis_Manager_io_Billable_Time.docx", hasil eksplorasi
  langsung user ke Manager.io asli.
  Lokasi spesifikasi (cek header section tiap file dulu, lihat catatan
  di bawah): file "Analisis_Manager_io Kebutuhan Sistem Prioritas 2
  Intern- Aulia" memuat Sales Quotes, Sales Orders, Delivery Notes,
  Credit Notes, Late Payment Fees; file "Analisis Manager.io kebutuhan
  Sistem Prioritas 2 Pahrio Kaspiyanor" memuat Withholding Tax Receipts,
  Purchase Quotes, Debit Notes, Goods Receipts, Inventory.
  Spesifikasi detail yang SUDAH ADA: 12 modul (Sales Quotes, Sales
  Orders, Credit Notes, Late Payment Fees, Delivery Notes, Billable
  Time, Withholding Tax Receipts, Purchase Quotes, Debit Notes, Goods
  Receipts, Inventory Items, Inventory Transfers). Spesifikasi yang
  BELUM ADA (jangan disusun dari tebakan/riset publik tanpa konfirmasi
  user — lihat pelajaran BillableTime di atas; minta ke manager/owner
  dulu; dokumen Prioritas 2 sendiri bilang "akan didokumentasikan pada
  tahap berikutnya"): Inventory Write-offs, Production Orders, Employees
  & Payslips, Fixed Assets & Depreciation Entries, Intangible Assets &
  Amortization Entries, Capital Accounts, Special Accounts, Folders.
  PERLU KEPUTUSAN DESAIN sebelum mengerjakan Inventory: modul ini
  mengubah baris item faktur dari "akun COA" (yang dipakai semua faktur
  sekarang) menjadi "item persediaan" + perhitungan HPP/COGS, jadi
  menyentuh modul yang sudah jadi (retrofit atau dikerjakan belakangan).
  Kerjakan modul-modul yang menyambung ke alur yang sudah ada lebih dulu
  (mis. Sales Quotes → Sales Orders → Credit Notes, yang berkaitan ke
  Sales Invoices), dan tanyakan urutan pastinya ke owner sebelum mulai.
- Fase 4 (fitur lintas modul: Attachments, History, Backup/Export,
  Divisions, Tax Codes, Custom fields, Emails, Obscure mode, Reports,
  Localization, Custom themes), Fase 5 (QA), Fase 6 (deployment) ada di
  roadmap. Catatan: field `Division`/`Tax Code`/`Project` yang sengaja
  dilewati di banyak modul menunggu Fase 4 (Divisions, Tax Codes).

### Pola yang sudah terbukti (pakai lagi di Fase 3)

1. Bedakan dulu apakah modul MEMBENTUK JURNAL (Sales/Purchase Invoices,
   Receipts, Payments, Transfers, Expense Claims, jurnal manual) atau
   NON-POSTING (Purchase Orders, Bank Reconciliations, Projects). Modul
   non-posting nggak menyentuh `journal_entries` sama sekali.
2. Status dokumen yang bergantung pada dokumen lain DIHITUNG saat GET,
   bukan disimpan sebagai kolom (Unpaid/Overdue/Paid, status PO, dst).
3. Relasi antar modul lewat kolom nullable (`purchase_order_id`,
   `project_id`, `expense_claim_id`, `purchase_invoice_id`), semuanya
   opsional supaya dokumen tanpa relasi tetap berfungsi normal.
4. Task lintas-modul (menyentuh banyak modul sekaligus) dipecah jadi
   beberapa CHECKPOINT, tiap checkpoint typecheck bersih lalu commit +
   push, supaya kalau kuota AI habis di tengah, kerjaan tetap aman.
5. Minta AI agent memverifikasi dengan skenario yang angka ekspektasinya
   sudah dihitung DULUAN oleh manusia/pemberi prompt, lalu user
   mengecek ulang sendiri lewat browser dengan data nyata. Jangan cuma
   percaya laporan "lolos".
6. Sebelum menyusun spesifikasi modul sendiri dari konteks, tanya user
   apakah ada file dokumen lain (lihat catatan dokumen analisis di
   bawah). Pernah 3 kali spesifikasi resmi ternyata ada di file lain.

### Dokumen analisis Fase 0 — CATATAN PENTING

Dokumen "Analisis_Manager_io — Kebutuhan Sistem" (Prioritas 1 & 2) TIDAK
selalu lengkap untuk semua modul dalam 1 file, dan ADA BEBERAPA FILE
DENGAN NAMA MIRIP yang isinya modul beda-beda (pernah ketemu sampai 3
file "Analisis..." sekaligus, cuma 1 yang punya modul yang dicari).
**Kalau detail modul kelihatan nggak lengkap atau user upload banyak
dokumen sekaligus, SELALU cek daftar section/judul modul di tiap file
dulu (grep header) sebelum nentuin dokumen mana yang dipakai — jangan
asumsi dari nama file doang.**

## Frontend (`fe-accounting/`)

- Stack: **React 19 + Vite + TanStack Router (file-based) + TanStack Query +
  TanStack Form + Zod + Tailwind CSS 4**, pnpm.
- **PENTING**: komponen UI yang TERSEDIA cuma: `button.tsx`, `card.tsx`,
  `dialog.tsx`, `dropdown-menu.tsx`, `input.tsx`. TIDAK ADA komponen
  `Select` — pakai `<select>` HTML native untuk dropdown.
- Port dev: **3000**. `.env` berisi `VITE_API_URL=http://localhost:4000`.
- Pola tiap modul: `hooks/use-X.ts` (useX list+CRUD via TanStack Query) +
  `routes/businesses.$businessId.X.tsx` (tabel + search + filter + dialog
  form tambah/edit + hapus dengan `window.confirm`).
- Modul dengan baris item dinamis: form pakai tabel baris yang bisa
  tambah/hapus (minimal 1 baris), kalkulasi subtotal/total dihitung LIVE
  di frontend untuk preview, tapi backend yang menghitung nilai final.
- Menu sidebar bisnis diatur di `config/menuConfig.ts`
  (`businessMenuItems`, dengan `allowedRoles` per item). Pilih ikon
  lucide-react yang BEDA per modul — CATATAN: Sales Invoices & Purchase
  Invoices MASIH share ikon `Receipt` yang sama (belum dirapikan, minor,
  boleh diperbaiki kapan-kapan kalau sempat).

### Modul yang sudah ada

- Login, Header global (dropdown ganti password/logout), profil user (`/user`)
- Businesses (list + detail + sidebar navigasi)
- Members (kelola anggota per bisnis)
- Chart of Accounts, Customers, Suppliers, Bank and Cash Accounts, Sales
  Invoices, Purchase Invoices, Receipts, Payments, Inter Account
  Transfers, Bank Reconciliations, Journal Entries, Purchase Orders, Expense
  Claims, Projects (13 modul Fase 2 lengkap), Sales Quotes, Sales Orders,
  Credit Notes, Late Payment Fees, Delivery Notes, Billable Time
  (6 modul Fase 3 sejauh ini)

## Aturan Kerja

- Backend dan frontend folder TERPISAH, masing-masing `package.json`
  sendiri — jangan `pnpm install`/`pnpm add` dari folder yang salah.
- Sebelum edit/buat file, selalu konfirmasi path lengkapnya (root repo di
  `clone-manager-io`, bukan di `backend` atau `fe-accounting`).
- Jangan sentuh `backend-legacy-express/`.
- Kredensial dev test: `admin@test.com` / `aulia123` (kalau login gagal,
  cek dulu apakah AI agent sesi sebelumnya sempat reset password buat
  testing — lihat pelajaran #5 di atas). BusinessId dummy yang sering
  dipakai testing: `d9d9760c-38a1-4849-a646-4206022f03c1` ("Contoh Bisnis
  (Dummy)").
- Tiap modul baru WAJIB: dokumen di `Dokumentasi Modul/` dulu → schema/
  migrasi manual → repository → routes → Zod validasi → frontend list/form/
  hapus → uji manual create→edit→delete (termasuk edge case: ganti relasi
  utama TANPA ganti detail lain), HAPUS data uji setelah selesai
  verifikasi (jangan tinggalkan sampah data percobaan, dan JANGAN
  hard-delete header tanpa jurnalnya — lihat pelajaran #4).
- Beberapa AI coding tool dipakai bergantian (Claude Code, OpenCode,
  Antigravity, Gemini CLI, Aider, 9Router) untuk hemat kuota. Selalu
  commit+push sebelum pindah tool. Waspada provider "gratisan"/pool tidak
  jelas asal-usulnya (privasi kode + kemungkinan melanggar ToS provider
  asli) — lebih aman pakai API key sendiri yang legitimate.
- **Commit dengan hati-hati**: SELALU `git status` dulu sebelum
  `git add`, baca daftarnya. Kalau semua yang muncul jelas punya kerjaan
  yang baru selesai, aman pakai `git add -A`. Kalau ada file yang
  nggak dikenal/mencurigakan (sisa sesi AI lain yang jalan bersamaan,
  script sementara yang lupa kehapus), JANGAN `git add -A` — pakai
  `git add <path spesifik>` buat file yang jelas-jelas punya kerjaan
  ini aja. Pernah kejadian script sementara ikut ke-commit gara-gara
  `-A` dipakai tanpa cek dulu.