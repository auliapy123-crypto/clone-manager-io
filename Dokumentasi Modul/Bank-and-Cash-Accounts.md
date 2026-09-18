# Spesifikasi Modul: Bank and Cash Accounts (Akun Kas & Bank)

Dokumen ini merupakan *single source of truth* (SSOT) teknis dan fungsional untuk implementasi modul **Bank and Cash Accounts** pada backend (Fastify + Drizzle ORM + PostgreSQL) dan frontend (React + Tailwind CSS).

---

## 1. Tujuan Modul

### 1.1 Fungsi Utama
- **Katalog Rekening & Kas Fisik**: Mengelola daftar rekening bank operasional, tabungan/deposito, serta kas kecil (*petty cash*) milik entitas bisnis.
- **Pemetaan Buku Besar (COA Mapping)**: Memetakan setiap rekening fisik ke akun buku besar (*Chart of Accounts*) kategori `asset` agar setiap mutasi finansial tercatat secara akuntansi standar.
- **Fondasi Transaksi Finansial**: Menjadi instrumen sumber dan tujuan pencatatan penerimaan uang (*Receive Money*), pengeluaran uang (*Spend Money*), transfer kas internal (*Transfer Money*), dan rekonsiliasi bank.

### 1.2 Batasan Modul (*Out of Scope*)
- **Pencatatan Mutasi Langsung**: Saldo dan mutasi kas/bank tidak diubah manual di tabel ini, melainkan dihitung secara agregatif dari baris jurnal umum (`journal_entry_lines`).
- **Integrasi Open Banking Langsung**: Modul ini tidak mengelola koneksi API perbankan langsung (scraping/host-to-host bank API); data mutasi bank diinput manual atau lewat impor file mutasi.
- **Valas Bertingkat Multi-kurs**: Penyesuaian selisih kurs dilakukan di jurnal penyesuaian/modul transaksi, bukan di master kas & bank ini.

---

## 2. Struktur Data (Schema Design)

Tabel target: `bank_accounts`.

### 2.1 Definisi Kolom & Tipe Data

| Nama Kolom | Tipe Data PG / Drizzle | Nullable | Default | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary Key. |
| `business_id` | `uuid` | NOT NULL | - | FK ke `businesses.id` ON DELETE CASCADE (batas multi-tenant). |
| `account_id` | `uuid` | NOT NULL | - | FK ke `chart_of_accounts.id` ON DELETE RESTRICT (Akun GL penampung). |
| `name` | `varchar(100)` | NOT NULL | - | Nama rekening internal (e.g. "BCA Operasional", "Kas Kecil Kasir"). |
| `account_type` | `varchar(20)` | NOT NULL | `'bank'` | Jenis instrumen: `'bank'` atau `'cash'`. |
| `bank_name` | `varchar(100)` | NULL | `null` | Nama bank penerbit (e.g. "BCA", "Mandiri"). Wajib bila `account_type = 'bank'`. |
| `account_number` | `varchar(50)` | NULL | `null` | Nomor rekening perbankan. Wajib bila `account_type = 'bank'`. |
| `currency_code` | `varchar(3)` | NOT NULL | `'IDR'` | Kode mata uang ISO 4217 (harus sama dengan mata uang pada COA terkait). |
| `description` | `text` | NULL | `null` | Catatan opsional atau keterangan rekening. |
| `status` | `varchar(20)` | NOT NULL | `'active'` | Status operasional: `'active'` atau `'archived'`. |
| `created_at` | `timestamp with time zone` | NOT NULL | `now()` | Waktu data dibuat. |
| `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | Waktu data terakhir diperbarui. |
| `deleted_at` | `timestamp with time zone` | NULL | `null` | Waktu penghapusan lunak (*soft-delete*). |

### 2.2 Relasi & Foreign Keys
- `fk_bank_accounts_business`: `business_id` -> `businesses.id` (ON DELETE CASCADE)
- `fk_bank_accounts_coa`: `account_id` -> `chart_of_accounts.id` (ON DELETE RESTRICT)

### 2.3 Indeks & Batasan Unik (Constraints)
- `PRIMARY KEY (id)`
- `UNIQUE (business_id, account_id) WHERE deleted_at IS NULL`: Satu akun COA hanya boleh terhubung ke satu rekening kas/bank aktif.
- `INDEX idx_bank_accounts_business_status (business_id, status) WHERE deleted_at IS NULL`
- `INDEX idx_bank_accounts_business_name (business_id, name)`

---

## 3. Aturan Bisnis (Business Rules)

### 3.1 Validasi Logika Backend
1. **Validasi Tipe Akun**:
   - Jika `account_type == 'bank'`: `bank_name` dan `account_number` wajib diisi (tidak boleh kosong atau whitespace).
   - Jika `account_type == 'cash'`: `bank_name` dan `account_number` dipaksa bernilai `null`.
2. **Integritas Akun COA**:
   - `account_id` harus milik `business_id` yang sama.
   - Kategori akun COA terkait harus bernilai `asset`.
   - Nilai `currency_code` pada rekening harus sama persis dengan `currency_code` akun COA.
   - Akun COA yang sedang digunakan oleh rekening kas/bank aktif lain tidak boleh dipakai ulang.
3. **Pencegahan Hapus (Deletion Guard)**:
   - Rekening kas/bank **tidak boleh di-soft-delete** bila akun COA terkait sudah memiliki baris jurnal (`journal_entry_lines`). Bila sudah ada riwayat transaksi, akun hanya dapat diubah statusnya menjadi `archived`.
4. **Proteksi Multi-Tenant**:
   - Seluruh query wajib membatasi `business_id` berdasarkan sesi user terautentikasi (`req.businessId`).

### 3.2 Kontrol Akses Berbasis Peran (RBAC)
- **`admin`**: Memiliki hak penuh: Create, Read, Update, Archive/Unarchive, Delete (soft-delete bila belum ada transaksi).
- **`accountant`**: Memiliki hak Create, Read, Update, Archive/Unarchive. **Tidak diizinkan** menghapus (Delete).
- **`viewer`**: Hanya memiliki izin membaca daftar dan detail data (Read-only).

### 3.3 Pencatatan Audit Log
Operasi penambahan, pembaruan, pengarsipan, dan penghapusan wajib mencatat riwayat ke `audit_logs` dengan format:
- `action`: `'create'`, `'update'`, atau `'delete'`
- `entityType`: `'bank_account'`
- `entityId`: `id` rekening kas/bank
- `oldValues`: snapshot data sebelum mutasi
- `newValues`: snapshot data sesudah mutasi

---

## 4. Alur Status (State Machine)

```
        [ Buat Akun Baru ]
                │
                ▼
        ┌──────────────┐
   ┌───►│    Active    │◄───┐
   │    └───────┬──────┘    │
Aktifkan        │           │
Kembali         │ Arsipkan  │ Batalkan Arsip
   │            ▼           │
   │    ┌──────────────┐    │
   └────┤   Archived   ├────┘
        └───────┬──────┘
                │ Soft-Delete (Hanya jika belum memiliki baris jurnal)
                ▼
        ┌──────────────┐
        │   Deleted    │ (deleted_at IS NOT NULL)
        └──────────────┘
```

1. **Active**: Akun aktif digunakan dan muncul pada formulir transaksi pengeluaran/penerimaan kas dan jurnal umum.
2. **Archived**: Akun dinonaktifkan dari pilihan transaksi baru; saldo historis dan laporan keuangan tetap menampilkan akun tersebut.
3. **Deleted**: Data dihapus secara lunak (soft-delete). Hanya diizinkan jika belum pernah terlibat transaksi jurnal apapun.

---

## 5. Tampilan Daftar (List View Specification)

### 5.1 Kolom Tabel Desktop
1. **Nama & Tipe**: Nama rekening kas/bank + badge tipe (`Bank` warna biru, `Kas` warna hijau).
2. **Bank / No. Rekening**: Nama institusi bank dan nomor rekening (atau tanda "-" bila tipe kas).
3. **Akun Buku Besar (COA)**: Kode dan nama akun COA terkait (e.g. `1-10001 - Rekening Operasional Mandiri`).
4. **Mata Uang**: Kode ISO 4217 (e.g. `IDR`, `USD`).
5. **Saldo Saat Ini**: Saldo buku besar hasil kalkulasi `SUM(debit - credit)` dari jurnal yang telah diposting.
6. **Status**: Badge status (`Active` hijau atau `Archived` abu-abu).
7. **Aksi**: Tombol dropdown dengan opsi: *Edit*, *Arsipkan/Aktifkan*, dan *Hapus*.

### 5.2 Tampilan Mobile (Stacked Cards)
- Card header: Nama rekening + Badge tipe akun.
- Baris 1: Institusi bank & no rekening (hanya untuk tipe bank).
- Baris 2: Akun COA penampung.
- Baris 3: Saldo saat ini (format tebal) & status operasional.
- Footer card: Tombol *Edit* dan dropdown aksi lanjutan.

### 5.3 Filter, Search, dan Pagination
- **Search (`q`)**: Melakukan pencarian substring peka huruf besar-kecil pada `name`, `bank_name`, dan `account_number`.
- **Filter Tipe (`account_type`)**: Opsi `all`, `bank`, `cash`.
- **Filter Status (`status`)**: Opsi `all`, `active`, `archived`.
- **Pagination**: Standar `page` (default 1) dan `pageSize` (default 20, batas maksimal 100).

---

## 6. Form Tambah & Edit

### 6.1 Field Input & Form Control
1. **Tipe Akun (`account_type`)**: Toggle button / Radio selection (`bank` / `cash`). Default: `bank`.
2. **Nama Akun (`name`)**: Input text. Panjang 3 - 100 karakter.
3. **Akun Buku Besar (`account_id`)**: Combobox / Select pilihan akun COA kategori `asset` yang belum dipetakan ke rekening kas/bank aktif lain.
4. **Nama Bank (`bank_name`)**: Input text / autocomplete nama bank. Wajib diisi jika `account_type == 'bank'`. Disabled/hidden jika `account_type == 'cash'`.
5. **Nomor Rekening (`account_number`)**: Input text nomor rekening. Wajib diisi jika `account_type == 'bank'`. Disabled/hidden jika `account_type == 'cash'`.
6. **Mata Uang (`currency_code`)**: Display text / read-only input otomatis terisi sesuai dengan mata uang dari `account_id` terpilih.
7. **Keterangan (`description`)**: Textarea opsional (maks 500 karakter).

### 6.2 Skema Validasi Zod (Backend & Frontend)

```typescript
import { z } from "zod";

export const bankAccountBaseSchema = z.object({
  name: z.string().trim().min(3, "Nama akun minimal 3 karakter").max(100, "Nama akun maksimal 100 karakter"),
  accountType: z.enum(["bank", "cash"], {
    errorMap: () => ({ message: "Tipe akun harus berupa 'bank' atau 'cash'" }),
  }),
  accountId: z.string().uuid("ID akun COA tidak valid"),
  bankName: z.string().trim().max(100).optional().nullable(),
  accountNumber: z.string().trim().max(50).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
});

export const createBankAccountSchema = bankAccountBaseSchema.superRefine((val, ctx) => {
  if (val.accountType === "bank") {
    if (!val.bankName || val.bankName.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bankName"],
        message: "Nama bank wajib diisi untuk tipe akun bank",
      });
    }
    if (!val.accountNumber || val.accountNumber.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accountNumber"],
        message: "Nomor rekening wajib diisi untuk tipe akun bank",
      });
    }
  }
});

export const updateBankAccountSchema = bankAccountBaseSchema.partial().superRefine((val, ctx) => {
  if (val.accountType === "bank") {
    if (val.bankName !== undefined && (!val.bankName || val.bankName.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bankName"],
        message: "Nama bank tidak boleh kosong untuk tipe akun bank",
      });
    }
    if (val.accountNumber !== undefined && (!val.accountNumber || val.accountNumber.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accountNumber"],
        message: "Nomor rekening tidak boleh kosong untuk tipe akun bank",
      });
    }
  }
});
```

---

## 7. Contoh Data (Mock / Sample Data)

### 7.1 Payload Valid - Buat Akun Bank
```json
{
  "name": "BCA Operasional PT",
  "accountType": "bank",
  "accountId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "bankName": "Bank Central Asia",
  "accountNumber": "8830192831",
  "description": "Rekening operasional penerimaan dan payroll karyawan"
}
```

### 7.2 Payload Valid - Buat Akun Kas Fisik
```json
{
  "name": "Kas Kecil Kantor Pusat",
  "accountType": "cash",
  "accountId": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  "bankName": null,
  "accountNumber": null,
  "description": "Kas fisik kasir kas kecil kantor pusat"
}
```

### 7.3 Payload Invalid (Error Validasi Tipe Bank Tanpa Nomor Rekening)
```json
// Request Body
{
  "name": "Bank Mandiri Utama",
  "accountType": "bank",
  "accountId": "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
  "bankName": "Bank Mandiri",
  "accountNumber": ""
}

// HTTP Response: 400 Bad Request
{
  "error": "BAD_REQUEST",
  "message": "Nomor rekening wajib diisi untuk tipe akun bank"
}
```

---

## 8. Relasi Antar-Modul

```
   ┌───────────────────────────┐
   │       businesses          │
   └─────────────┬─────────────┘
                 │ 1:N
                 ▼
   ┌───────────────────────────┐         1:1         ┌───────────────────────────┐
   │     bank_accounts         ├────────────────────►│    chart_of_accounts      │
   │ (Akun Kas & Bank Fisik)   │                     │      (category: asset)    │
   └─────────────┬─────────────┘                     └─────────────┬─────────────┘
                 │                                                 │ 1:N
                 │ Direferensikan transaksi                        │
                 ▼                                                 ▼
   ┌───────────────────────────┐                     ┌───────────────────────────┐
   │ Bank Transactions / Rules │                     │   journal_entry_lines     │
   │ (Receive/Spend/Transfer)  │                     │ (Perhitungan Saldo Buku)  │
   └───────────────────────────┘                     └───────────────────────────┘
```

1. **Chart of Accounts (COA)**:
   - Setiap baris pada `bank_accounts` wajib mereferensikan satu akun GL bertipe aset pada `chart_of_accounts`.
   - Tidak diperkenankan membuat akun kas & bank yang mengarah ke akun liabilitas, ekuitas, pendapatan, atau beban.
2. **Jurnal Umum & Buku Besar**:
   - Saldo berjalan (*current balance*) dihitung dari agregasi `journal_entry_lines` yang memiliki `account_id` sama.
   - Pengecekan sebelum penghapusan data (`deleted_at`) memverifikasi ketiadaan catatan pada `journal_entry_lines`.
3. **Transaksi Penerimaan / Pengeluaran / Transfer Kas**:
   - Modul transaksi kas hanya menampilkan rekening kas/bank dengan `status = 'active'`.

---

## 9. Daftar Endpoint API Fastify

Semua endpoint berada di bawah prefix `/businesses/:businessId/bank-accounts` dan mewajibkan autentikasi serta verifikasi akses tenant (`requireAuth` dan `requireBusinessScopeParam`).

| Method | Endpoint | Peran Akses | Deskripsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/businesses/:businessId/bank-accounts` | Viewer, Accountant, Admin | Mendapatkan daftar rekening kas/bank (paginated, filter, search, calculated balance). |
| `POST` | `/businesses/:businessId/bank-accounts` | Accountant, Admin | Mendaftarkan rekening kas/bank baru. |
| `GET` | `/businesses/:businessId/bank-accounts/:id` | Viewer, Accountant, Admin | Mengambil rincian informasi satu rekening kas/bank. |
| `PUT` | `/businesses/:businessId/bank-accounts/:id` | Accountant, Admin | Memperbarui informasi rekening kas/bank. |
| `PATCH` | `/businesses/:businessId/bank-accounts/:id/status` | Accountant, Admin | Mengubah status rekening (`active` <-> `archived`). |
| `DELETE` | `/businesses/:businessId/bank-accounts/:id` | Admin | Soft-delete rekening (hanya jika belum memiliki baris transaksi jurnal). |

### 9.1 Spesifikasi Payload & Response Endpoint

#### `GET /businesses/:businessId/bank-accounts`
- **Query Params**:
  - `page`: number (default: 1)
  - `pageSize`: number (default: 20)
  - `q`: string (opsional)
  - `accountType`: `"bank"` | `"cash"` (opsional)
  - `status`: `"active"` | `"archived"` (opsional)
- **Response (200 OK)**:
```json
{
  "data": [
    {
      "id": "7fa85f64-5717-4562-b3fc-2c963f66afa6",
      "businessId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "accountId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "accountCode": "1-10001",
      "accountName": "Bank BCA Utama",
      "name": "BCA Operasional PT",
      "accountType": "bank",
      "bankName": "Bank Central Asia",
      "accountNumber": "8830192831",
      "currencyCode": "IDR",
      "description": "Rekening operasional kantor",
      "status": "active",
      "currentBalance": 125000000.00,
      "createdAt": "2026-09-18T10:00:00.000Z",
      "updatedAt": "2026-09-18T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

#### `POST /businesses/:businessId/bank-accounts`
- **Request Body**: Sesuai skema `createBankAccountSchema`.
- **Response (201 Created)**: Mengembalikan objek data rekening yang baru saja dibuat.

#### `PATCH /businesses/:businessId/bank-accounts/:id/status`
- **Request Body**:
```json
{
  "status": "archived" // atau "active"
}
```
- **Response (200 OK)**:
```json
{
  "data": {
    "id": "7fa85f64-5717-4562-b3fc-2c963f66afa6",
    "status": "archived",
    "updatedAt": "2026-09-18T10:30:00.000Z"
  }
}
```

#### `DELETE /businesses/:businessId/bank-accounts/:id`
- **Response (200 OK)**:
```json
{
  "data": {
    "id": "7fa85f64-5717-4562-b3fc-2c963f66afa6",
    "deleted": true
  }
}
```
- **Response (400 Bad Request - Jika sudah ada transaksi jurnal)**:
```json
{
  "error": "BAD_REQUEST",
  "message": "Akun kas/bank tidak dapat dihapus karena sudah memiliki transaksi. Silakan arsipkan akun."
}
```
