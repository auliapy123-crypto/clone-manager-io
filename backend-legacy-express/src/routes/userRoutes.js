const express = require("express");
const router = express.Router();

const { listUsers } = require("../controllers/userController");
const { verifyToken } = require("../middleware/auth");
const { checkBusinessAccess } = require("../middleware/tenant");

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: Menampilkan semua user yang terhubung ke bisnis yang sedang aktif
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-business-id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID bisnis yang sedang aktif
 *     responses:
 *       200:
 *         description: Daftar user beserta role masing-masing di bisnis tersebut
 *       403:
 *         description: User tidak memiliki akses ke bisnis ini
 */
router.get("/", verifyToken, checkBusinessAccess, listUsers);

module.exports = router;