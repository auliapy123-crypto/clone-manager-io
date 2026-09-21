# Clone Manager.io — Konteks Project

Aplikasi akuntansi custom-built, dibangun dari nol terpisah sepenuhnya dari
Manager.io (yang cuma dipakai sebagai referensi riset di Fase 0).

## Struktur Folder Repo

```
clone-manager-io/              <- root repo Git (git init di sini)
├── CLAUDE.md                   <- file ini
├── Schema.sql                  <- skema database awal (referensi historis, sudah agak basi)
├── Dokumentasi Modul/          <- spesifikasi tiap modul Fase 2 (format: Tujuan, Struktur
│                                  Data, Aturan Bisnis, Alur Status, List View, Form,
│                                  Contoh Data, Relasi Modul, Endpoint API)
├── backend/                    <- backend AKTIF (Fastify). INI yang dipakai.
├── backend-legacy-express/     <- backend LAMA (Express), diarsipkan, JANGAN disentuh
└── fe-accounting/               <- frontend (React + Vite), PUNYA git repo sendiri dulu
                                    (sudah digabung ke repo utama, .git-nya sudah dihapus)
```

**Catatan:** ada file/folder nyasar dari eksperimen tools lain (`.aider.tags.cache.v4`,
`start-ai-grid.bat`, dll) — abaikan, tidak relevan ke aplikasi.

## Backend (`backend/`)

- Stack: **Fastify 5 + TypeScript + Drizzle ORM + Zod**, pnpm.
- Database: PostgreSQL di Neon (cloud). **TIDAK ADA folder migrations** — semua
  perubahan skema dilakukan lewat `ALTER TABLE` manual ke Neon SQL Editor,
  lalu `db/schema.ts` disesuaikan manual juga. SELALU cek struktur tabel
  ASLI di Neon dulu sebelum asumsi skema di `schema.ts` sudah sinkron.
- Port: **4000** (bukan 8014, sudah final diseragamkan ke port ini).
- Pola arsitektur: **route → repository** (flat, tanpa service layer).
  Setiap modul: `schemas/X.ts` (Zod), `repositories/XRepository.ts` (pure
  function, tidak tahu HTTP), `plugins/XRoutes.ts` (Fastify route,
  `requireBusinessScopeParam`, `requireRole`/`requirePermissions`, audit log
  via `AuditLogRepository`, `operationId` wajib di tiap endpoint).
- Auth: JWT (access + refresh), multi-tenant, role: admin/accountant/viewer.
- Base path: `/businesses/:businessId/<resource>` (TIDAK ada prefix `/api`).
- Duplicate check: SELALU pakai `isPgUniqueViolation` (di `libs/safe-error.ts`)
  untuk translate error unik constraint jadi 409 — jangan biarkan error
  mentah lolos jadi 500.

### Modul yang sudah ada
- **Auth** — login, refresh, profil sendiri, ganti password
- **Users** — manajemen user (legacy path, masih dipakai)
- **Business** — CRUD bisnis + kelola anggota (`/businesses`,
  `/businesses/:id/members/*`)
- **ChartOfAccounts** — `/businesses/:id/accounts`, kategori
  Asset/Liability/Equity/Revenue/Expense
- **Customers & Suppliers** — SATU tabel `contacts` dibagi dua peran lewat
  flag `is_customer`/`is_supplier` (SATU kontak bisa jadi dua-duanya).
  Customers: `/businesses/:id/customers`. Suppliers:
  `/businesses/:id/suppliers`. `accountsReceivable`/`accountsPayable` selalu
  0 sampai modul transaksi (Sales/Purchase Invoices) ada.
- **BankAccounts** — `/businesses/:id/bank-accounts`, terikat ke
  `chartOfAccounts` (kategori Asset), `currentBalance` dihitung LIVE dari
  `journal_entry_lines` (otomatis benar begitu modul Journal Entries ada,
  bukan hardcode 0 kayak Customers/Suppliers).

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
- Menu sidebar bisnis diatur di `config/menuConfig.ts`
  (`businessMenuItems`, dengan `allowedRoles` per item).

### Modul yang sudah ada
- Login, Header global (dropdown ganti password/logout), profil user (`/user`)
- Businesses (list + detail + sidebar navigasi)
- Members (kelola anggota per bisnis)
- Chart of Accounts, Customers, Suppliers, Bank and Cash Accounts

## Aturan Kerja

- Backend dan frontend folder TERPISAH, masing-masing `package.json`
  sendiri — jangan `pnpm install`/`pnpm add` dari folder yang salah.
- Sebelum edit/buat file, selalu konfirmasi path lengkapnya (root repo di
  `clone-manager-io`, bukan di `backend` atau `fe-accounting`).
- Jangan sentuh `backend-legacy-express/`.
- Kredensial dev test: `admin@test.com`, password berubah-ubah seiring waktu
  testing — cek dengan owner project kalau perlu, jangan asumsi.
- Ikuti urutan modul Fase 2 sesuai §3 dokumen analisis (volume data):
  1. Customers ✅ 2. Suppliers ✅ 3. Bank and Cash Accounts ✅
  4. Sales Invoices (berikutnya) → Purchase Invoices → Receipts → Payments
  → dst.
- Tiap modul baru WAJIB: dokumen di `Dokumentasi Modul/` dulu → schema/
  migrasi manual → repository → routes → Zod validasi → frontend list/form/
  hapus → uji manual create→edit→delete.