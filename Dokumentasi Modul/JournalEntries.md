# Dokumentasi Modul: Journal Entries (Jurnal Umum)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis Fitur dan Kebutuhan Sistem Manager intern - pahrio
> kaspiyanor, §4 (spesifikasi resmi ditemukan setelah draf pertama
> disusun dari LAPORAN_FASE_1_1_Desain_Database — draf pertama DIREVISI
> mengikuti dokumen resmi ini, bukan dibatalkan total karena inti
> arsitekturnya sudah cocok)

## 1. Tujuan Modul

Dua fungsi dalam satu modul:

1. **Buku Besar / General Ledger view** — tempat melihat SEMUA entri
   jurnal dari seluruh modul (Sales/Purchase Invoices, Receipts,
   Payments, Inter Account Transfers, dan manual), dalam satu daftar
   yang bisa difilter.
2. **Jurnal Manual (Manual Journal Entry)** — buat entri koreksi/
   penyesuaian yang nggak tercakup modul transaksi mana pun (misal:
   penyusutan aset, koreksi kesalahan pencatatan, jurnal pembukaan).
   Field `source_module` tabel `journal_entries` dari desain awal
   Fase 1.1 udah nyiapin nilai `'manual_journal'` khusus buat ini.

**Catatan dari dokumen resmi (di luar cakupan MVP, sengaja DILEWATI)**:
field `Division` dan `Tax Code` per baris (modul Divisions/Tax Codes
belum ada di project ini), dan aturan "nggak bisa hapus kalau periode
laporan sudah di-lock" (belum ada konsep Locked Period di sistem).
Dokumen resmi pakai istilah "Narration" buat keterangan header — di
sini dipakai sebagai `description` header (fungsinya sama).

## 2. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Lihat semua jurnal, buat/ubah/hapus jurnal MANUAL |
| Viewer | Hanya baca (semua jurnal, termasuk manual) |

## 3. Struktur Data

**TIDAK ADA tabel baru** — modul ini murni CRUD (terbatas) di atas
`journal_entries`/`journal_entry_lines` yang sudah ada sejak Fase 1.1:

| Tabel | Field relevan (sudah ada) |
|---|---|
| `journal_entries` | `id`, `business_id`, `entry_date`, `reference`, `source_module`, `source_id`, `description`, `deleted_at` |
| `journal_entry_lines` | `id`, `journal_entry_id`, `account_id`, `contact_id` (nullable), `debit`, `credit`, `description` |

### 3.1 Field terhitung

| Field | Cara Hitung |
|---|---|
| totalDebit / totalCredit | Σ(debit) / Σ(credit) semua baris — kedua nilai ini HARUS SAMA (prinsip double-entry, sudah dijaga di semua modul yang posting jurnal) |
| isManual | `true` kalau `source_module = 'manual_journal'`, `false` selainnya — dipakai buat nentuin boleh/nggaknya diedit dari modul ini |

## 4. Aturan Bisnis

1. **Modul ini READ-ONLY untuk jurnal dari modul lain** (Sales
   Invoices, Purchase Invoices, Receipts, Payments, Inter Account
   Transfers). Jurnal itu cuma bisa diubah/dihapus lewat dokumen
   sumbernya sendiri (misal: mau ubah jurnal Sales Invoice, edit Sales
   Invoice-nya, bukan lewat sini) — kalau dipaksa edit/hapus dari sini,
   backend WAJIB tolak (403/400 dengan pesan jelas: "Jurnal ini berasal
   dari modul lain, edit lewat dokumen sumbernya").
2. **Create/Update/Delete HANYA berlaku buat jurnal manual**
   (`source_module = 'manual_journal'`, dibuat lewat modul ini sendiri).
3. **Minimal 2 baris**, dan **total debit harus sama dengan total
   kredit** sebelum bisa disimpan (validasi backend, bukan cuma
   frontend) — prinsip double-entry standar, sama kayak semua modul
   transaksi sebelumnya.
4. **Tiap baris cuma boleh isi salah satu** dari `debit` ATAU `credit`
   (nggak boleh dua-duanya keisi sekaligus di baris yang sama, dan
   nggak boleh dua-duanya kosong/0).
5. **RBAC**: create/update/delete (jurnal manual) perlu role `admin`
   atau `accountant`. Viewer hanya GET (semua jurnal, manual maupun
   otomatis).

## 5. Alur Status

Tidak ada alur status — jurnal manual yang tersimpan langsung final
(sama pola kayak Receipts/Payments/Transfers, TANPA konsep draft).

## 6. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Jurnal Manual Baru" (cuma buat yang bisa nulis),
  kotak pencarian (reference, description).
- **Filter**: rentang tanggal (dari — sampai), `source_module` (Semua /
  Sales Invoice / Purchase Invoice / Receipt / Payment / Inter Account
  Transfer / Manual).
- **Kolom**: Entry Date, Reference, Source (badge nama modul asal),
  Description, Total Amount (totalDebit), Aksi (Lihat Detail; Edit &
  Hapus CUMA muncul kalau `isManual = true`).
- **Detail** (klik 1 baris): tampilkan semua baris `journal_entry_lines`
  (Account, Contact kalau ada, Debit, Credit, Description), plus total
  di bawah buat verifikasi visual debit=kredit.

## 7. Spesifikasi Form Tambah/Edit (Jurnal Manual)

**Header:**

| Field | Komponen | Validasi |
|---|---|---|
| Entry Date | Date picker | Wajib, default hari ini |
| Reference | Text input | Opsional |
| Description | Text input | Opsional |

**Baris item (tabel dinamis, minimal 2 baris):**

| Field | Komponen | Validasi |
|---|---|---|
| Account | Dropdown (Chart of Accounts, SEMUA kategori) | Wajib |
| Contact | Dropdown (Contacts, opsional — cuma relevan kalau baris ke akun AR/AP) | Opsional |
| Debit | Number input | Isi salah satu (debit ATAU credit) |
| Credit | Number input | Isi salah satu (debit ATAU credit) |
| Description | Text input | Opsional |

Live preview total Debit vs total Credit di bawah tabel — kasih
indikator visual (misal warna merah) kalau belum balance, dan tombol
Simpan di-disable sampai balance.

## 8. Contoh Data

```json
{
  "entryDate": "2026-09-24",
  "reference": "ADJ-001",
  "description": "Koreksi penyusutan peralatan bulan September",
  "lines": [
    {
      "accountId": "<id akun 'Beban Penyusutan'>",
      "debit": 500000,
      "credit": 0
    },
    {
      "accountId": "<id akun 'Akumulasi Penyusutan Peralatan'>",
      "debit": 0,
      "credit": 500000
    }
  ]
}
```

## 9. Relasi dengan Modul Lain

- **SEMUA modul transaksi** (Sales/Purchase Invoices, Receipts,
  Payments, Inter Account Transfers): jurnal otomatis mereka MUNCUL di
  sini (read-only), lewat `source_module`/`source_id`.
- **Chart of Accounts**: tiap baris terikat ke 1 akun.
- **Customers & Suppliers**: `contact_id` opsional per baris (buat
  sub-ledger AR/AP kalau jurnal manual menyentuh piutang/utang
  langsung).

## 10. Endpoint API

Base path: `/businesses/:businessId/journal-entries`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/journal-entries` | listJournalEntries | List (paginated), `?q=`, `?sourceModule=`, `?dateFrom=`, `?dateTo=` |
| GET | `/businesses/:businessId/journal-entries/:id` | getJournalEntry | Detail + baris lengkap |
| POST | `/businesses/:businessId/journal-entries` | createManualJournalEntry | Buat jurnal manual (selalu `source_module='manual_journal'`, `source_id=null`) |
| PUT | `/businesses/:businessId/journal-entries/:id` | updateManualJournalEntry | Update — TOLAK kalau `source_module != 'manual_journal'` |
| DELETE | `/businesses/:businessId/journal-entries/:id` | deleteManualJournalEntry | Soft-delete — TOLAK kalau `source_module != 'manual_journal'` |

Semua endpoint tulis perlu role `admin`/`accountant`; GET boleh semua
role (termasuk lihat jurnal dari modul lain, read-only).