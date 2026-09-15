// Script SEKALI JALAN untuk membuat 1 user percobaan supaya kamu bisa
// langsung tes login (karena tabel "users" masih kosong).
// Modul Users yang sebenarnya (create/edit/hapus user lewat API) itu
// bagian temanmu — ini cuma jalan pintas buat testing Fase 1.2 kamu.
//
// Cara pakai (dari folder backend/):
//   node scripts/seed-user.js

require("dotenv").config();
const bcrypt = require("bcrypt");
const pool = require("../src/config/db");

async function seedUser() {
  const name = "Admin Percobaan";
  const email = "admin@test.com";
  const plainPassword = "password123";

  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    console.log(`User ${email} sudah ada, tidak dibuat ulang.`);
    process.exit(0);
  }

  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email`,
    [name, email, passwordHash]
  );

  console.log("User percobaan berhasil dibuat:");
  console.log(result.rows[0]);
  console.log(`\nGunakan untuk login:\n  email: ${email}\n  password: ${plainPassword}`);
  process.exit(0);
}

seedUser().catch((err) => {
  console.error("Gagal membuat user percobaan:", err);
  process.exit(1);
});