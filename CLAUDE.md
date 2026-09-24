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

### Modul yang SEDANG/AKAN dikerjakan (urutan §3 dokumen analisis)

Urutan: Customers ✅ → Suppliers ✅ → Bank and Cash Accounts ✅ →
Sales Invoices ✅ → Purchase Invoices ✅ → Receipts ✅ → Payments ✅ →
**Inter Account Transfers (berikutnya)** → Bank Reconciliations →
Journal Entries → Purchase Orders → Expense Claims → Projects.

**Inter Account Transfers**: detail lengkapnya UDAH ADA di file yang sama
dengan Receipts/Payments ("Analisis Fitur dan Kebutuhan Sistem Manager
intern- Aulia.docx", §4) — nggak perlu cari dokumen lain lagi, langsung
baca section itu sebelum mulai.

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
  Invoices, Purchase Invoices, Receipts, Payments

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