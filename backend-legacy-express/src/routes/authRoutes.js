const express = require("express");
const router = express.Router();

const { login, changePassword, me } = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Login menggunakan email dan password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@test.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Berhasil login, mengembalikan token JWT dan data user
 *       401:
 *         description: Email atau password salah
 */
router.post("/login", login);

/**
 * @openapi
 * /api/auth/change-password:
 *   post:
 *     summary: Mengganti password milik user yang sedang login
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password berhasil diubah
 *       401:
 *         description: Password lama salah atau token tidak valid
 */
router.post("/change-password", verifyToken, changePassword);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Mengambil profil user yang sedang login (sekaligus cek token masih valid)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Data profil user
 *       401:
 *         description: Token tidak valid atau tidak ada
 */
router.get("/me", verifyToken, me);

module.exports = router;