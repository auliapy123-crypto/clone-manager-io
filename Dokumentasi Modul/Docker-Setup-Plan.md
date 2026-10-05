# Rencana: Setup Docker (Versi Minimal)

> Status: Draft — siap diimplementasikan
> Sumber: Arahan senior (bukan dari dokumen analisis fitur) — tujuannya
> biar tim lain gampang jalanin project ini lewat Docker, BUKAN migrasi
> production penuh kayak "Backend-Boilerplate-Guide.docx"

## 1. Tujuan

Bikin project ini bisa dijalankan pakai `docker-compose up` — backend
dan frontend dibungkus jadi container, supaya siapa pun di tim bisa
langsung jalanin tanpa install Node/pnpm manual satu-satu.

## 2. Keputusan Desain Penting (batasan scope)

1. **Database TETAP Neon** (cloud), **BUKAN** Postgres lokal di dalam
   Docker. `DATABASE_URL` tetap nunjuk ke Neon, cuma dikirim lewat
   environment variable ke container — JANGAN di-hardcode ke file
   mana pun (termasuk Dockerfile), ikut aturan CLAUDE.md soal
   credential.
2. **TANPA RabbitMQ, Jenkins, Traefik** — itu semua buat setup
   production penuh (dari Backend-Boilerplate-Guide), DI LUAR cakupan
   sesi ini. Project kita nggak pakai message queue sama sekali
   sekarang, jadi RabbitMQ nggak relevan.
3. **PENTING — folder `backend/uploads/` (modul Attachments)**:
   penyimpanan file LOKAL di dalam container itu SEMENTARA/HILANG
   kalau container di-rebuild/restart, KECUALI dipasangin **Docker
   volume** biar isinya tetep ada. WAJIB di-setup volume buat folder
   ini di `docker-compose.yml`.
4. **2 Dockerfile terpisah**: 1 buat `backend/`, 1 buat
   `fe-accounting/` — soalnya emang 2 project Node yang beda
   (`package.json` masing-masing sendiri).
5. **`.dockerignore`** WAJIB ada di kedua folder, biar `node_modules`,
   `.git`, `.env`, dan `uploads/` (isinya, bukan foldernya) nggak
   ikut ke-copy ke dalam image pas build.
6. **File `.env` TETAP TIDAK di-commit** ke Git (udah gitignored dari
   awal) — pas jalanin Docker, env variable (termasuk `DATABASE_URL`)
   dikirim lewat `docker-compose.yml` yang baca dari file `.env` lokal
   (atau `environment:` section), BUKAN ditulis permanen ke image.

## 3. Rencana File yang Dibuat

| File | Isi |
|---|---|
| `backend/Dockerfile` | Base image Node (cek versi persis dari `package.json` `engines` dulu), install pnpm, copy+install dependencies, copy source, expose port 4000, jalanin `pnpm dev`/start script yang sesuai |
| `backend/.dockerignore` | `node_modules`, `.env`, `.git`, `uploads/*` (kecuali `.gitkeep`) |
| `fe-accounting/Dockerfile` | Build Vite (`pnpm build`), serve hasil build (pakai cara paling simpel yang masuk akal — boleh `vite preview` atau static server ringan) |
| `fe-accounting/.dockerignore` | `node_modules`, `.env`, `.git`, `dist/` |
| `docker-compose.yml` (di ROOT project) | Orkestrasi 2 service (backend+frontend), port mapping (4000/3000 ke host), volume buat `backend/uploads/`, environment variable `DATABASE_URL` dkk dibaca dari file `.env` lokal |
| `.env.example` (kalau belum ada) | Template kosong buat `DATABASE_URL` dan env var lain yang dibutuhin, biar orang lain tau apa yang perlu diisi TANPA lihat punya kita |

## 4. Verifikasi

Setelah semua file dibuat: `docker-compose up --build` dari folder
root, pastikan:
- Backend keaksesnya di `http://localhost:4000/health` (dari LUAR
  container, lewat browser/curl host biasa).
- Frontend keaksesnya di `http://localhost:3000`.
- Login dan buka beberapa modul biasa (Sales Invoices, dst) — pastikan
  nyambung ke Neon dengan benar (bukti: data yang sama kayak biasanya
  muncul).
- Upload 1 file percobaan ke Attachments, `docker-compose down` lalu
  `docker-compose up` lagi (TANPA `--build`), cek file yang diupload
  tadi MASIH ADA (bukti volume kepasang benar).
- `docker ps` nunjukkin 2 container jalan (backend+frontend).

## 5. Di Luar Cakupan (nanti, kalau dibutuhin)

- Postgres lokal di Docker (kita tetep Neon).
- RabbitMQ, Jenkins, Traefik, staging deployment.
- Production-grade reverse proxy/HTTPS.