# Dokumentasi Modul: Obscure Mode (Mode Privasi Angka)

> Status: **SELESAI** — frontend saja (nol backend, nol tabel, nol endpoint).
> Sumber: Roadmap Fase 4, meniru Manager.io.
>
> CATATAN PENYIMPANGAN (disengaja, sudah dikonfirmasi hasil nyata):
> implementasi TIDAK memakai `formatAmount(value)` langsung yang diimpor,
> melainkan hook `useFormatAmount()` yang mengembalikan `{ formatAmount }`.
> Alasannya: mode kabur perlu React context, dan nilai context hanya bisa
> dibaca di dalam komponen. Signature hasilnya TETAP
> `formatAmount(value: number): string` supaya pemakaian di JSX minimal
> berubah. Lihat §8–§9.

## 1. Tujuan Modul

Toggle privasi yang mengaburkan semua nominal uang di tampilan
(aman untuk demo/screen-share). Murni display — data di API dan
jurnal tidak berubah sama sekali.

## 2. Keputusan Desain Penting

1. **Frontend saja.** Tidak ada tabel, migration, endpoint,
   permission, atau E2E API.
2. **Satu `formatAmount` terpusat** (`src/lib/format.ts`) menggantikan
   ~21 copy lokal yang tersebar di tiap file routes. Karena mode kabur
   butuh React context, bentuk finalnya hook `useFormatAmount()` yang
   mengembalikan `{ formatAmount }`; signature fungsinya tetap
   `formatAmount(value: number): string` supaya pemakaian di JSX tidak
   berubah. Tersedia juga `formatAmountRaw()` (selalu normal) untuk
   nilai non-tampilan seperti nilai awal input.
3. **Masker `••••••`** (tetap, layout tidak goyang). Blur CSS DITOLAK
   (bisa diintip via DevTools).
4. **Hanya nominal uang yang kabur.** Qty, tanggal, nama, kode, dan
   INPUT editable yang bisa diketik (qty/price/rate di form) TIDAK
   dikaburkan — kalau input dikaburkan user tidak bisa verifikasi
   ketikannya. Teks `window.confirm` yang memuat nominal ikut kabur
   otomatis (lewat helper yang sama, tanpa edit manual satu-satu).
5. **Toggle global di header** (ikon mata Eye/EyeOff + tooltip),
   persist `localStorage` key `obscure-mode`, default MATI.
   Dinyatakan eksplisit: preferensi per browser lokal, TIDAK sinkron
   antar device/browser (bukan bug).
6. State global via context di root — seluruh tampilan re-render saat
   toggle berubah.

## 3. Aktor / Pengguna

Semua role (admin, accountant, viewer) — ini preferensi tampilan
browser lokal, bukan permission.

## 4. Struktur Data

Tidak ada tabel. State: React context + `localStorage["obscure-mode"]`
(`"1"`/`"0"`, default mati saat kosong).

## 5. Aturan Bisnis

1. SEMUA nominal uang WAJIB lewat `formatAmount` terpusat — berlaku
   juga untuk modul berikutnya (jangan bikin copy lokal baru).
2. Output mode normal IDENTIK dengan format lama (`id-ID`, 2 desimal)
   — tidak boleh ada selisih tampilan satu sen pun.
3. Saat mengganti copy lokal: audit per file — fungsi lokal bernama
   sama yang memformat BUKAN-uang (kalau ada) JANGAN diganti
   buta-buta.
4. Toggle wajib ada di semua halaman (header global), berfungsi saat
   dialog form terbuka maupun tertutup.
5. **Out of scope**: sinkronisasi antar device, obscure di cetak/PDF
   (belum ada fitur cetak), obscure via API, obscure per modul.

## 6. Alur

```
Klik ikon mata di header → semua nominal jadi •••••• → reload →
tetap kabur (persist) → klik lagi → kembali normal.
```

## 7. Spesifikasi Tampilan Daftar

Tidak ada halaman list (bukan modul CRUD). Satu-satunya UI baru:
tombol toggle di header global.

## 8. Spesifikasi Form

Tidak ada form. Perubahan = hapus duplikasi `formatAmount` lokal,
ganti dengan import hook dari `src/lib/format`.

**Pola pemakaian final (WAJIB diikuti modul berikutnya):**

```ts
import { useFormatAmount } from "@/lib/format";

function HalamanContoh() {
  const { formatAmount } = useFormatAmount();   // di DALAM komponen
  return <td>{formatAmount(total)}</td>;
}
```

Aturan penting:

1. Hook dipanggil di **setiap komponen** yang memakai `formatAmount`,
   BUKAN hanya di komponen halaman. Berkas route biasanya punya
   sub-komponen (baris tabel, dialog form, dialog detail, drill dialog)
   yang juga memakai `formatAmount` — semuanya perlu hook sendiri.
   Ini jebakan utama: kalau definisi lokal dihapus tapi sub-komponen
   tidak dipasangi hook, typecheck merah dengan
   `Cannot find name 'formatAmount'`.
2. `formatAmount` yang dipakai di **JSX/teks tampilan** memakai hook
   (ikut kabur). Untuk nilai yang TIDAK ditampilkan sebagai uang
   (mis. nilai awal `input`), pakai `formatAmountRaw()` yang selalu
   normal — jangan dipakai untuk tabel/list.
3. JANGAN bikin definisi lokal `formatAmount` baru di berkas route.
   Satu sumber kebenaran: `src/lib/format.ts`.

## 9. Contoh Data

```ts
// Di dalam komponen:
const { formatAmount } = useFormatAmount();

formatAmount(5550000.96)
// mode normal  → "5.550.000,96"
// mode obscure → "••••••"

// Di luar komponen (mis. nilai awal input):
formatAmountRaw(5550000.96)  // selalu "5.550.000,96"
```

Cakupan terpasang: **21 berkas route** (seluruh halaman ber-nominal) +
`main.tsx` (provider) + `components/header.tsx` (tombol toggle).

## 10. Relasi dengan Modul Lain

Tidak ada relasi data. Menyentuh ±20 file routes (sebatas ganti
import — tanpa ubah logika/hitungan/payload apa pun).

## 11. Endpoint API

Tidak ada.