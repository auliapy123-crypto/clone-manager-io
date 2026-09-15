/**
 * Normalisasi pesan error API (Guide §3, §8).
 * Backend selalu membalas error dengan bentuk baku { error, message }.
 */
export interface ApiErrorBody {
  error: string;
  message: string;
}

export class ApiError extends Error {
  code: string;

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.error;
  }
}

const DEFAULT_MESSAGE = "Terjadi kesalahan. Silakan coba lagi.";

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    "message" in value &&
    typeof (value as ApiErrorBody).message === "string"
  );
}

/** Dipakai form/mutation untuk menampilkan pesan error server ke user. */
export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (isApiErrorBody(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return DEFAULT_MESSAGE;
}
