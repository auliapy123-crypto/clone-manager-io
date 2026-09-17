/**
 * Helper error yang aman dibuka ke klien (Guide §3.1, §5.4, §7.3).
 *
 * `isPgUniqueViolation` dipakai untuk menerjemahkan pelanggaran UNIQUE
 * Postgres menjadi 409 TANPA pre-check SELECT lebih dulu — pre-check punya
 * celah race antara cek dan insert.
 */

/** SQLSTATE Postgres yang sering perlu dipetakan ke status HTTP tertentu. */
export const PG_ERROR_CODE = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  CHECK_VIOLATION: "23514",
  NOT_NULL_VIOLATION: "23502",
} as const;

interface PgLikeError {
  code?: unknown;
  constraint?: unknown;
  detail?: unknown;
  message?: unknown;
}

/**
 * drizzle-orm >=0.45 membungkus error driver asli dalam `DrizzleQueryError`,
 * dengan pg error sesungguhnya (yang punya `.code` SQLSTATE) di `.cause` —
 * bukan lagi di root object. Tanpa unwrap ini, setiap
 * `isPgUniqueViolation`/dst selalu false untuk error dari query manapun,
 * dan berakhir sebagai 500 alih-alih 409/dsb.
 */
function asPgError(error: unknown): PgLikeError | null {
  if (typeof error !== "object" || error === null) return null;

  const candidate = error as PgLikeError & { cause?: unknown };
  if (typeof candidate.code === "string") return candidate;

  return "cause" in candidate ? asPgError(candidate.cause) : null;
}

function hasPgCode(error: unknown, code: string): boolean {
  const pg = asPgError(error);
  return typeof pg?.code === "string" && pg.code === code;
}

/**
 * True bila error berasal dari pelanggaran UNIQUE.
 * `constraint` opsional: isi kalau ingin memastikan constraint tertentu
 * (mis. "users_email_key") dan bukan unique lain di tabel yang sama.
 */
export function isPgUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  if (!hasPgCode(error, PG_ERROR_CODE.UNIQUE_VIOLATION)) return false;
  if (!constraint) return true;

  const pg = asPgError(error);
  return typeof pg?.constraint === "string" && pg.constraint === constraint;
}

export function isPgForeignKeyViolation(error: unknown): boolean {
  return hasPgCode(error, PG_ERROR_CODE.FOREIGN_KEY_VIOLATION);
}

export function isPgCheckViolation(error: unknown): boolean {
  return hasPgCode(error, PG_ERROR_CODE.CHECK_VIOLATION);
}

/**
 * Pesan error yang aman ditampilkan ke klien.
 *
 * Error dari Postgres TIDAK PERNAH diteruskan apa adanya — `detail`-nya
 * sering memuat nilai kolom asli (mis. alamat email user lain). Yang
 * diteruskan hanya pesan dari Error yang kita lempar sendiri.
 */
/** Bentuk error HTTP setelah dipersempit dari `unknown`. */
export interface HttpErrorLike {
  statusCode?: number;
  code?: string;
  message?: string;
}

/**
 * Mempersempit `unknown` jadi bentuk error HTTP, sekali di satu tempat.
 *
 * Fastify v5 memberi parameter `error` bertipe `unknown` ke setErrorHandler,
 * jadi tanpa ini setiap akses `error.statusCode` / `.code` / `.message`
 * kena TS18046. Selain menyenangkan TypeScript, fungsi ini juga memeriksa
 * tipe nilainya saat runtime — `statusCode` yang bukan number diabaikan
 * daripada dipakai apa adanya lalu bikin `reply.code()` melempar.
 */
export function toHttpError(error: unknown): HttpErrorLike {
  if (typeof error !== "object" || error === null) return {};

  const candidate = error as Record<string, unknown>;

  return {
    statusCode:
      typeof candidate.statusCode === "number"
        ? candidate.statusCode
        : undefined,
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    message:
      typeof candidate.message === "string" ? candidate.message : undefined,
  };
}

export function safeErrorMessage(error: unknown, fallback?: string): string {
  const defaultMessage = fallback ?? "Terjadi kesalahan pada server.";

  if (asPgError(error)?.code !== undefined) return defaultMessage;
  if (error instanceof Error && error.message) return error.message;

  return defaultMessage;
}
