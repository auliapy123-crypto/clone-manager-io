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
| totalIncome | Σ(kredit) baris jurnal AKTIF berkategori Revenue, dari jurnal sumber (`sales_invoices`/`receipts`) yang `project_id` = proyek ini |
| totalExpenses | Σ(debit) baris jurnal AKTIF berkategori Expense, dari jurnal sumber (`purchase_invoices`/`payments`/`expense_claims`) YANG `project_id` = proyek ini, DITAMBAH jurnal manual yang `project_id`-nya langsung diisi proyek ini |
| netProfit | `totalIncome - totalExpenses` |

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