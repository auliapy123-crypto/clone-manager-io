Modul Dokumentasi: Pemasok (Pemasok)

Status: Draf — siap diimplementasikan Catatan: dokumen analisis Fase 0 untuk modul ini terpotong (cuma ada judul "9.3 Struktur Data" tanpa isi) — dikonfirmasi ke manajer (21 Sep 2026), tidak ada dokumen tambahan. Dokumen ini disusun MENCERMINKAN Struktur Pelanggan (Modul Dokumentasi/Pelanggan Pelanggan.docx), karena keduanya memang berbagi tabel contactsyang sama. Sumber tujuan modul & aktor: Analisis_Manager_io Prioritas 1, §9.1-9.2 (bagian yang tersedia).

1. Tujuan

Pusat pengelolaan pemasok/vendor data induk. Setiap Pesanan Pembelian, Faktur Pembelian, atau Pembayaran terhubung ke data pemasok di sini. Modul penghitungan saldo utang usaha (Utang Usaha) dan pembayaran yang belum dialokasikan (Pembayaran yang Tidak Dapat Dialokasikan) sebagai nilai turunan, tidak disimpan.

2. Aktor / Pengguna
Peran	Kewenangan
Admin	Kelola master pemasok, pantau saldo utang berjalan
Akuntan	Sama seperti admin untuk modul ini
Penonton	Hanya membaca
3. Struktur Data

Pemasok memakai tabel contactsyang sama dengan Pelanggan (bukan tabel terpisah). Sebuah catatan menjadi pemasok bila is_supplier = true. Satu kontak bisa jadi pelanggan dan supplier sekaligus (dua flag independen). Semua query wajib dibatasi business_iddan deleted_at IS NULL.

Bidang	Tipe	Wajib	Keterangan
pengenal	uuid	Ya	Kunci primer (catatan sama dengan Pelanggan kalau kontak yang sama)
ID bisnis	uuid	Ya	Lingkup penyewa, dari jalur
nama	varchar(225)	Ya	Nama pemasok, mis. "CV Sumber Makmur"
kode	varchar(50)	Tidak	Kode pemasok internal
e-mail	varchar(225)	Tidak	Kontak email, valid kalau terisi
alamat_penagihan	teks	Tidak	Dipakai bersama Pelanggan (alamat utama kontak)
alamat_pengiriman	teks	Tidak	Dipakai bersama Pelanggan
tanggal_jatuh_tanggal_jatuh_tanggal_faktur_pembelian_hari	bilangan bulat	Tidak	Field baru — mirror dari sales_invoice_due_date_daysmilik Pelanggan, tapi untuk sisi pembelian. Perlu migrasi kolom baru.
adalah pelanggan	boolean	Ya	Tidak diubah dari Pemasok titik akhir
adalah_pemasok	boolean	Ya	Selalu truepada Pemasok titik akhir
dihapus_pada	cap waktu	Tidak	Penghapusan sementara

Bidang dihitung (bukan disimpan)

Bidang	Sumber
Hutang usaha	Σ(Faktur Pembelian pemasok ini) − Σ(Pembayaran teralokasi). Dikembalikan 0.00 sampai Faktur Pembelian/Pembayaran tersedia.
Pembayaran yang belum dialokasikan	Pembayaran ke pemasok ini belum dibatasi ke faktur pembelian. Dikembalikan 0.00 sampai Pembayaran tersedia.

Catatan: credit_limit(milik Pelanggan) tidak dipakai di sisi Pemasok — batas kredit itu konsepnya "pelanggan melakukan ke kita", tidak berlaku untuk pemasok.

4. Aturan Bisnis
Isolasi penyewa : semua operasi pakai businessIddari jalur ( requireAuth+ requireBusinessScopeParam), sama seperti Pelanggan.
Peran : pemirsa hanya-baca; admin & akuntan boleh membuat/memperbarui/menghapus, pakai izin CONTACT_READ/ CONTACT_WRITEyang sama dengan Pelanggan (izin sudah ada, tidak perlu ditambah).
Nama wajib setelah trim. Email opsional tapi harus valid kalau diisi.
Pemasok Endpoint selalu memaksaisSupplier: true . Nilai isCustomerTIDAK boleh diturunkan ke falsebila catatan sudah isCustomer: true— sama seperti aturan cermin di Pelanggan (poin 4 di dokumen Pelanggan).
Larangan hard-delete : pemasok yang sudah dipakai di Faktur Pembelian atau Pembayaran dilarang dihapus permanen; histori tetap dibaca dari referensi lama. Untuk sekarang (belum ada modul transaksi), guard ini disiapkan tetapi secara praktis semua pemasok masih bisa di-soft-delete bebas.
Penghapusan bersifat soft-delete (sama seperti Pelanggan) — "Tidak aktif" secara antarmuka diturunkan dari deletedAt.
5. Status Alur
Dibuat baru (is_supplier = true)
        │
        ▼
Tampil di dropdown Purchase Invoices & Payments (nanti)
        │
        ├── Admin/Accountant hapus (soft-delete)
        │         │
        │         ▼
        │   deletedAt terisi (disembunyikan dari daftar aktif &
        │   dropdown transaksi baru, histori lama tetap utuh)
6. Spesifikasi Tampilan Daftar (Tampilan Daftar)
Header : tombol "Tambah Supplier", kotak pencarian (nama/kode/email).
Kolom tabel : Nama, Kode, Email, Hutang (selaras kanan), Aksi (Edit, Hapus).
Baris total (footer) : total akumulasi Hutang Usaha seluruh pemasok yang tampil.
Pagination : standar, sama seperti Pelanggan.
7. Spesifikasi Formulir Tambah/Edit
Bidang	Komponen UI	Validasi
Nama	Masukan teks	Wajib, tidak boleh kosong
Kode	Masukan teks	Opsional
E-mail	Masukan teks	Opsional, format email valid
Alamat Penagihan	Area teks	Opsional
Alamat Pengiriman	Area teks	Opsional
Tanggal Jatuh Tempo Faktur Pembelian (Hari)	Masukan angka	Opsional, bilangan bulat ≥ 0

Formulir TIDAK menampilkan Batas Kredit (khusus Pelanggan), isCustomer, isSupplier, atau saldo dihitung.

8. Contoh Data
json
{
  "name": "CV Sumber Makmur",
  "code": "SUP-0007",
  "email": "finance@sumbermakmur.co.id",
  "billingAddress": "Jl. Gatot Subroto No. 12, Bandung",
  "deliveryAddress": null,
  "purchaseInvoiceDueDateDays": 14
}
9. Relasi dengan Modul Lain
Pembelian & Pengadaan (nanti): Pesanan Pembelian, Faktur Pembelian
Pembayaran & Kas (nanti): Pembayaran
Chart of Accounts : utang otomatis terikat ke akun kontrol "Accounts Payable" (satu akun per bisnis, bukan per pemasok) — sama dengan Customers/Accounts Receivable
Pelanggan : berbagi tabel contacts; satu kontak dapat menjadi pelanggan dan pemasok tanpa duplikasi catatan
10. API Endpoint

Jalur dasar: /businesses/:businessId/suppliers(jalur BEDA dari Pelanggan, meskipun tabel yang dipakai SAMA — contacts— dibedakan lewat filter is_supplier = truedi kueri, tetap pola is_customer = truedi Pelanggan).

Metode	Jalur	ID operasi	Keterangan
MENDAPATKAN	/businesses/:businessId/suppliers	daftarPemasok	Daftar (bernomor halaman), ?q=cari nama/kode/email
MENDAPATKAN	/businesses/:businessId/suppliers/:supplierId	Dapatkan pemasok	Detail satu pemasok
POS	/businesses/:businessId/suppliers	buatPemasok	Buat pemasok baru (selalu isSupplier: true)
PATCH	/businesses/:businessId/suppliers/:supplierId	PembaruanPemasok	Perbarui data.
MENGHAPUS	/businesses/:businessId/suppliers/:supplierId	hapusPemasok	Penghapusan sementara

Semua endpoint tulis ( POST/ PATCH/ DELETE) perlu role adminatau accountant; GETboleh semua peran. Kontrak respon sama seperti Pelanggan ( { data }/ { data, pagination }/ { error, message }).

11. Rencana Implementasi
Tambahkan kolom purchase_invoice_due_date_days(integer, nullable) ke tabel contacts— ALTER TABLEManual SQL ke Neon (bukan alat migrasi), sama seperti dua kolom Pelanggan kemarin.
Repository: reuse ContactRepository.tsyang sudah ada (Pelanggan) — cukup tambah fungsi list/get/create/update/delete versi Supplier yang filter is_supplier = true, bukan bikin repositori baru dari nol kalau memungkinkan digabung.
Route plugin baru SupplierRoutes.tsmengikuti pola CustomerRoutes.ts persist, base path /businesses/:businessId/suppliers.
Frontend: menu "Suppliers" di sidebar, halaman list+form+hapus, mengikuti pola businesses.$businessId.customers.tsxyang ada.
Uji manual buat → edit → hapus, periksa isolasi penyewa, periksa RBAC viewer.