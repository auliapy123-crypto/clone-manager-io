// Koneksi ke database Neon (PostgreSQL).
// Semua query di seluruh backend WAJIB lewat pool ini,
// supaya koneksinya di-reuse dan tidak boros (best practice pg).

const { Pool } = require("pg");
require("dotenv").config();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL belum diset. Copy .env.example jadi .env lalu isi connection string dari Neon."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon mewajibkan koneksi SSL. rejectUnauthorized: false aman dipakai
  // untuk development; nanti di produksi bisa disesuaikan lagi.
  ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.error("Kesalahan tak terduga pada koneksi database:", err);
});

module.exports = pool;