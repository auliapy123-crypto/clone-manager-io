import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

/**
 * Statements (Report §12 / Tahap 2b) — Customer & Supplier Statements.
 *
 * POLA BERBEDA dari keluarga Totals: PARAMETER-ONLY, TANPA definisi
 * tersimpan (`report_definitions` tidak disentuh sama sekali), TANPA
 * Title/Accounting method, read-only (tidak posting jurnal, tidak
 * menulis audit).
 *
 * Empat tipe sesuai nama asli Manager.io:
 *   - "... (Unpaid Invoices)"  -> parameter SATU tanggal as-of
 *   - "... (Transactions)"     -> parameter periode from..to
 */
export const STATEMENT_TYPE_VALUES = [
  "customer_statements_unpaid",
  "customer_statements_transactions",
  "supplier_statements_unpaid",
  "supplier_statements_transactions",
] as const;

export const StatementTypeSchema = z.enum(STATEMENT_TYPE_VALUES);
export type StatementType = (typeof STATEMENT_TYPE_VALUES)[number];

/** Unpaid = SATU tanggal as-of; Transactions = periode from..to. */
export const isUnpaidStatement = (type: string) => type.endsWith("_unpaid");
export const isSupplierStatement = (type: string) => type.startsWith("supplier_");

/**
 * Validator tanggal STRICT (regex + kalender), beda dari `dateString` polos
 * yang dipakai modul lain: tanggal seperti 2026-02-31 lolos regex tapi akan
 * ditolak Postgres dan berubah jadi 500. Di sini ditolak sebagai 400.
 */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Tanggal tidak valid");

export const StatementTypeParamsSchema = BusinessIdParamsSchema.extend({
  type: StatementTypeSchema,
});

export const StatementContactParamsSchema = StatementTypeParamsSchema.extend({
  contactId: z.string().uuid("ID kontak tidak valid"),
});

export const StatementListQuerySchema = SearchQuerySchema.extend({
  asOfDate: dateString.optional(),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
});

/** Detail = satu kontak; tanpa pagination (parameter saja). */
export const StatementDetailQuerySchema = z.object({
  asOfDate: dateString.optional(),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
});

/** Satu baris kontak pada daftar statement. */
export const StatementContactRowSchema = z.object({
  contactId: z.string(),
  name: z.string(),
  transactionCount: z.number(),
  amount: z.number(),
});

/** Satu baris detail: faktur (unpaid) atau gerakan (transactions). */
export const StatementDetailRowSchema = z.object({
  kind: z.enum(["invoice", "transaction"]),
  date: z.string(),
  // --- Unpaid (invoice) ---
  invoiceId: z.string().optional(),
  orderNumber: z.string().nullable().optional(),
  reference: z.string().optional(),
  invoiceTotal: z.number().optional(),
  overdueDays: z.number().optional(),
  balanceDue: z.number().optional(),
  // --- Transactions ---
  description: z.string().optional(),
  sourceModule: z.string().optional(),
  debit: z.number().optional(),
  credit: z.number().optional(),
  runningBalance: z.number().optional(),
});

/** Footer aging pada detail unpaid: Current / 1-30 / 31-60 / 61-90 / 90+. */
export const StatementBucketsSchema = z.object({
  current: z.number(),
  days1To30: z.number(),
  days31To60: z.number(),
  days61To90: z.number(),
  daysOver90: z.number(),
  total: z.number(),
});

export const StatementContactSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  billingAddress: z.string().nullable(),
});

/** Respons daftar: pagination baku + headerDate + baris Total.
 * WAJIB dideklarasikan lengkap — Zod membuang key yang tidak ada di skema.
 */
export const StatementListResponseSchema = z.object({
  data: z.array(StatementContactRowSchema),
  pagination: z.object({
    total: z.number(),
    currentPage: z.number(),
    totalPages: z.number(),
    pageSize: z.number(),
  }),
  headerDate: z.string(),
  totals: z.array(z.object({ label: z.string(), value: z.number() })),
});

export const StatementDetailResultSchema = z.object({
  type: z.string(),
  headerDate: z.string(),
  contact: StatementContactSchema,
  rows: z.array(StatementDetailRowSchema),
  buckets: StatementBucketsSchema.nullable(),
  totals: z.array(z.object({ label: z.string(), value: z.number() })),
});
