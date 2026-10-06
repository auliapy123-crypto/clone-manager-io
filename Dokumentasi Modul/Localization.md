# Dokumentasi Modul: Localization (Dukungan Multi-Bahasa)

> Status: Draft — Fase 1 (infra + pola). Sumber: Roadmap Fase 4.
> Khusus: FRONTEND SAJA, nol backend. Bahasa default tetap Indonesia.

## 1. Tujuan Modul

Menyiapkan infrastruktur multi-bahasa secara teknis (ganti bahasa
langsung jalan) walau yang dirilis baru 1 bahasa. Konversi halaman
dilakukan bertahap — Fase 1 hanya infra + 2–3 halaman contoh.

## 2. Keputusan Desain Penting

1. **Library `react-i18next`** (standar industri). Backend TIDAK
   disentuh sesi ini (pesan error API tetap Indonesia — katalog
   backend = sesi tersendiri).
2. **Indonesia default + fallback.** `fallbackLng: "id"` — key yang
   belum ada di `en` otomatis tampil Indonesia (tidak ada teks hilang
   / key mentah terlihat).
3. **Konvensi key**: `<halaman>.<elemen>` (mis. `taxCodes.title`,
   `login.password`) + namespace `common.*` untuk yang dipakai
   berulang (save/cancel/delete/edit/close/search/loading/confirm).
   `common.*` dibuat di Fase 1 supaya Fase 2 tinggal pakai.
4. **Fase 1 = infra + contoh**: setup i18n, switcher header, katalog
   `id`+`en` untuk halaman yang dikonversi, konversi header/menu/
   login/tax-codes, aturan tertulis untuk modul baru.
5. Halaman yang BELUM dikonversi tetap hardcode Indonesia — itu
   disengaja (Fase 2 per batch), bukan bug.
6. Format angka/tanggal tetap `id-ID` mengikuti bahasa aktif nanti
   (diatur saat konversi masing-masing halaman, bukan Fase 1).

## 3. Aktor / Pengguna

Semua role — preferensi bahasa per browser lokal (localStorage),
bukan permission.

## 4. Struktur Data

Tidak ada tabel. File: `src/i18n/index.ts` (instance + init),
`src/i18n/locales/id.json`, `src/i18n/locales/en.json`.
Persist: `localStorage["app-language"]` (`"id"`/`"en"`, default `"id"`).

## 5. Aturan Bisnis

1. Setiap key BARU wajib ada di `id.json` DAN `en.json` (tidak boleh
   key yatim).
2. String yang dipakai berulang WAJIB masuk `common.*`, jangan bikin
   key duplikat per halaman (`taxCodes.save` DILARANG — pakai
   `common.save`).
3. Modul baru / halaman baru WAJIB pakai `t()` sejak awal (jangan
   hardcode lalu konversi belakangan).
4. Pesan `window.confirm` dan pesan error validasi form termasuk
   "user-facing" — wajib pakai key (contoh di tax-codes).
5. Jangan mengubah makna/isi teks Indonesia saat memindah ke katalog
   (pindah apa adanya — nol regresi bahasa).
6. **Out of scope Fase 1**: halaman selain contoh, pesan error
   backend, format angka/tanggal per locale, bahasa ketiga.

## 6. Alur

```
Klik switcher ID|EN di header → seluruh teks terkonversi ikut
berubah → reload → bahasa tersimpan → key yang belum ada di EN
tampil Indonesia (fallback).
```

## 7. Spesifikasi Tampilan Daftar

Tidak ada halaman list. Satu-satunya UI baru: switcher bahasa di
header global (dropdown/toggle ID–EN, tampil di semua halaman).

## 8. Spesifikasi Form

Tidak ada form. Switcher: kontrol kecil di header (sebelah menu
user), berlabel jelas, bisa dipakai saat dialog terbuka.

## 9. Contoh Data

```json
// id.json
{ "common": { "save": "Simpan", "cancel": "Batal" },
  "taxCodes": { "title": "Kode Pajak" } }
// en.json
{ "common": { "save": "Save", "cancel": "Cancel" },
  "taxCodes": { "title": "Tax Codes" } }
```

```tsx
const { t } = useTranslation();
<h1>{t("taxCodes.title")}</h1>
<Button>{t("common.save")}</Button>
```

## 10. Relasi dengan Modul Lain

Tidak ada relasi data. Fase 1 menyentuh: setup i18n + header/menu +
login + tax-codes. Halaman lain TIDAK disentuh (Fase 2).

## 11. Endpoint API

Tidak ada.