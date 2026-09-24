# Dokumentasi Modul: Bank Reconciliations (Rekonsiliasi Bank)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis_Manager_io — Kebutuhan Sistem, §11 (file yang sama
> dengan Sales Invoices)

## 1. Tujuan Modul

Instrumen verifikasi berkala: mencocokkan saldo catatan pembukuan kita
(Book Balance, dihitung dari jurnal) dengan saldo riil di rekening koran
bank (Statement Balance) pada tanggal tertentu (cutoff date). **Modul
ini BUKAN tempat input transaksi harian** — cuma "lembar cek" buat
mendeteksi selisih (Discrepancy).

## 2. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Buat, ubah, hapus lembar rekonsiliasi |
| Viewer | Hanya baca |

## 3. Struktur Data

### 3.1 Tabel `bank_reconciliations`

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| date | date | Ya | Tanggal cutoff (tanggal akhir rekening koran) |
| bank_account_id | uuid | Ya | FK `bank_accounts` |
| statement_balance | numeric(18,2) | Ya | Saldo akhir riil dari rekening koran, default 0 |
| description | text | Tidak | Catatan tambahan |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

**Sengaja DITUNDA di MVP ini** (di luar cakupan, butuh infrastruktur
upload file yang belum ada di aplikasi ini): field `Image` (lampiran
scan rekening koran).

### 3.2 Field terhitung (real-time, TIDAK disimpan)

| Field | Cara Hitung |
|---|---|
| bookBalance | Saldo akun bank menurut jurnal kita, **DIHITUNG SAMPAI TANGGAL `date`** (bukan saldo "live" all-time seperti `currentBalance` di modul Bank and Cash Accounts — ini butuh query baru yang filter `journal_entries.entry_date <= date`) |
| discrepancy | `statement_balance - bookBalance` |
| status | `Reconciled` (hijau) kalau `discrepancy = 0`; `Not Reconciled` (merah) kalau selain itu |

## 4. Aturan Bisnis

1. **Wajib**: pilih `bank_account_id` dan `date`. `statement_balance`
   wajib diisi (boleh 0).
2. **`bookBalance` dihitung per tanggal**, BEDA dari `currentBalance`
   modul Bank Accounts yang selalu "sampai hari ini" — di sini perlu
   fungsi baru: SUM(debit−kredit) jurnal pada akun COA bank itu, HANYA
   yang `entry_date <= date` dan jurnal aktif (belum di-soft-delete).
3. **TIDAK ADA posting jurnal** dari modul ini — ini murni alat
   verifikasi/laporan, bukan transaksi.
4. **Delete**: soft-delete lembar rekonsiliasi, bebas tanpa lock (ini
   cuma "catatan pengecekan", bukan transaksi yang mempengaruhi saldo).
5. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

**Sengaja DITUNDA di MVP ini** (fitur lanjutan, butuh desain terpisah):
"Proteksi Edit Transaksi Lampau" — Manager.io mengunci Receipts/Payments/
Transfers pada periode yang sudah direkonsiliasi supaya nggak bisa
diubah/dihapus sembarangan (biar nggak bikin discrepancy baru). Di versi
ini, transaksi tetap bisa diedit/dihapus bebas meski udah ada
rekonsiliasi yang mencakup tanggalnya — sengaja disederhanakan dulu,
bisa ditambah nanti sebagai iterasi lanjutan.

## 5. Alur Status (dihitung, bukan disimpan)

```
Terima rekening koran dari bank
        │
        ▼
Buat lembar rekonsiliasi (pilih Bank Account, Date, isi Statement Balance)
        │
        ▼
Sistem hitung bookBalance & discrepancy otomatis
        │
        ├── discrepancy = 0   →  Status: Reconciled (hijau)
        └── discrepancy ≠ 0   →  Status: Not Reconciled (merah)
                                   → klik nominal discrepancy untuk
                                     lihat daftar transaksi Receipts/
                                     Payments/Transfers akun itu sampai
                                     tanggal cutoff (bantu telusuri
                                     penyebab selisih — versi simpel,
                                     nampilin SEMUA transaksi, bukan
                                     cuma yang "uncleared" karena konsep
                                     itu ditunda)
```

## 6. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Rekonsiliasi Baru", kotak pencarian.
- **Kolom**: Date, Bank Account, Statement Balance, Discrepancy (angka
  biru, bisa diklik), Status (badge), Aksi (Edit, Hapus).

## 7. Spesifikasi Form Tambah/Edit

| Field | Komponen | Validasi |
|---|---|---|
| Date | Date picker | Wajib |
| Bank Account | Dropdown (Bank and Cash Accounts aktif) | Wajib |
| Statement Balance | Number input | Wajib, default 0 |
| Description | Text input | Opsional |

## 8. Contoh Data

```json
{
  "date": "2026-08-29",
  "bankAccountId": "<id Bank BCA>",
  "statementBalance": 15000000
}
```

## 9. Relasi dengan Modul Lain

- **Bank and Cash Accounts**: `bank_account_id`; memverifikasi
  `currentBalance` akun itu (tapi `bookBalance` di sini dihitung per
  tanggal cutoff, bukan live).
- **Receipts, Payments, Inter Account Transfers**: sumber transaksi yang
  diagregasi buat hitung `bookBalance`; diklik dari `discrepancy` buat
  drill-down.

## 10. Endpoint API

Base path: `/businesses/:businessId/bank-reconciliations`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/bank-reconciliations` | listBankReconciliations | List (paginated), `?q=` |
| GET | `/businesses/:businessId/bank-reconciliations/:id` | getBankReconciliation | Detail + bookBalance/discrepancy/status |
| POST | `/businesses/:businessId/bank-reconciliations` | createBankReconciliation | Buat lembar rekonsiliasi |
| PUT | `/businesses/:businessId/bank-reconciliations/:id` | updateBankReconciliation | Update |
| DELETE | `/businesses/:businessId/bank-reconciliations/:id` | deleteBankReconciliation | Soft-delete |

Semua endpoint tulis perlu role `admin`/`accountant`; GET boleh semua
role. TIDAK ADA logic jurnal di modul ini (beda dari modul-modul
transaksi sebelumnya) — cukup CRUD + kalkulasi baca-saja.