# Dokumentasi Modul: Credit Notes (Nota Kredit)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis Fitur dan Kebutuhan Sistem Manager intern - Aulia, §12

## 1. Tujuan Modul

Mencatat retur barang/jasa atau koreksi pengurangan tagihan dari Sales
Invoice yang sudah diterbitkan. **Modul TRANSAKSI** (beda dari Sales
Quotes/Orders) — begitu dibuat, langsung posting jurnal dan mengurangi
piutang pelanggan.

## 2. Keputusan Desain Penting

1. **TIDAK terikat ke Sales Invoice tertentu.** Dokumen resmi cuma minta
   Customer (bukan invoice spesifik) di header, dan baris item cuma
   minta Account+Qty+Unit price (bukan invoice line reference). Credit
   Note mengurangi **saldo piutang pelanggan secara umum**, PERSIS
   kebalikan dari cara Sales Invoice membentuk jurnal — bukan
   "melunasi" satu invoice spesifik kayak pola alokasi Payments ke
   Purchase Invoice. Ini konsisten sama cara `accountsReceivable`
   Customer udah dihitung sejak awal (live dari SEMUA jurnal yang
   nyentuh akun AR milik kontak itu, bukan per-invoice).
2. **Tombol "Copy to" dan tab "Journal" terpisah** di halaman detail —
   SENGAJA DILEWATI di MVP ini. Buat lihat jurnalnya, user tinggal buka
   modul Journal Entries yang udah ada, filter `sourceModule` =
   `credit_note`.

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Buat, ubah, hapus Credit Note |
| Viewer | Hanya baca |

## 4. Struktur Data

### 4.1 Tabel `credit_notes` (header)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| customer_id | uuid | Ya | FK `contacts` (is_customer=true) |
| issue_date | date | Ya | Default hari ini |
| reference | varchar(50) | Tidak | Nomor referensi |
| description | text | Tidak | Alasan retur/koreksi |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 4.2 Tabel `credit_note_lines` (baris item)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| credit_note_id | uuid | Ya | FK, ON DELETE CASCADE |
| account_id | uuid | Ya | FK `chart_of_accounts` kategori Revenue (akun pendapatan yang dikurangi) |
| description | varchar(255) | Tidak | Deskripsi baris |
| quantity | numeric(18,4) | Ya | Default 1 |
| unit_price | numeric(18,2) | Ya | |
| line_total | numeric(18,2) | Ya | quantity × unit_price, dihitung backend |
| sort_order | integer | Ya | Urutan tampil |

### 4.3 Field terhitung (real-time, TIDAK disimpan)

| Field | Cara Hitung |
|---|---|
| totalAmount | Σ(line_total) semua baris |

## 5. Aturan Bisnis

1. **Wajib**: pilih Customer, `issue_date`, minimal 1 baris dengan
   `account_id` (kategori Revenue), `quantity` > 0, `unit_price` ≥ 0.
2. **Posting jurnal otomatis SAAT DIBUAT**: **Debit** tiap `account_id`
   baris (kategori Revenue) sebesar `line_total`-nya; **Kredit** akun
   kontrol Accounts Receivable bisnis sebesar `totalAmount`, dengan
   `contactId` = `customer_id` (biar ikut kehitung di
   `accountsReceivable` Customer — pola sama kayak jurnal Sales
   Invoice/Receipts).
3. **Update**: WAJIB repost jurnal kalau `customer_id` ATAU `lines`
   berubah (pelajaran #3 CLAUDE.md).
4. **Delete**: soft-delete Credit Note + jurnalnya, bebas tanpa lock.
5. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

## 6. Alur Status

TIDAK ADA status bertahap. Credit Note yang tersimpan langsung final —
jurnal langsung terbentuk, piutang pelanggan langsung berkurang, tanpa
tahapan lanjutan.

## 7. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Nota Kredit Baru", kotak pencarian (reference,
  nama customer, deskripsi).
- **Kolom**: Issue Date, Reference, Customer, Description, Total
  Amount, Aksi (Edit, Hapus).
- **Baris total (footer)**: total `totalAmount`.

## 8. Spesifikasi Form Tambah/Edit

| Field | Komponen | Validasi |
|---|---|---|
| Issue Date | Date picker | Wajib, default hari ini |
| Customer | Dropdown | Wajib |
| Reference | Text input | Opsional |
| Description | Text input | Opsional |

**Baris item (tabel dinamis, minimal 1 baris):**

| Field | Komponen | Validasi |
|---|---|---|
| Account | Dropdown (COA kategori Revenue) | Wajib |
| Description | Text input | Opsional |
| Qty | Number input | Wajib, > 0 |
| Unit Price | Number input | Wajib, ≥ 0 |
| Total | Otomatis | Read-only |

## 9. Contoh Data

```json
{
  "customerId": "<id PT Klien>",
  "issueDate": "2026-09-29",
  "description": "Retur sebagian atas Tagihan Paket Internet Corporate Bulan September 2026",
  "lines": [
    {
      "accountId": "<id akun Pendapatan Penjualan>",
      "description": "Retur layanan",
      "quantity": 1,
      "unitPrice": 500000
    }
  ]
}
```

Jurnal yang terbentuk: Debit Pendapatan Penjualan 500.000, Kredit
Piutang Usaha (PT Klien) 500.000.

## 10. Relasi dengan Modul Lain

- **Customers**: `customer_id`; `accountsReceivable` berkurang (live
  dari jurnal, sudah ada polanya).
- **Chart of Accounts**: debit akun Revenue pilihan, kredit akun
  kontrol Accounts Receivable (dicari otomatis, pola sama kayak Sales
  Invoices — satu-satunya akun Asset+kontrol).
- **Sales Invoices**: berelasi secara konsep (retur atas tagihan yang
  sudah diterbitkan), TAPI TANPA foreign key langsung — lihat §2.1.

## 11. Endpoint API

Base path: `/businesses/:businessId/credit-notes`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/credit-notes` | listCreditNotes | List (paginated), `?q=` |
| GET | `/businesses/:businessId/credit-notes/:id` | getCreditNote | Detail + baris item + totalAmount |
| POST | `/businesses/:businessId/credit-notes` | createCreditNote | Buat + posting jurnal |
| PUT | `/businesses/:businessId/credit-notes/:id` | updateCreditNote | Update, susun ulang jurnal |
| DELETE | `/businesses/:businessId/credit-notes/:id` | deleteCreditNote | Soft-delete + jurnal terkait |

Semua endpoint tulis perlu role `admin`/`accountant`; GET boleh semua
role.