# Panduan Uji Manual — Modul Attachments (Lampiran File)

Uji ini memverifikasi modul Attachments **Tahap 1**: unduh/unggah/hapus lampiran
di **Expense Claims** dan **Customers**, termasuk penolakan file berbahaya.

Waktu: ±10 menit. Tidak perlu mengubah kode apa pun.

---

## 0. Persiapan: nyalakan aplikasi

Buka **dua** terminal terpisah.

**Terminal 1 — backend** (port 4000):
```powershell
cd D:\laragon\www\clone-manager-io\backend
pnpm dev
```
Tunggu sampai muncul log `Backend jalan di http://localhost:4000`.

**Terminal 2 — frontend** (port 3000):
```powershell
cd D:\laragon\www\clone-manager-io\fe-accounting
pnpm dev
```
Tunggu sampai muncul alamat `http://localhost:3000`.

> Kalau sudah jalan dari sesi sebelumnya, lewati langkah ini. Cek cepat:
> `Invoke-WebRequest http://localhost:4000/health` harus membalas `200`.

**Login:** buka `http://localhost:3000`, masuk dengan kredensial dev yang biasa
Anda pakai (lihat bagian "Aturan Kerja" di `CLAUDE.md`), lalu pilih bisnis
**"Contoh Bisnis (Dummy)"**.

**File contoh** sudah disiapkan di folder `uji-manual/`:

| File | Gunanya |
|---|---|
| `struk-contoh.png` | PNG kecil valid — **harus berhasil** diunggah |
| `kontrak-contoh.pdf` | PDF valid — **harus berhasil** diunggah |
| `virus-palsu.exe` | untuk uji **penolakan .exe** |
| `catatan.txt` | untuk uji **penolakan .txt** |

---

## Bagian A — Expense Claims

### A1. Buat satu klaim (kalau belum ada)
1. Menu kiri → **Klaim Biaya**.
2. Klik **Klaim Baru**.
3. Isi: **Date** (biarkan hari ini), **Payer** (pilih kontak mana pun).
4. Di **Baris Item**: pilih **Account** (akun bebas), isi **Amount** mis. `50000`.
5. Klik **Simpan Klaim**.

✅ Ekspektasi: klaim muncul di daftar.

### A2. Buka dialog EDIT dan temukan widget Lampiran
1. Klik tombol **Edit** pada baris klaim tadi.
2. Gulir ke **paling bawah** form, di atas tombol Tutup/Simpan Klaim.

✅ Ekspektasi: ada kotak berjudul **"Lampiran (0)"** berisi tombol
**Unggah File**, dan teks kecil "Maksimal 10MB per file. Tipe yang diizinkan:
PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX, XLS, XLSX."

❌ Kalau kotak ini **tidak muncul**: pastikan form dibuka lewat **Edit**
(bukan "Klaim Baru"), karena pada form create memang tidak ditampilkan.

### A3. Unggah file valid
1. Klik **Unggah File** → pilih `uji-manual/struk-contoh.png`.
2. Tunggu sebentar.

✅ Ekspektasi: muncul pesan hijau *"File "struk-contoh.png" berhasil diunggah."*,
daftar berubah jadi **"Lampiran (1)"** dengan nama file, ukuran (mis. `174 B`),
dan nama pengunggah; ada tombol **Unduh** dan **Hapus**.

### A4. Unggah file kedua
Ulangi dengan `uji-manual/kontrak-contoh.pdf`.

✅ Ekspektasi: **"Lampiran (2)"**, ada dua baris file.

### A5. Unduh dan bandingkan isinya
1. Klik **Unduh** pada `struk-contoh.png`.
2. Buka file hasil unduhan (biasanya di folder `Downloads`).

✅ Ekspektasi: file terunduh, **namanya tetap `struk-contoh.png`** (nama asli,
bukan UUID), dan isinya bisa dibuka normal.

### A6. Uji penolakan tipe berbahaya (`.exe`)
1. Klik **Unggah File** → pilih `uji-manual/virus-palsu.exe`.

✅ Ekspektasi: kotak merah *"Tipe file ".exe" tidak diizinkan. Yang diizinkan:
PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX, XLS, XLSX."* — dan **tidak** bertambah
di daftar (tetap 2).

### A7. Uji penolakan `.txt`
Ulangi dengan `uji-manual/catatan.txt`.

✅ Ekspektasi: ditolak dengan pesan serupa; daftar tetap 2.

### A8. Uji penolakan file terlalu besar (>10MB)
Belum tersedia file besar; buat dulu di PowerShell (sekali saja):
```powershell
cd D:\laragon\www\clone-manager-io
$f = New-Object byte[] (11MB); [System.IO.File]::WriteAllBytes("$PWD\uji-manual\file-besar.png", $f)
```
Lalu klik **Unggah File** → pilih `uji-manual/file-besar.png`.

✅ Ekspektasi: ditolak — *"Ukuran file melebihi batas maksimal 10MB (file ini
11.00 MB)."* Daftar tetap 2.

### A9. Hapus satu lampiran
1. Klik **Hapus** pada salah satu baris lampiran.
2. Konfirmasi muncul: **"Hapus lampiran "…"? File fisik di server tetap disimpan."**
   → klik **OK**.

✅ Ekspektasi: baris itu hilang, daftar jadi **"Lampiran (1)"**.

### A10. Pastikan kolom lain tetap berfungsi (jurnal tidak rusak)
1. Tutup dialog, lalu cek menu **Jurnal Umum**.
2. Cari baris dengan referensi klaim Anda.

✅ Ekspektasi: jurnal klaim **tetap utuh** (Debit akun beban, Kredit akun
kontrol Klaim Biaya). Modul Attachments **tidak** menyentuh jurnal sama sekali.

---

## Bagian B — Customers (bukti widget reusable)

### B1. Buka customer mode edit
1. Menu kiri → **Pelanggan**.
2. Klik **Edit** pada customer mana pun (mis. "Pahrio sejahtera").
3. Gulir ke bawah form.

✅ Ekspektasi: kotak **"Lampiran (0)"** muncul — widget yang **sama** dipakai di
modul berbeda (inilah gunanya `entityType`).

### B2. Unggah & hapus di customer
Upload `kontrak-contoh.pdf`, lalu hapus lagi.

✅ Ekspektasi: perilaku sama seperti di Expense Claims.

### B3. Pastikan lampiran customer tidak "bocor" ke klaim
1. Tutup dialog Customer.
2. Buka lagi dialog **Edit** klaim di Bagian A.

✅ Ekspektasi: daftar lampiran klaim **tetap sesuai isinya sendiri** (tidak
tercampur lampiran customer) — karena dipisah oleh `entityType` + `entityId`.

---

## Bagian C — Cek file fisiknya di disk

Buka PowerShell:
```powershell
cd D:\laragon\www\clone-manager-io\backend
Get-ChildItem uploads -Recurse -File | Select-Object FullName, Length
```

✅ Ekspektasi: ada file dengan **nama UUID + ekstensi** di dalam folder
`uploads\<businessId>\`, mis. `uploads\d9d9760c-…\6f1a….png`.

Contoh keluaran:
```
...\backend\uploads\d9d9760c-38a1-4849-a646-4206022f03c1\6f1a....png
```

> Ini membuktikan: file tersimpan di disk dengan nama acak (UUID) sesuai
> keputusan desain — nama aslinya hanya di database.
>
> ✅ Sesuai desain: file yang sudah Anda **hapus** di UI **tetap ada** di disk
> (soft-delete; pembersihan fisik di luar cakupan modul ini).

---

## Bagian D — Verifikasi RBAC (opsional)

Bagian ini **tidak perlu Anda kerjakan sendiri** — sudah saya uji dan hasilnya:
bisnis yang bukan milik user dibalas **403**, dan lampiran milik bisnis lain
dibalas **404** (tidak membocorkan keberadaan file). Screenshot/angka lengkapnya
ada di laporan saya.

### Kalau ingin memeriksa sendiri (tanpa menulis kredensial di mana pun)

1. Buka aplikasi di browser, buka **DevTools** (F12) → tab **Network**.
2. Lakukan satu kali klik **Unduh** pada lampiran (Bagian A5).
3. Klik request `…/attachments/<id>/download` yang muncul, lihat panel
   **Headers** → *Request Headers*.

✅ Ekspektasi: ada header otentikasi yang dikirim otomatis oleh aplikasi, dan
URL-nya **tidak** memuat kredensial apa pun. Ini bukti unduhan tetap
terlindungi tanpa menaruh rahasia di alamat URL.

### Pemeriksaan role viewer (visual)

Login sebagai user ber-role `viewer` **hanya bila Anda tahu password-nya** — di
situ tombol **Unggah File** dan **Hapus** seharusnya **hilang**, dan hanya
tombol **Unduh** yang muncul. Jangan reset password user lain demi pengujian;
kalau lupa, cukup lewati pemeriksaan ini (RBAC-nya sudah saya verifikasi di
lapisan izin: viewer punya `attachment:read`, tanpa `write`/`delete`).

---

## Bagian E — Membersihkan data uji

Di UI: hapus lampiran yang masih tersisa (tombol **Hapus**), lalu hapus klaim
uji buatan Bagian A1 (tombol **Hapus** pada baris klaim).

File fisik boleh tetap ada di disk — itu perilaku yang diharapkan.

Bersihkan juga file besar kalau dibuat:
```powershell
Remove-Item D:\laragon\www\clone-manager-io\uji-manual\file-besar.png -ErrorAction SilentlyContinue
```

---

## Checklist ringkas

| # | Yang diperiksa | Hasil yang diharapkan |
|---|---|---|
| A2 | Widget muncul | Kotak "Lampiran (0)" + tombol Unggah File |
| A3 | Upload PNG | 201, muncul di daftar, pesan hijau |
| A4 | Upload PDF | Daftar jadi 2 |
| A5 | Download | Nama asli dipertahankan, isi bisa dibuka |
| A6 | Upload .exe | **Ditolak** pesan jelas, daftar tidak bertambah |
| A7 | Upload .txt | **Ditolak** pesan jelas |
| A8 | Upload >10MB | **Ditolak** "melebihi batas maksimal 10MB" |
| A9 | Hapus | Hilang dari daftar |
| A10 | Jurnal | Tetap utuh (modul ini tanpa jurnal) |
| B1–B3 | Customers | Widget sama muncul, tidak tercampur dengan klaim |
| C | Disk | File UUID ada di `uploads/<businessId>/`, file terhapus tetap ada |
| D | RBAC | Bisnis asing → 403; viewer tanpa tombol unggah/hapus |

---

## Kalau ada yang tidak sesuai

Catat **langkah berapa** dan **apa yang muncul di layar** (atau pesan errornya),
lalu laporkan. Petunjuk paling berguna: pesan error persis + isi tab
**Network** browser pada request yang gagal.
