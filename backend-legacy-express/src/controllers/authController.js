const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = "8h"; // token login berlaku 8 jam, lalu user harus login ulang

// =====================================================================
// POST /api/auth/login
// Body: { email, password }
// =====================================================================
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email dan password wajib diisi." });
    }

    const result = await pool.query(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [email]
    );

    // Pesan error SAMA baik email tidak ada maupun password salah,
    // supaya orang luar tidak bisa menebak email mana yang terdaftar.
    const invalidMsg = { error: "Email atau password salah." };

    if (result.rows.length === 0) {
      return res.status(401).json(invalidMsg);
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json(invalidMsg);
    }

    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: TOKEN_EXPIRY,
    });

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Terjadi kesalahan pada server." });
  }
}

// =====================================================================
// POST /api/auth/change-password  (butuh login, lihat middleware/auth.js)
// Body: { oldPassword, newPassword }
// =====================================================================
async function changePassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.userId; // diisi oleh middleware verifyToken

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Password lama dan baru wajib diisi." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password baru minimal 8 karakter." });
    }

    const result = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User tidak ditemukan." });
    }

    const isMatch = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Password lama salah." });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [newHash, userId]
    );

    return res.json({ message: "Password berhasil diubah." });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({ error: "Terjadi kesalahan pada server." });
  }
}

// =====================================================================
// GET /api/auth/me  (butuh login) — cek token masih valid & lihat profil sendiri
// =====================================================================
async function me(req, res) {
  try {
    const result = await pool.query(
      "SELECT id, name, email, created_at FROM users WHERE id = $1",
      [req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User tidak ditemukan." });
    }
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error("Me error:", err);
    return res.status(500).json({ error: "Terjadi kesalahan pada server." });
  }
}

module.exports = { login, changePassword, me };