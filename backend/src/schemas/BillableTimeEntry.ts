import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

/**
 * Billable Time — catatan jam kerja yang berpotensi ditagihkan.
 *
 * 1 tabel datar (TANPA baris item), NON-POSTING, dan BERDIRI SENDIRI:
 * TIDAK ADA relasi/endpoint apa pun ke Sales Invoices (dokumen §2.1).
 * amount & status TIDAK disimpan — amount dihitung real-time,
 * status SELALU "Uninvoiced" (statis).
 */
export const CreateBillableTimeEntrySchema = z.object({
  customerId: z.string().uuid(),
  employeeContactId: z.string().uuid(),
  date: dateString,
  description: z
    .string()
    .trim()
    .min(1, "Deskripsi pekerjaan wajib diisi")
    .max(2000),
  hourlyRate: z.number().min(0, "Tarif per jam tidak boleh negatif"),
  timeSpentMinutes: z
    .number()
    .int("Waktu harus dalam menit bilangan bulat")
    .positive("Waktu yang dihabiskan harus lebih dari 0 menit"),
});

export const UpdateBillableTimeEntrySchema = z.object({
  customerId: z.string().uuid().optional(),
  employeeContactId: z.string().uuid().optional(),
  date: dateString.optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  hourlyRate: z.number().min(0).optional(),
  timeSpentMinutes: z
    .number()
    .int("Waktu harus dalam menit bilangan bulat")
    .positive("Waktu yang dihabiskan harus lebih dari 0 menit")
    .optional(),
});

export const BillableTimeEntryListQuerySchema = SearchQuerySchema;

export const BillableTimeEntryIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid(),
});

export const BillableTimeEntryResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  employeeContactId: z.string(),
  employeeName: z.string(),
  date: z.string(),
  description: z.string(),
  hourlyRate: z.number(),
  timeSpentMinutes: z.number(),
  amount: z.number(),
  status: z.literal("Uninvoiced"),
  createdAt: z.date(),
  updatedAt: z.date(),
});
