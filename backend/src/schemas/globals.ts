import { z } from "zod";

/**
 * Skema respons & query baku (Guide §7.3).
 * Dirujuk oleh SETIAP route — jangan definisikan ulang bentuk error
 * atau pagination di file route.
 */

export const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

// --- Query baku ------------------------------------------------------
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Varian pagination + pencarian teks bebas (Guide §7.3). */
export const SearchQuerySchema = PaginationQuerySchema.extend({
  q: z.string().trim().min(1).max(200).optional(),
});

// --- Pembungkus respons ---------------------------------------------
/** `{ data: T }` — entitas tunggal. */
export function createDataResponseSchema<T extends z.ZodTypeAny>(
  itemSchema: T,
) {
  return z.object({ data: itemSchema });
}

/** `{ data: T[], pagination }` — daftar. */
export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(
  itemSchema: T,
) {
  return z.object({
    data: z.array(itemSchema),
    pagination: z.object({
      total: z.number(),
      currentPage: z.number(),
      totalPages: z.number(),
      pageSize: z.number(),
    }),
  });
}

/** Respons aksi yang tidak mengembalikan entitas. */
export const MessageResponseSchema = createDataResponseSchema(
  z.object({ message: z.string() }),
);

// --- Alias error per status -----------------------------------------
export const BadRequest = ErrorSchema;
export const Unauthorized = ErrorSchema;
export const Forbidden = ErrorSchema;
export const NotFound = ErrorSchema;
export const Conflict = ErrorSchema;
export const UnprocessableEntity = ErrorSchema;
export const TooManyRequests = ErrorSchema;
export const InternalServerError = ErrorSchema;
export const ServiceUnavailable = ErrorSchema;
