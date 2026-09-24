# Dokumentasi Modul: Inter Account Transfers (Transfer Antar Akun)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis Fitur dan Kebutuhan Sistem Manager intern - Aulia, §4

## 1. Tujuan Modul

Memindahkan saldo dari satu akun Bank/Kas ke akun Bank/Kas lain yang
masih dalam bisnis yang sama (misal setor tunai dari Kas Kantor ke
rekening Bank). **Modul PALING SIMPEL** dibanding semua modul
sebelumnya — TIDAK ADA baris item dinamis, cuma 2 akun + 1 nominal.

## 2. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Catat, ubah, hapus transfer |
| Viewer | Hanya baca |

## 3. Struktur Data

### 3.1 Tabel `inter_account_transfers` (TANPA tabel baris item terpisah)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| date | date | Ya | Default hari ini |
| reference | varchar(50) | Tidak | Nomor referensi teks bebas (opsi "Automatic" Manager.io TIDAK diimplementasikan, sama seperti modul lain) |
| description | text | Tidak | Keterangan |
| from_bank_account_id | uuid | Ya | FK `bank_accounts` ("Paid from" — akun sumber, saldo berkurang) |
| to_bank_account_id | uuid | Ya | FK `bank_accounts` ("Received in" — akun tujuan, saldo bertambah) |
| amount | numeric(18,2) | Ya | Nominal yang dipindahkan, > 0. SATU nominal ini dipakai buat dua sisi (Paid from Amount = Received in Amount, karena cuma perpindahan saldo sendiri, bukan pendapatan/beban baru) |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 3.2 Field terhitung

Tidak ada. Tidak ada status/balance yang dihitung (mirip Receipts).

**Sengaja DITUNDA di MVP ini** (sama seperti keputusan di Payments):
opsi "Cleared: On the same date / On a later date" per sisi (konsep
pending transaction, terkait modul Bank Reconciliations nanti). Semua
transfer di versi ini langsung final begitu disimpan.

## 4. Aturan Bisnis

1. **Wajib**: `from_bank_account_id` dan `to_bank_account_id` harus
   BEDA (nggak boleh transfer ke akun yang sama). `amount` harus > 0.
2. **Posting jurnal otomatis SAAT DIBUAT**: **Debit** akun COA yang
   terhubung ke `to_bank_account_id` sebesar `amount`; **Kredit** akun
   COA yang terhubung ke `from_bank_account_id` sebesar `amount` juga
   (sama persis, karena ini cuma perpindahan, bukan transaksi P&L).
3. **Update**: WAJIB repost jurnal kalau `from_bank_account_id`,
   `to_bank_account_id`, ATAU `amount` berubah (pelajaran #3 CLAUDE.md
   — di modul ini nggak ada "lines" terpisah, jadi field pemicu repost-nya
   ya 3 field itu sendiri).
4. **Delete**: soft-delete transfer + jurnalnya, bebas tanpa lock.
5. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

## 5. Alur Status

Tidak ada alur status (lihat catatan §3.2). Transfer yang tersimpan
otomatis final — langsung mengurangi `currentBalance` akun sumber dan
menambah `currentBalance` akun tujuan (live query dari jurnal, sudah ada
dari awal).

## 6. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Buat Transfer", kotak pencarian.
- **Kolom**: Date, Paid from (nama akun), Received in (nama akun),
  Description, Amount, Aksi (Edit, Hapus).
- **Baris total (footer)**: total `amount` dari transfer yang tampil.

## 7. Spesifikasi Form Tambah/Edit

| Field | Komponen | Validasi |
|---|---|---|
| Date | Date picker | Wajib, default hari ini |
| Reference | Text input | Opsional |
| Description | Text input | Opsional |
| Paid from | Dropdown (Bank and Cash Accounts aktif) | Wajib |
| Received in | Dropdown (Bank and Cash Accounts aktif) | Wajib, HARUS beda dari "Paid from" (validasi frontend + backend) |
| Amount | Number input | Wajib, > 0 |

## 8. Contoh Data

```json
{
  "date": "2026-09-24",
  "description": "Setor tunai ke rekening bank",
  "fromBankAccountId": "<id Kas Kantor Pusat>",
  "toBankAccountId": "<id Bank Mandiri>",
  "amount": 500000
}
```

## 9. Relasi dengan Modul Lain

- **Bank and Cash Accounts**: `from_bank_account_id` dan
  `to_bank_account_id`; `currentBalance` dua-duanya ikut berubah (live
  query, sudah ada). Kedua akun sama-sama dikelompokkan ke kategori
  Asset (Cash & cash equivalents) — meski jenisnya beda (kas vs bank).

## 10. Endpoint API

Base path: `/businesses/:businessId/inter-account-transfers`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/inter-account-transfers` | listInterAccountTransfers | List (paginated), `?q=` |
| GET | `/businesses/:businessId/inter-account-transfers/:transferId` | getInterAccountTransfer | Detail |
| POST | `/businesses/:businessId/inter-account-transfers` | createInterAccountTransfer | Buat + posting jurnal |
| PUT | `/businesses/:businessId/inter-account-transfers/:transferId` | updateInterAccountTransfer | Update, susun ulang jurnal |
| DELETE | `/businesses/:businessId/inter-account-transfers/:transferId` | deleteInterAccountTransfer | Soft-delete + jurnal terkait |

Semua endpoint tulis perlu role `admin`/`accountant`; GET boleh semua
role. Validasi utama (sesuai dokumen §4.10): akun asal ≠ akun tujuan,
nominal harus positif.