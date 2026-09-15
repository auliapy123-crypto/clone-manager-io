const pool = require("../config/db");

// =====================================================================
// GET /api/businesses  (perlu token, TIDAK perlu header x-business-id —
// endpoint ini justru dipakai user untuk MEMILIH bisnis mana yang mau
// dibuka, sebelum ada business aktif)
// =====================================================================
async function listMyBusinesses(req, res) {
  try {
    const result = await pool.query(
      `SELECT b.id, b.name, b.base_currency_code, ubr.role
       FROM user_business_roles ubr
       JOIN businesses b ON b.id = ubr.business_id
       WHERE ubr.user_id = $1
       ORDER BY b.name`,
      [req.userId]
    );
    return res.json({ businesses: result.rows });
  } catch (err) {
    console.error("List businesses error:", err);
    return res.status(500).json({ error: "Terjadi kesalahan pada server." });
  }
}

module.exports = { listMyBusinesses };