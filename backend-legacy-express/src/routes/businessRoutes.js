const express = require("express");
const router = express.Router();

const { listMyBusinesses } = require("../controllers/businessController");
const { verifyToken } = require("../middleware/auth");

/**
 * @openapi
 * /api/businesses:
 *   get:
 *     summary: Menampilkan daftar bisnis yang bisa diakses oleh user yang sedang login
 *     tags: [Businesses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar bisnis beserta role user di masing-masing bisnis
 */
router.get("/", verifyToken, listMyBusinesses);

module.exports = router;