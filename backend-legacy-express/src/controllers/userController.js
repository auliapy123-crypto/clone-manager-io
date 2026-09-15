const pool = require("../config/db");

// =====================================================================
// GET /api/users  (perlu token + header x-business-id)
// Menampilkan semua user yang terhubung ke business yang sedang aktif,
// beserta role masing-masing di business tersebut.
// =====================================================================
async function listUsers(req, res) {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, ubr.role
       FROM user_business_roles ubr
       JOIN users u ON u.id = ubr.user_id
       WHERE ubr.business_id = $1
       ORDER BY u.name`,
      [req.businessId]
    );
    return res.json({ users: result.rows });
  } catch (err) {
    console.error("List users error:", err);
    return res.status(500).json({ error: "Terjadi kesalahan pada server." });
  }
}

module.exports = { listUsers };