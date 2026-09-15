const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

// Pasang middleware ini di depan endpoint mana pun yang WAJIB login dulu.
// Contoh pemakaian: router.get("/me", verifyToken, meController)
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization; // format: "Bearer <token>"

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token tidak ditemukan. Silakan login." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.sub; // dipakai controller berikutnya (mis. changePassword, me)
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token tidak valid atau sudah kedaluwarsa." });
  }
}

module.exports = { verifyToken };