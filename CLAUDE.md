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

### ⚠️ Pelajaran pahit dari modul invoice (Sales & Purchase) — WAJIB diikuti modul berikutnya

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
3. **Bug "ganti relasi tanpa ganti detail" (ketemu di Purchase Invoices)**:
   kalau invoice punya field yang nge-trigger reposting jurnal (misal
   `lines`), JANGAN cuma cek "apakah lines berubah" buat keputusan repost
   — field LAIN yang mempengaruhi isi jurnal (contoh: `supplierId`/
   `customerId`, karena jurnal nyimpen `contactId`) HARUS JUGA jadi
   trigger reposting, walau lines-nya sendiri tidak berubah. Kalau lupa,
   entah invoice sudah pindah ke kontak baru tapi `accountsPayable`/
   `accountsReceivable` kontak lama-baru jadi salah (kontak lama masih
   "berutang" padahal invoice-nya sudah bukan miliknya lagi). Selalu
   tanya: "field apa saja yang nentuin isi jurnal ini?" lalu jadikan
   SEMUA itu trigger repost, bukan cuma satu field yang paling jelas.
4. Uang dihitung dalam **sen (integer)** kalau perlu presisi tinggi,
   hindari drift floating point.
5. Script sementara buat cek sesuatu ditaruh di folder `backend/`, jalankan
   pakai `tsx`, lalu **HAPUS** setelah dipakai (jangan biarkan nyampah).

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
  `/businesses/:id/suppliers`. `accountsReceivable` (Customers) dan
  `accountsPayable` (Suppliers) SUDAH live query dari jurnal (bukan
  hardcode 0 lagi).
- **BankAccounts** — `/businesses/:id/bank-accounts`, terikat ke
  `chartOfAccounts` (kategori Asset), `currentBalance` live dari jurnal
  (mengecualikan baris jurnal yang soft-deleted).
- **SalesInvoices** — `/businesses/:id/sales-invoices`. Tabel
  `sales_invoices` (header, TANPA kolom status/total tersimpan) +
  `sales_invoice_lines` (ADA pajak per baris `tax_rate_percent`/
  `tax_amount`). Status (Unpaid/Overdue/Paid) dan `balanceDue` DIHITUNG
  REAL-TIME saat GET. Create langsung posting jurnal (Debit AR, Kredit
  Income+Tax Payable per baris). Update: repost jurnal kalau lines ATAU
  customerId berubah (lihat pelajaran #3 di atas). Delete = soft-delete
  invoice + jurnalnya.
- **PurchaseInvoices** — `/businesses/:id/purchase-invoices`. Cerminan
  Sales Invoices dengan arah jurnal berlawanan (Debit Expense per baris,
  Kredit akun kontrol Accounts Payable). Terhubung ke Supplier. Scope MVP:
  TANPA pajak per baris, TANPA billing_address, `quote_number`/
  `order_number` teks nullable, DELETE bebas (belum ada modul Payments
  buat mengunci). Update: repost jurnal kalau lines ATAU supplierId
  berubah.
- Akun AR/AP kontrol dicari OTOMATIS di kedua modul invoice: satu-satunya
  akun kategori Asset(AR)/Liability(AP) + `isControlAccount=true` di
  bisnis itu — JANGAN hardcode kode akun tertentu.

### Modul yang SEDANG/AKAN dikerjakan (urutan §3 dokumen analisis)

Urutan: Customers ✅ → Suppliers ✅ → Bank and Cash Accounts ✅ →
Sales Invoices ✅ → Purchase Invoices ✅ → **Receipts (berikutnya)** →
Payments → Inter Account Transfers → Bank Reconciliations → Journal
Entries → Purchase Orders → Expense Claims → Projects.

**Receipts**: penerimaan pembayaran dari Customer, mengurangi
`balanceDue` Sales Invoices (sekarang selalu = invoiceAmount karena belum
ada Receipts). Kemungkinan besar polanya beda dari 2 modul invoice
(bukan bikin jurnal baru dari nol, tapi "mengalokasikan" pembayaran ke
1+ invoice yang ada) — cek dulu detail dokumen analisisnya sebelum
asumsi strukturnya sama persis kayak invoice.

### Dokumen analisis Fase 0 — CATATAN PENTING

Dokumen "Analisis_Manager_io — Kebutuhan Sistem" (Prioritas 1 & 2) TIDAK
selalu lengkap untuk semua modul dalam 1 file. Beberapa modul (Suppliers,
Sales Invoices, Purchase Invoices) baru ketemu detail lengkapnya di file
dengan nama gabungan/berbeda tak terduga (mis.
"...Bank_Reconciliation_Sales_Invoices...", atau file terpisah
"Analisis Fitur dan Kebutuhan Sistem Manager intern- Aulia.docx" untuk
Purchase Invoices). **Kalau detail modul kelihatan nggak lengkap di 1
file, JANGAN langsung asumsi tidak ada — tanya dulu ke pemilik project
apakah ada file lain dengan nama berbeda sebelum menyusun dokumen dari
konteks/tebakan sendiri.**

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
- Modul dengan baris item dinamis (Sales/Purchase Invoices): form pakai
  tabel baris yang bisa tambah/hapus (minimal 1 baris), kalkulasi
  subtotal/total dihitung LIVE di frontend untuk preview, tapi backend
  yang menghitung nilai final (jangan percaya angka dari client).
- Menu sidebar bisnis diatur di `config/menuConfig.ts`
  (`businessMenuItems`, dengan `allowedRoles` per item). Pilih ikon
  lucide-react yang BEDA per modul (jangan reuse ikon yang sama, pernah
  kejadian Sales & Purchase Invoices dikasih ikon `Receipt` yang sama).

### Modul yang sudah ada

- Login, Header global (dropdown ganti password/logout), profil user (`/user`)
- Businesses (list + detail + sidebar navigasi)
- Members (kelola anggota per bisnis)
- Chart of Accounts, Customers, Suppliers, Bank and Cash Accounts, Sales
  Invoices, Purchase Invoices

## Aturan Kerja

- Backend dan frontend folder TERPISAH, masing-masing `package.json`
  sendiri — jangan `pnpm install`/`pnpm add` dari folder yang salah.
- Sebelum edit/buat file, selalu konfirmasi path lengkapnya (root repo di
  `clone-manager-io`, bukan di `backend` atau `fe-accounting`).
- Jangan sentuh `backend-legacy-express/`.
- Kredensial dev test: `admin@test.com`, password berubah-ubah seiring
  waktu testing — cek dengan owner project kalau perlu, jangan asumsi.
  BusinessId dummy yang sering dipakai testing:
  `d9d9760c-38a1-4849-a646-4206022f03c1` ("Contoh Bisnis (Dummy)").
- Tiap modul baru WAJIB: dokumen di `Dokumentasi Modul/` dulu → schema/
  migrasi manual → repository → routes → Zod validasi → frontend list/form/
  hapus → uji manual create→edit→delete (termasuk edge case: ganti relasi
  utama TANPA ganti detail lain, lihat pelajaran #3), HAPUS data uji
  setelah selesai verifikasi (jangan tinggalkan sampah data percobaan).
- Beberapa AI coding tool dipakai bergantian (Claude Code, OpenCode,
  Antigravity, Gemini CLI, Aider, 9Router) untuk hemat kuota. Selalu
  commit+push sebelum pindah tool, supaya perubahan antar-tool tidak
  tumpang tindih. Waspada kalau pakai provider "gratisan"/pool tidak
  jelas asal-usulnya (privasi kode + kemungkinan melanggar ToS provider
  asli) — lebih aman pakai API key sendiri yang legitimate.