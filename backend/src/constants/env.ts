/**
 * SATU-SATUNYA modul yang boleh membaca process.env (Guide §8.1).
 * Semua nilai diketik dan diberi default aman di sini.
 */
const env = {
  // --- App ---------------------------------------------------------
  PORT: Number(process.env.PORT) || 8014,
  NODE_ENV: process.env.NODE_ENV || "development",
  LOG_LEVEL:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === "development" ? "debug" : "info"),
  APP_PUBLIC_URL: process.env.APP_PUBLIC_URL || "http://localhost:8014",

  // --- Database ----------------------------------------------------
  DATABASE_URL: process.env.DATABASE_URL,
  DB_POOL_MAX: Number(process.env.DB_POOL_MAX) || 20,
  DB_POOL_IDLE_TIMEOUT_MS: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS) || 30000,
  DB_POOL_CONNECTION_TIMEOUT_MS:
    Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS) || 5000,

  // --- Auth --------------------------------------------------------
  JWT_SECRET: process.env.JWT_SECRET,
  // Secret lama saat rotasi: token yang sudah beredar tetap valid sampai expiry.
  JWT_SECRET_OLD: process.env.JWT_SECRET_OLD,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "15m",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  // Kunci AES-256-GCM (64 hex char) untuk secret at-rest — libs/crypto.ts.
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  BCRYPT_ROUNDS: Number(process.env.BCRYPT_ROUNDS) || 10,
  BCRYPT_POOL_MIN: Number(process.env.BCRYPT_POOL_MIN) || 1,
  BCRYPT_POOL_MAX: Number(process.env.BCRYPT_POOL_MAX) || 4,

  // --- Integrasi ---------------------------------------------------
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",
  RABBITMQ_URL: process.env.RABBITMQ_URL,
  NOTIFICATION_QUEUE:
    process.env.NOTIFICATION_QUEUE || "app_send_notification",

  // --- Rate limit --------------------------------------------------
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || 500,
  RATE_LIMIT_TIME_WINDOW_MS:
    Number(process.env.RATE_LIMIT_TIME_WINDOW_MS) || 60000,
  RATE_LIMIT_ALLOW_LIST: (process.env.RATE_LIMIT_ALLOW_LIST || "127.0.0.1")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),

  // --- Dokumentasi -------------------------------------------------
  ENABLE_SWAGGER: process.env.ENABLE_SWAGGER !== "false",
} as const;

export default env;
