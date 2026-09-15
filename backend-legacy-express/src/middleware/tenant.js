const pool = require("../config/db");

// Middleware ini mengecek apakah user yang login (req.userId, dari verifyToken)
// benar-benar punya akses ke business yang diminta (dikirim lewat header 'x-business-id').
// Kalau user tidak terdaftar di business itu, permintaan DITOLAK dengan status 403.
// Middleware ini WAJIB dipasang di belakang verifyToken pada setiap endpoint
// yang mengakses data milik suatu business (transaksi, users, dsb).
async function checkBusinessAccess(req, res, next) {
  try {
    const businessId = req.header("x-business-id");

    if (!businessId) {
      return res.status(400).json({ error: "Header x-business-id wajib diisi." });
    }

    const result = await pool.query(
      "SELECT role FROM user_business_roles WHERE user_id = $1 AND business_id = $2",
      [req.userId, businessId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: "Anda tidak memiliki akses ke bisnis ini." });
    }

    req.businessId = businessId;
    req.role = result.rows[0].role;
    next();
  } catch (err) {
    console.error("Tenant check error:", err);
    return res.status(500).json({ error: "Terjadi kesalahan pada server." });
  }
}

module.exports = { checkBusinessAccess };