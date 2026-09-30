# Dokumentasi Modul: Delivery Notes (Surat Jalan)

> Status: Draft — siap diimplementasikan
> Sumber: Analisis Fitur dan Kebutuhan Sistem Manager intern - Aulia, §14
> (modul TERAKHIR di file ini — Sales Quotes s/d Delivery Notes tuntas
> setelah modul ini)

## 1. Tujuan Modul

Mencatat bukti pengiriman barang/jasa ke pelanggan atas pesanan yang
udah disepakati. **Murni dokumen administratif** — TIDAK mencatat nilai
uang sama sekali (nggak ada Unit Price/Total di baris item), TIDAK ADA
status, TIDAK ADA jurnal.

## 2. Keputusan Desain

1. **Order number & Invoice number** — dokumen resmi bilang "otomatis
   tersedia sebagai referensi" ke Sales Order/Sales Invoice milik
   pelanggan yang sama, TAPI "ketiga modul tersebut tidak saling
   menyediakan jalur otomatis melalui tombol Copy to". Diimplementasikan
   sebagai: 2 kolom FK NULLABLE (`sales_order_id`, `sales_invoice_id`),
   dropdown-nya DIFILTER otomatis ke dokumen milik `customer_id` yang
   lagi dipilih (mirip pola dropdown "Invoice" di Payments yang
   difilter per Payee) — BUKAN tombol konversi otomatis.
2. **Tombol Clone, Copy to, Print, PDF** — SENGAJA DILEWATI (butuh
   sistem cetak dokumen yang belum ada), sama kayak modul-modul lain.
3. **List View kolom** — dokumen resmi bilang "belum sempat diamati
   secara mendetail", jadi kolomnya disusun dari field header yang ada
   (§7 dokumen ini).

## 3. Aktor / Pengguna

| Role | Kewenangan |
|---|---|
| Admin, Accountant, Staf Gudang/Pengiriman (masuk kategori Accountant di sistem kita, TANPA role baru) | Buat, ubah, hapus surat jalan |
| Viewer | Hanya baca |

## 4. Struktur Data

### 4.1 Tabel `delivery_notes` (header)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| business_id | uuid | Ya | Tenant scope |
| delivery_date | date | Ya | Tanggal pengiriman, default hari ini |
| reference | varchar(50) | Tidak | Nomor referensi |
| customer_id | uuid | Ya | FK `contacts` (is_customer=true) |
| sales_order_id | uuid, nullable | Tidak | FK `sales_orders` (dropdown difilter per customer) |
| sales_invoice_id | uuid, nullable | Tidak | FK `sales_invoices` (dropdown difilter per customer) |
| delivery_address | text | Tidak | Auto dari Customer, bisa diedit manual |
| description | text | Tidak | Keterangan umum |
| deleted_at | timestamp | Tidak | Soft-delete |
| created_at / updated_at | timestamp | — | Standar |

### 4.2 Tabel `delivery_note_lines` (baris item)

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| id | uuid | Ya | Primary key |
| delivery_note_id | uuid | Ya | FK, ON DELETE CASCADE |
| description | varchar(255) | Ya | Nama barang yang dikirim |
| quantity | numeric(18,4) | Ya | Jumlah barang, default 1 |
| sort_order | integer | Ya | Urutan tampil |

**PENTING**: baris item **TANPA `unit_price`, TANPA `line_total`** —
beda dari SEMUA modul lain yang punya baris item, ini murni catatan
Description + Qty doang, TIDAK ADA nilai uang.

### 4.3 Field terhitung

TIDAK ADA — modul ini nggak punya field turunan/hitungan apa pun (nggak
ada total, nggak ada status).

## 5. Aturan Bisnis

1. **Wajib**: pilih Customer, `delivery_date`, minimal 1 baris dengan
   `description` dan `quantity` > 0.
2. **`sales_order_id`/`sales_invoice_id` kalau diisi HARUS milik
   `customer_id` yang sama** (validasi silang, sama pola kayak Late
   Payment Fees).
3. **Delivery address** otomatis terisi dari alamat Customer saat
   create, bisa diedit manual sesudahnya.
4. **TIDAK ADA posting jurnal sama sekali** — murni CRUD.
5. **Delete**: bebas, tanpa validasi lock.
6. **RBAC**: create/update/delete perlu role `admin` atau `accountant`.
   Viewer hanya GET.

## 6. Alur Status

TIDAK ADA status maupun tab Journal (dokumen ini sifatnya murni
administratif, nggak nyentuh jurnal/saldo kas sama sekali).

## 7. Spesifikasi Tampilan Daftar (List View)

- **Header**: tombol "Surat Jalan Baru", kotak pencarian (reference,
  nama customer, deskripsi).
- **Kolom**: Delivery Date, Reference, Customer, Order Number (kalau
  ada), Invoice Number (kalau ada), Description, Aksi (Edit, Hapus).
- TANPA kolom Total (memang nggak ada nilai uang di modul ini).

## 8. Spesifikasi Form Tambah/Edit

| Field | Komponen | Validasi |
|---|---|---|
| Delivery Date | Date picker | Wajib, default hari ini |
| Reference | Text input | Opsional |
| Customer | Dropdown | Wajib |
| Order Number | Dropdown (Sales Orders milik Customer yang dipilih) | Opsional |
| Invoice Number | Dropdown (Sales Invoices milik Customer yang dipilih) | Opsional |
| Delivery Address | Textarea | Opsional, auto dari Customer |
| Description | Text input | Opsional |

**Baris item (tabel dinamis, minimal 1 baris):**

| Field | Komponen | Validasi |
|---|---|---|
| Description | Text input | Wajib |
| Qty | Number input | Wajib, > 0 |

TANPA kolom Unit Price/Total di baris item.

## 9. Contoh Data

```json
{
  "customerId": "<id PT Klien>",
  "deliveryDate": "2026-09-30",
  "deliveryAddress": "Jl. Gatot Subroto No. 88, Gudang Distribusi Lt. 1, Kelurahan Kuningan Barat, Kecamatan Mampang Prapatan, Jakarta Selatan, DKI Jakarta 12710",
  "lines": [
    {
      "description": "Paket Internet Dedicated 50 Mbps",
      "quantity": 1
    }
  ]
}
```

## 10. Relasi dengan Modul Lain

- **Customers**: `customer_id`, sumber Delivery Address.
- **Sales Orders, Sales Invoices**: `sales_order_id`/`sales_invoice_id`
  nullable, dropdown-nya difilter per Customer yang dipilih.

## 11. Endpoint API

Base path: `/businesses/:businessId/delivery-notes` (TANPA prefix
`/api`, konsisten dengan endpoint lain di project ini).

| Method | Path | operationId | Keterangan |
|---|---|---|---|
| GET | `/businesses/:businessId/delivery-notes` | listDeliveryNotes | List (paginated), `?q=` |
| GET | `/businesses/:businessId/delivery-notes/:id` | getDeliveryNote | Detail + baris item |
| POST | `/businesses/:businessId/delivery-notes` | createDeliveryNote | Buat surat jalan |
| PUT | `/businesses/:businessId/delivery-notes/:id` | updateDeliveryNote | Update |
| DELETE | `/businesses/:businessId/delivery-notes/:id` | deleteDeliveryNote | Soft-delete, bebas |

Semua endpoint tulis perlu role `admin`/`accountant`; GET boleh semua
role. TIDAK ADA logic jurnal di modul ini.