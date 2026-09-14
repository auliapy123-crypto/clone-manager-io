/**
 * Kode error terpusat (Guide §3.1 — constants/errors.ts).
 *
 * Nilai di sini yang dipakai sebagai field `error` pada respons baku
 * `{ error, message }`. Jangan pernah menulis string kode error secara
 * literal di route atau repository — impor dari sini.
 */
export const ErrorCode = {
  BAD_REQUEST: "BadRequest",
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN: "Forbidden",
  NOT_FOUND: "NotFound",
  CONFLICT: "Conflict",
  UNPROCESSABLE: "UnprocessableEntity",
  TOO_MANY_REQUESTS: "TooManyRequests",
  INTERNAL_SERVER_ERROR: "InternalServerError",
  SERVICE_UNAVAILABLE: "ServiceUnavailable",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Pesan default per kode — dipakai kalau route tidak memberi pesan spesifik. */
export const ErrorMessage = {
  [ErrorCode.BAD_REQUEST]: "Permintaan tidak valid.",
  [ErrorCode.UNAUTHORIZED]: "Token tidak ditemukan. Silakan login.",
  [ErrorCode.FORBIDDEN]: "Anda tidak memiliki akses ke sumber daya ini.",
  [ErrorCode.NOT_FOUND]: "Data tidak ditemukan.",
  [ErrorCode.CONFLICT]: "Data bentrok dengan data yang sudah ada.",
  [ErrorCode.UNPROCESSABLE]: "Data tidak dapat diproses.",
  [ErrorCode.TOO_MANY_REQUESTS]:
    "Terlalu banyak permintaan. Coba lagi beberapa saat lagi.",
  [ErrorCode.INTERNAL_SERVER_ERROR]: "Terjadi kesalahan pada server.",
  [ErrorCode.SERVICE_UNAVAILABLE]: "Layanan sedang tidak tersedia.",
} as const satisfies Record<ErrorCodeValue, string>;

/**
 * Memetakan status HTTP ke kode error baku kita.
 *
 * Dipakai error handler global supaya error bawaan Fastify tidak membocorkan
 * kode internalnya (`FST_ERR_CTP_INVALID_MEDIA_TYPE`, dsb.) ke klien —
 * field `error` harus selalu berisi nilai dari ErrorCode di atas.
 */
export function errorCodeForStatus(status: number): ErrorCodeValue {
  switch (status) {
    case 400:
      return ErrorCode.BAD_REQUEST;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 422:
      return ErrorCode.UNPROCESSABLE;
    case 429:
      return ErrorCode.TOO_MANY_REQUESTS;
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return status >= 400 && status < 500
        ? ErrorCode.BAD_REQUEST
        : ErrorCode.INTERNAL_SERVER_ERROR;
  }
}
