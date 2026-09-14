/**
 * Koneksi database tunggal untuk seluruh backend (Guide §5.1).
 *
 * Seluruh akses DB melalui file ini. Repository mengimpor `db` langsung
 * (default export) — tidak ada penerusan koneksi per-request, tidak ada
 * unit-of-work manual kecuali transaksi eksplisit.
 */
import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import env from "../constants/env.js";
import { logger } from "../libs/logger.js";
import * as schema from "./schema.js";

if (!env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL belum diset. Salin .env.example jadi .env lalu isi connection string database.",
  );
}

// Postgres terkelola (Neon/RDS) mewajibkan SSL; Postgres lokal (Laragon /
// docker-compose) justru menolaknya. Deteksi dari connection string.
const requiresSsl = /sslmode=require|neon\.tech|amazonaws\.com/i.test(
  env.DATABASE_URL,
);

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
});

// Error pada koneksi idle tidak boleh menjatuhkan proses.
pool.on("error", (err) => {
  logger.error({ err }, "Unexpected DB pool error");
});

const db = drizzle(pool, { schema, casing: "snake_case" });

/**
 * Dijalankan saat boot, SEBELUM Fastify listen (Guide §5.3), supaya
 * container baru selalu selaras dengan skema kode.
 * Fail-fast: orchestrator yang me-restart container.
 */
export async function runMigrations(): Promise<void> {
  const migrationsFolder = "./migrations";

  // Repo yang belum pernah `pnpm migrations:generate` belum punya folder ini.
  // Itu bukan kegagalan migrasi — jangan matikan proses karenanya.
  if (!existsSync(migrationsFolder)) {
    logger.warn(
      `Folder ${migrationsFolder} belum ada — migrasi dilewati. ` +
        "Jalankan `pnpm migrations:generate` lebih dulu.",
    );
    return;
  }

  try {
    const migrationDb = drizzle(pool, { casing: undefined });
    await migrate(migrationDb, { migrationsFolder });
    logger.info("Database migrations completed successfully");
  } catch (error) {
    logger.fatal({ err: error }, "Database migration failed");
    process.exit(1);
  }
}

/**
 * Cek konektivitas untuk HealthPlugin. Timeout dijaga pemanggil
 * (Guide §7.4: 2 detik).
 */
export async function pingDatabase(): Promise<void> {
  await db.execute(sql`select 1`);
}

/** Statistik pool untuk /health. */
export function poolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

/** WAJIB dipanggil saat graceful shutdown (Guide §5.1). */
export async function closePool(): Promise<void> {
  await pool.end();
}

export { pool, schema };
export type Database = typeof db;
export default db;
