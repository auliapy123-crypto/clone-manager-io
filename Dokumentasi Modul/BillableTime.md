# Dokumentasi Modul: Billable Time (Jam Kerja yang Ditagihkan)

> Status: Draft — siap diimplementasikan (REVISI dari draft sebelumnya)
> Sumber: Analisis_Manager_io_Billable_Time.docx — hasil eksplorasi
> LANGSUNG ke aplikasi Manager.io asli oleh Muhammad Aulia Saputra,
> bukan riset dokumentasi publik. **Draft sebelumnya (berbasis riset
> forum Manager.io yang sudah lama) DIBATALKAN** — draft itu salah
> asumsi soal ada mekanisme "Jadikan Invoice" otomatis; ternyata TIDAK
> ADA sama sekali.

## 1. Tujuan Modul

Mencatat jam kerja staf/karyawan yang BERPOTENSI ditagihkan ke Customer
sebagai jasa (misal dukungan teknis, instalasi), dihitung dari tarif
per jam × waktu yang dihabiskan. **Berdiri sendiri** — TIDAK terhubung
otomatis ke Sales Invoice dengan cara apa pun.

## 2. Keputusan Desain (koreksi dari draft sebelumnya)

1. **TIDAK ADA mekanisme "Jadikan Invoice"** — dikonfirmasi lewat
   pengujian langsung: tombol "Copy to" cuma nawarin "New Billable
   Time" (duplikat diri sendiri), BUKAN ke Sales Invoice. Status
   "Uninvoiced" itu **statis** — nggak pernah berubah otomatis, bahkan
   kalau Sales Invoice dengan nominal identik dibuat terpisah secara
   manual. Penagihan = staf **ngetik ulang manual** Description/Qty/
   Unit Price ke baris item Sales Invoice yang sudah ada, TANPA
   referensi apa pun ke Billable Time asalnya.
2. **TIDAK ADA posting jurnal sama sekali** — modul ini murni catatan
   waktu kerja, belum menyentuh akuntansi apa pun.
3. **Field "Employee"** — project ini BELUM punya modul Employees
   (masih di daftar tunggu Fase 3, butuh analisis kebutuhan tambahan).
   Sebagai solusi sementara: **reuse tabel `contacts` yang sudah ada**
   (kontak mana pun, TANPA flag khusus is_customer/is_supplier) — pola
   yang SAMA kayak `payerContactId` di Expense Claims. Field ini
   ditampilkan sebagai "Employee" di UI meski secara teknis nunjuk ke
   tabel `contacts`.
4. **Endpoint `/copy`** (duplikat jadi Billable Time baru) —
   DIIMPLEMENTASIKAN karena sederhana (murni duplikasi data, beda dari
   fitur Print/PDF yang butuh infrastruktur cetak yang kita skip).
5. **Tombol "View" terpisah dari "Edit"** di list — SENGAJA
   DISEDERHANAKAN jadi 1 aksi "Edit" aja (form yang sama bisa dipakai
   buat lihat+ubah, konsisten sama pola SEMUA modul lain di project
   ini) — beda dari dokumen resmi yang nyebut "View, Edit" terpisah.

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant (mewakili "Staff/Karyawan" & "Staff Penjualan/Admin" — project ini nggak punya role granular sebanyak itu) | Catat, ubah, hapus, duplikat entry |
| Viewer | Hanya baca |

## 4. Struktur Data

### 4.1 Tabel `billable_time_entries` (TANPA tabel baris item terpisah)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| customer_id | uuid | Ya | FK `contacts` (is_customer=true) |
| employee_contact_id | uuid | Ya | FK `contacts` (kontak mana pun — lihat §2.3) |
| date | date | Ya | Tanggal pekerjaan dilakukan, default hari ini |
| description | text | Ya | Keterangan pekerjaan yang ditagihkan |
| hourly_rate | numeric(18,2) | Ya | Tarif per jam |
| time_spent_minutes | integer | Ya | Waktu yang dihabiskan, DISIMPAN DALAM MENIT (input UI jam+menit terpisah, dikonversi ke total menit sebelum simpan — biar nggak ada ambiguitas desimal) |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 4.2 Field terhitung (real-time, TIDAK disimpan)

| Field | Cara Hitung |
|---|---|
| amount | `hourly_rate × (time_spent_minutes / 60)`. Contoh dari dokumen: rate 3.00 × 101 jam (100h 60m = 6060 menit = 101 jam) = 303.00 |
| status | **SELALU "Uninvoiced"** — statis, TIDAK dihitung dari relasi apa pun (memang begitu di Manager.io asli, lihat §2.1) |

## 5. Aturan Bisnis

1. **Wajib**: Customer, Employee, `date`, `description`,
   `hourly_rate` ≥ 0, `time_spent_minutes` > 0 (input UI: jam ≥ 0 +
   menit 0-59, minimal salah satu > 0).
2. **TIDAK ADA posting jurnal** — create/update/delete murni CRUD.
3. **TIDAK ADA validasi/relasi ke Sales Invoice apa pun** — modul ini
   benar-benar berdiri sendiri.
4. **Delete**: bebas, tanpa validasi lock (nggak ada dokumen lain yang
   bergantung ke sini).
5. **RBAC**: create/update/delete/duplikat perlu role `admin` atau
   `accountant`. Viewer hanya GET.

## 6. Alur Status

```
Staf catat jam kerja (Customer, Employee, Date, Description, Hourly rate, Time spent)
        │
        ▼
   Amount dihitung otomatis (hourly_rate × jam desimal)
        │
        ▼
   Tersimpan dengan status "Uninvoiced" (STATIS, PERMANEN)
        │
        ▼
Kalau mau ditagih: staf bikin Sales Invoice BARU secara manual, ketik
ulang Description/Qty/Unit Price sendiri — Billable Time TETAP
"Uninvoiced" selamanya, TIDAK ada perubahan otomatis apa pun.
```

## 7. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Catat Jam Kerja", kotak pencarian (customer,
  employee, deskripsi).
- **Kolom**: Date, Customer, Employee, Description, Amount, Status
  (badge, SELALU "Uninvoiced"), Aksi (Edit, Duplikat, Hapus).
- **Baris total (footer)**: total `amount` — TIDAK ada di dokumen
  resmi tapi konsisten sama pola list modul lain di project ini, aman
  ditambahkan.

## 8. Spesifikasi Form Tambah/Edit

| Field | Komponen | Validasi |
|---|---|---|
| Customer | Dropdown (Customers) | Wajib |
| Employee | Dropdown (Contacts — SEMUA kontak, bukan cuma customer/supplier) | Wajib |
| Date | Date picker | Wajib, default hari ini |
| Description | Text input | Wajib |
| Hourly Rate | Number input | Wajib, ≥ 0 |
| Time Spent | 2 number input berdampingan: "Jam" + "Menit" (menit dibatasi 0-59) | Wajib, minimal salah satu > 0 |

Tampilkan **Amount** (read-only, dihitung live dari Hourly Rate ×
(Jam + Menit/60)) di bawah form.

## 9. Contoh Data

```json
{
  "customerId": "<id PT Klien>",
  "employeeContactId": "<id kontak Muhammad Aulia Saputra>",
  "date": "2026-09-30",
  "description": "Tagihan Paket Internet Corporate Bulan September 2026",
  "hourlyRate": 3.00,
  "timeSpentMinutes": 6060
}
```

Amount = 3.00 × (6060/60) = 3.00 × 101 = 303.00.

## 10. Relasi dengan Modul Lain

- **Customers**: `customer_id`, WAJIB.
- **Contacts**: `employee_contact_id` (reuse tabel yang sama, TANPA
  flag khusus).
- **Sales Invoices**: **TIDAK ADA relasi apa pun** — dicatat eksplisit
  di §2.1, jangan dibikin ada.

## 11. Endpoint API

Base path: `/businesses/:businessId/billable-time`

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/billable-time` | listBillableTime | List (paginated), `?q=` |
| GET | `/businesses/:businessId/billable-time/:id` | getBillableTime | Detail |
| POST | `/businesses/:businessId/billable-time` | createBillableTime | Buat entry baru |
| PUT | `/businesses/:businessId/billable-time/:id` | updateBillableTime | Update |
| DELETE | `/businesses/:businessId/billable-time/:id` | deleteBillableTime | Soft-delete, bebas |
| POST | `/businesses/:businessId/billable-time/:id/copy` | copyBillableTime | Duplikat jadi entry baru (Date default hari ini, sisanya sama persis) |

Semua endpoint tulis perlu role `admin`/`accountant`; GET boleh semua
role. TIDAK ADA logic jurnal, TIDAK ADA field/endpoint yang
menghubungkan ke Sales Invoice.