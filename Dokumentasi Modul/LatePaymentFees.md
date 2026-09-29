# Dokumentasi Modul: Late Payment Fees (Denda Keterlambatan)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis Fitur dan Kebutuhan Sistem Manager intern - Aulia, §13

## 1. Tujuan Modul

Mencatat denda/biaya tambahan atas keterlambatan pembayaran pelanggan
terhadap Sales Invoice tertentu. **Modul PALING SIMPEL** — TANPA baris
item, TANPA jurnal, cuma 1 catatan datar per denda.

## 2. Keputusan Desain

1. **Field `Image` (lampiran) DILEWATI** di MVP ini — butuh infrastruktur
   upload file yang belum ada.
2. **TIDAK ADA endpoint GET detail (`:id`) terpisah** — dokumen resmi
   cuma nyebut 4 endpoint (list/create/update/delete), dan halaman edit
   nggak butuh "View" terpisah (beda dari modul lain). Form edit dipicu
   langsung dari baris di list (yang udah punya semua data dibutuhkan:
   Date, Customer, Sales Invoice, Amount), TANPA fetch tambahan.

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant | Catat, ubah, hapus denda |
| Viewer | Hanya baca |

## 4. Struktur Data

### 4.1 Tabel `late_payment_fees` (TANPA tabel baris item terpisah)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| date | date | Ya | Tanggal denda dicatat, default hari ini |
| customer_id | uuid | Ya | FK `contacts` (is_customer=true) |
| sales_invoice_id | uuid | Ya | FK `sales_invoices` — invoice yang terlambat dibayar |
| amount | numeric(18,2) | Ya | Nominal denda, diisi MANUAL (bukan dihitung otomatis dari % atau jumlah hari telat) |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

## 5. Aturan Bisnis

1. **Wajib**: `date`, Customer, Sales Invoice, `amount` > 0.
2. **`sales_invoice_id` harus milik `customer_id` yang sama** (validasi
   silang, biar nggak salah pasang invoice pelanggan lain).
3. **TIDAK ADA posting jurnal sama sekali** — modul ini murni catatan,
   TIDAK mempengaruhi saldo piutang maupun akun apa pun.
4. **Delete**: bebas, tanpa validasi lock.
5. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

## 6. Alur Status

TIDAK ADA status maupun tab Journal (karena memang nggak ada jurnal).
Data dibuat → langsung tersimpan sebagai catatan tunggal.

## 7. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Catat Denda", kotak pencarian (nama customer).
- **Kolom**: Date, Customer, Sales Invoice (tampilkan reference/nomor
  faktur), Amount, Aksi — **HANYA tombol Edit** (dokumen resmi eksplisit
  bilang beda dari modul lain, TANPA tombol View terpisah; tombol Hapus
  tetap ada, disediakan lewat dialog edit itu sendiri — lihat §8).

## 8. Spesifikasi Form Tambah/Edit

| Field | Komponen | Validasi |
|---|---|---|
| Date | Date picker | Wajib, default hari ini |
| Customer | Dropdown (Customers) | Wajib |
| Sales Invoice | Dropdown (Sales Invoices milik Customer yang dipilih — reset kalau Customer diganti) | Wajib |
| Amount | Number input | Wajib, > 0, diisi manual |

Dialog edit menampilkan tombol **Update** dan **Delete** berdampingan
(sesuai dokumen resmi: "halaman edit hanya menyediakan tombol Update
dan Delete"), TANPA Edit/Clone/Copy to/Print/PDF seperti modul lain.

## 9. Contoh Data

```json
{
  "date": "2026-09-29",
  "customerId": "<id PT Klien>",
  "salesInvoiceId": "<id Sales Invoice yang terlambat>",
  "amount": 25000
}
```

## 10. Relasi dengan Modul Lain

- **Customers**: `customer_id`.
- **Sales Invoices**: `sales_invoice_id`, WAJIB, jadi acuan invoice mana
  yang terlambat dibayar (murni referensi, TIDAK mempengaruhi
  `balanceDue` invoice itu).

## 11. Endpoint API

Base path: `/businesses/:businessId/late-payment-fees`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/late-payment-fees` | listLatePaymentFees | List (paginated), `?q=` |
| POST | `/businesses/:businessId/late-payment-fees` | createLatePaymentFee | Buat catatan denda |
| PUT | `/businesses/:businessId/late-payment-fees/:id` | updateLatePaymentFee | Update |
| DELETE | `/businesses/:businessId/late-payment-fees/:id` | deleteLatePaymentFee | Soft-delete, bebas |

TIDAK ADA endpoint GET detail (`:id`) terpisah — lihat §2.2. Semua
endpoint tulis perlu role `admin`/`accountant`; GET boleh semua role.