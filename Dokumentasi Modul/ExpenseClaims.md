# Dokumentasi Modul: Expense Claims (Klaim Biaya / Reimbursement)

> Status: Diimplementasikan — backend, frontend, dan alokasi Payments (25 September 2026)
> Sumber: Analisis Fitur dan Kebutuhan Sistem Manager intern - pahrio
> kaspiyanor, §6

## 1. Tujuan Modul

Mencatat pengeluaran operasional bisnis yang dibayar LEBIH DULU pakai
uang pribadi karyawan/pemilik ("Payer"), yang bikin bisnis punya
kewajiban buat ganti uang itu (reimburse) ke Payer tersebut.

## 2. Keputusan Desain Penting (penyesuaian dari dokumen resmi)

1. **"Expense Claim Payers" TIDAK dibikin jadi modul/tabel terpisah** —
   dokumen resmi nyebut ini sebagai referensi ke "pengaturan Expense
   Claim Payers" tersendiri, tapi project ini SUDAH PUNYA pola yang pas:
   tabel `contacts` yang sama dipakai Customers/Suppliers. Payer di sini
   **pakai `contacts` juga**, TANPA flag baru — kontak mana pun boleh
   jadi Payer (nggak perlu `is_customer`/`is_supplier` true).
2. **Butuh akun kontrol BARU**: "Expense Claims Liability" itu BEDA dari
   akun kontrol Accounts Payable yang udah dipakai Purchase Invoices/
   Payments. Supaya nggak bentrok sama logic pencarian akun kontrol AP
   yang udah ada (yang nyari "satu-satunya akun Liability+kontrol"),
   ditambah KOLOM BARU khusus di `chart_of_accounts`:
   `is_expense_claims_control_account` (boolean, default false) — TERPISAH
   dari `is_control_account` yang udah ada. Business dummy perlu
   ditambah 1 akun Liability baru (misal "Utang Reimbursement
   Karyawan") dengan flag ini `true`.
3. **Field `Tax Code`, `Division`, `Project` per baris**: SENGAJA
   DILEWATI (modul pendukungnya belum ada — Projects malah modul
   berikutnya setelah ini).
4. **Payee**: disederhanakan jadi teks bebas (bukan referensi), sesuai
   opsi "Teks" di dokumen resmi.

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Catat, ubah, hapus klaim biaya |
| Viewer | Hanya baca |

## 4. Struktur Data

### 4.1 Tabel `expense_claims` (header)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| date | date | Ya | Tanggal pengeluaran pribadi terjadi, default hari ini |
| reference | varchar(50) | Tidak | Nomor referensi klaim |
| payer_contact_id | uuid | Ya | FK `contacts` — siapa pun yang bayar duluan |
| payee | varchar(255) | Tidak | Teks bebas, nama pihak penerima pembayaran (misal nama toko) |
| description | text | Tidak | Keterangan tujuan klaim |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 4.2 Tabel `expense_claim_lines` (baris item)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| expense_claim_id | uuid | Ya | FK, ON DELETE CASCADE |
| account_id | uuid | Ya | FK `chart_of_accounts` kategori Expense atau Asset |
| description | varchar(255) | Tidak | Deskripsi baris |
| amount | numeric(18,2) | Ya | Nominal, > 0 |
| sort_order | integer | Ya | Urutan tampil |

### 4.3 Tabel `chart_of_accounts` — TAMBAH 1 KOLOM

| Kolom baru | Tipe | Keterangan |
|---|---|---|
| is_expense_claims_control_account | boolean, default false | Penanda akun Liability yang jadi kontrol "Utang Reimbursement" — TERPISAH dari `is_control_account` (yang dipakai AR/AP) |

### 4.4 Tabel `payment_lines` — TAMBAH 1 KOLOM

| Kolom baru | Tipe | Keterangan |
|---|---|---|
| expense_claim_id | uuid, nullable | FK `expense_claims` — diisi kalau baris Payment ini mengalokasikan pelunasan ke klaim biaya tertentu (paralel sama `purchase_invoice_id` yang udah ada) |

### 4.5 Field terhitung (real-time, TIDAK disimpan)

| Field | Cara Hitung |
|---|---|
| claimAmount | Σ(amount) semua baris |
| balanceDue | claimAmount − Σ(amount dari payment_lines yang expense_claim_id-nya klaim ini, payment header aktif) |
| status | `Paid` kalau balanceDue ≤ 0, else `Unpaid` (dokumen resmi cuma sebut 2 status, TANPA "Overdue" — beda dari Sales/Purchase Invoices) |

## 5. Aturan Bisnis

1. **Wajib**: pilih Payer, minimal 1 baris dengan `account_id` (kategori
   Expense/Asset) dan `amount` > 0.
2. **Posting jurnal otomatis SAAT DIBUAT**: **Debit** tiap `account_id`
   baris sebesar `amount`-nya; **Kredit** akun kontrol Expense Claims
   Liability sebesar total, dengan `contactId` = `payer_contact_id` (biar
   bisa dihitung saldo per-Payer, sama pola kayak AR/AP).
3. **Pelunasan (reimburse) LEWAT modul Payments yang udah ada** — bukan
   endpoint baru. `PaymentRepository` perlu diperluas: kalau baris
   Payment pilih akun kontrol Expense Claims Liability (bukan akun
   kontrol AP), munculkan opsi alokasi ke `expense_claim_id` (bukan
   `purchase_invoice_id`), validasi serupa (klaim harus milik `contact_id`
   header Payment, amount ≤ balanceDue klaim saat ini).
4. **Update**: WAJIB repost jurnal kalau `payer_contact_id` ATAU `lines`
   berubah.
5. **Delete**: soft-delete klaim + jurnalnya, bebas tanpa lock (sama
   pola kayak Receipts).
6. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

## 6. Alur Status

```
Expense Claim dicatat → langsung posting jurnal (Debit Expense/Asset, Kredit Expense Claims Liability)
        │
        ▼
   balanceDue = claimAmount (belum ada Payment yang alokasi ke sini)
        │
        ├── balanceDue > 0  →  status: Unpaid
        └── balanceDue ≤ 0  →  status: Paid (lewat Payment yang alokasi ke klaim ini)
```

## 7. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Klaim Baru", kotak pencarian.
- **Kolom**: Date, Reference, Payer, Payee, Description, Amount, Status
  (badge Unpaid kuning/Paid hijau), Aksi.
- **Baris total (footer)**: total `claimAmount`.

## 8. Spesifikasi Form Tambah/Edit

| Field | Komponen | Validasi |
|---|---|---|
| Date | Date picker | Wajib, default hari ini |
| Payer | Dropdown (Contacts) | Wajib |
| Reference | Text input | Opsional |
| Payee | Text input | Opsional |
| Description | Text input | Opsional |

**Baris item (tabel dinamis, minimal 1 baris):**

| Field | Komponen | Validasi |
|---|---|---|
| Account | Dropdown (COA kategori Expense/Asset) | Wajib |
| Description | Text input | Opsional |
| Amount | Number input | Wajib, > 0 |

## 9. Contoh Data

```json
{
  "date": "2026-09-25",
  "payerContactId": "<id kontak Budi Santoso>",
  "reference": "EXP-0019",
  "payee": "SPBU Pertamina",
  "description": "Bensin operasional kunjungan lapangan",
  "lines": [
    {
      "accountId": "<id akun Beban Bahan Bakar & Transportasi>",
      "amount": 350000
    }
  ]
}
```

## 10. Relasi dengan Modul Lain

- **Customers/Suppliers (Contacts)**: `payer_contact_id` — pakai tabel
  yang sama, tanpa flag khusus.
- **Chart of Accounts**: debit akun Expense/Asset pilihan, kredit akun
  kontrol Expense Claims Liability (kolom baru
  `is_expense_claims_control_account`).
- **Payments**: mekanisme pelunasan — `payment_lines.expense_claim_id`
  (kolom baru).

## 11. Endpoint API

Base path: `/businesses/:businessId/expense-claims`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/expense-claims` | listExpenseClaims | List (paginated), `?q=`, `?status=` |
| GET | `/businesses/:businessId/expense-claims/:id` | getExpenseClaim | Detail + baris + balanceDue/status |
| POST | `/businesses/:businessId/expense-claims` | createExpenseClaim | Buat + posting jurnal |
| PUT | `/businesses/:businessId/expense-claims/:id` | updateExpenseClaim | Update, susun ulang jurnal |
| DELETE | `/businesses/:businessId/expense-claims/:id` | deleteExpenseClaim | Soft-delete + jurnal terkait |

## 12. Catatan Implementasi dan Verifikasi

- Struktur Neon diperiksa sebelum perubahan: kedua tabel dan kedua kolom
  tambahan belum ada. Tabel, FK, indeks, dan constraint nominal positif
  sudah dibuat. `payment_lines` juga memiliki constraint yang melarang
  dua target alokasi pada satu baris.
- Akun bisnis dummy `2300` / `Utang Reimbursement Karyawan` dibuat dengan
  `is_control_account=false` dan `is_expense_claims_control_account=true`.
  API Chart of Accounts mengembalikan dan menerima flag baru; validasi
  melarang flag reimbursement pada kategori selain Liability atau bersamaan
  dengan flag kontrol AR/AP.
- `GET /businesses/:businessId/contacts` menyediakan seluruh kontak aktif,
  termasuk yang tidak memiliki peran customer/supplier. Dropdown Payer dan
  Payee Payments membaca semua halaman daftar kontak ini.
- List Expense Claims juga menerima `payerContactId` untuk pilihan alokasi
  Payments. Pilihan klaim membaca semua halaman; klaim Paid yang sudah
  dialokasikan pada Payment yang sedang diedit tetap tersedia. Saldo yang
  ditampilkan saat edit menambahkan kembali alokasi lama Payment tersebut.
- Nominal menerima maksimal dua desimal, dihitung dalam sen, dan dikonversi
  eksplisit ke `number` pada respons. Alokasi beberapa baris ke klaim sama
  dijumlahkan sebelum dibandingkan dengan saldo. Header klaim dikunci
  dalam transaksi ketika memvalidasi alokasi, untuk mencegah pembayaran
  bersamaan melebihi saldo.
- Perubahan payer atau lines memposting ulang jurnal. Perubahan date,
  reference, atau description juga memperbarui jurnal agar metadata tetap
  selaras. Update tanpa date mempertahankan tanggal lama.
- Verifikasi API bisnis dummy: klaim 350.000 → Payment 200.000 → saldo
  150.000/Unpaid → Payment 150.000 → saldo 0/Paid → hapus kedua Payment
  → saldo 350.000/Unpaid → hapus klaim dan jurnalnya.
- Verifikasi tambahan: ganti payer saja, jurnal debit=kredit, nominal
  berlebih, total alokasi beberapa baris berlebih, salah akun kontrol,
  salah Payee, dua target pada satu baris, update Payment dengan alokasi
  lama dikecualikan, serta regresi create/edit/delete alokasi Purchase Invoice.
- Data transaksi uji dibersihkan melalui API soft-delete beserta jurnalnya;
  akun kontrol 2300 dipertahankan sebagai konfigurasi bisnis.
