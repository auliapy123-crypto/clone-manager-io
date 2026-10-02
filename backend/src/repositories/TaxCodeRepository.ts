/**
 * TaxCodeRepository — Master Referensi Tarif Pajak (Tax Codes).
 *
 * Catatan Arsitektur:
 * - Master tarif pajak untuk standardisasi tarif di Sales Invoices.
 * - Rate disimpan/di-snapshot di tiap baris faktur, tax_code_id mencatat asal rate.
 * - Tax code yang masih dipakai oleh baris faktur aktif ditolak jika dihapus
 *   atau dinonaktifkan (400 TaxCodeValidationError).
 */
import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import db from "../db/index.js";
import {
  salesInvoiceLines,
  salesInvoices,
  taxCodes,
} from "../db/schema.js";

/** Error validasi Tax Code (guard usage delete/deactivate, tax code tidak valid) -> 400. */
export class TaxCodeValidationError extends Error {
  readonly statusCode = 400;
}

export interface TaxCodeRecord {
  id: string;
  businessId: string;
  code: string;
  name: string;
  ratePercent: number;
  isActive: boolean;
  description: string | null;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaxCodeListOptions {
  page: number;
  pageSize: number;
  q?: string;
  isActive?: boolean;
}

export interface TaxCodeCreateInput {
  code: string;
  name: string;
  ratePercent: number;
  isActive?: boolean;
  description?: string | null;
}

export interface TaxCodeUpdateInput {
  code?: string;
  name?: string;
  ratePercent?: number;
  isActive?: boolean;
  description?: string | null;
}

function toRecord(row: {
  id: string;
  businessId: string;
  code: string;
  name: string;
  ratePercent: string | number;
  isActive: boolean;
  description: string | null;
  usageCount?: string | number | null;
  createdAt: Date;
  updatedAt: Date;
}): TaxCodeRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    code: row.code,
    name: row.name,
    ratePercent: Number(row.ratePercent),
    isActive: row.isActive,
    description: row.description ?? null,
    usageCount: Number(row.usageCount ?? 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Cek apakah tax code dipakai oleh baris sales invoice aktif
 * (sales invoice induknya belum di-soft-delete).
 */
export async function hasActiveUsages(
  businessId: string,
  taxCodeId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ count: count() })
    .from(salesInvoiceLines)
    .innerJoin(
      salesInvoices,
      eq(salesInvoiceLines.salesInvoiceId, salesInvoices.id),
    )
    .where(
      and(
        eq(salesInvoiceLines.taxCodeId, taxCodeId),
        eq(salesInvoices.businessId, businessId),
        isNull(salesInvoices.deletedAt),
      ),
    );

  return Number(row?.count ?? 0) > 0;
}

/**
 * Hitung jumlah baris sales invoice aktif yang menggunakan tax code ini.
 */
export async function countUsage(
  businessId: string,
  taxCodeId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(salesInvoiceLines)
    .innerJoin(
      salesInvoices,
      eq(salesInvoiceLines.salesInvoiceId, salesInvoices.id),
    )
    .where(
      and(
        eq(salesInvoiceLines.taxCodeId, taxCodeId),
        eq(salesInvoices.businessId, businessId),
        isNull(salesInvoices.deletedAt),
      ),
    );

  return Number(row?.count ?? 0);
}

/**
 * Validasi penggunaan tax code pada baris transaksi:
 * - null/undefined: lolos (mengembalikan null agar rate eksplisit/lama dipertahankan).
 * - id diberikan: harus ada di bisnis yang sama, belum dihapus, dan berstatus aktif.
 *   Jika tidak valid, throw TaxCodeValidationError (400).
 */
export async function validateTaxCode(
  businessId: string,
  taxCodeId: string | null | undefined,
): Promise<TaxCodeRecord | null> {
  if (taxCodeId === undefined || taxCodeId === null) return null;

  const taxCode = await getTaxCodeById(businessId, taxCodeId);
  if (!taxCode) {
    throw new TaxCodeValidationError(
      "Kode pajak tidak ditemukan atau bukan milik bisnis ini.",
    );
  }
  if (!taxCode.isActive) {
    throw new TaxCodeValidationError(
      "Kode pajak harus aktif untuk digunakan pada transaksi baru.",
    );
  }

  return taxCode;
}

/**
 * Validasi semua taxCodeId pada baris input transaksi dan override
 * taxRatePercent dengan rate master saat itu — aturan prioritas di
 * TaxCodes.md §2.3: taxCodeId MENANG atas rate eksplisit.
 * Baris tanpa taxCodeId dilewatkan apa adanya (perilaku lama).
 * Lempar TaxCodeValidationError (400) kalau ada kode tidak valid/nonaktif.
 */
export async function resolveLineTaxCodes<
  T extends { taxCodeId?: string | null; taxRatePercent?: number },
>(businessId: string, lines: T[]): Promise<T[]> {
  const uniqueIds = [
    ...new Set(
      lines
        .map((l) => l.taxCodeId)
        .filter((id): id is string => id !== undefined && id !== null),
    ),
  ];
  if (uniqueIds.length === 0) return lines;

  const rateById = new Map<string, number>();
  for (const id of uniqueIds) {
    const taxCode = await validateTaxCode(businessId, id);
    if (taxCode) rateById.set(id, taxCode.ratePercent);
  }

  return lines.map((l) => {
    const rate = l.taxCodeId ? rateById.get(l.taxCodeId) : undefined;
    return rate !== undefined ? { ...l, taxRatePercent: rate } : l;
  });
}

export async function listTaxCodes(
  businessId: string,
  opts: TaxCodeListOptions,
): Promise<{ data: TaxCodeRecord[]; total: number }> {
  const conditions = [
    eq(taxCodes.businessId, businessId),
    isNull(taxCodes.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(ilike(taxCodes.code, pattern), ilike(taxCodes.name, pattern))!,
    );
  }

  if (opts.isActive !== undefined) {
    conditions.push(eq(taxCodes.isActive, opts.isActive));
  }

  const where = and(...conditions);

  // Subquery agregat penggunaan per tax code
  const usageSq = db
    .select({
      taxCodeId: salesInvoiceLines.taxCodeId,
      usageCount: count().as("usage_count"),
    })
    .from(salesInvoiceLines)
    .innerJoin(
      salesInvoices,
      eq(salesInvoiceLines.salesInvoiceId, salesInvoices.id),
    )
    .where(
      and(
        eq(salesInvoices.businessId, businessId),
        isNull(salesInvoices.deletedAt),
      ),
    )
    .groupBy(salesInvoiceLines.taxCodeId)
    .as("tax_usages");

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: taxCodes.id,
        businessId: taxCodes.businessId,
        code: taxCodes.code,
        name: taxCodes.name,
        ratePercent: taxCodes.ratePercent,
        isActive: taxCodes.isActive,
        description: taxCodes.description,
        createdAt: taxCodes.createdAt,
        updatedAt: taxCodes.updatedAt,
        usageCount: sql<number>`coalesce(${usageSq.usageCount}, 0)`.as(
          "usage_count",
        ),
      })
      .from(taxCodes)
      .leftJoin(usageSq, eq(taxCodes.id, usageSq.taxCodeId))
      .where(where)
      .orderBy(asc(taxCodes.code))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db.select({ total: count() }).from(taxCodes).where(where),
  ]);

  return {
    data: rows.map(toRecord),
    total: totalRow?.total ?? 0,
  };
}

export async function getTaxCodeById(
  businessId: string,
  id: string,
): Promise<TaxCodeRecord | null> {
  const [row] = await db
    .select({
      id: taxCodes.id,
      businessId: taxCodes.businessId,
      code: taxCodes.code,
      name: taxCodes.name,
      ratePercent: taxCodes.ratePercent,
      isActive: taxCodes.isActive,
      description: taxCodes.description,
      createdAt: taxCodes.createdAt,
      updatedAt: taxCodes.updatedAt,
    })
    .from(taxCodes)
    .where(
      and(
        eq(taxCodes.id, id),
        eq(taxCodes.businessId, businessId),
        isNull(taxCodes.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  const usage = await countUsage(businessId, id);
  return toRecord({ ...row, usageCount: usage });
}

export async function createTaxCode(
  businessId: string,
  input: TaxCodeCreateInput,
): Promise<TaxCodeRecord> {
  const [created] = await db
    .insert(taxCodes)
    .values({
      businessId,
      code: input.code.trim(),
      name: input.name.trim(),
      ratePercent: input.ratePercent.toFixed(2),
      isActive: input.isActive ?? true,
      description: input.description ?? null,
    })
    .returning({ id: taxCodes.id });

  const record = await getTaxCodeById(businessId, created.id);
  if (!record) {
    throw new Error("Gagal mengambil data tax code yang baru dibuat.");
  }
  return record;
}

export async function updateTaxCode(
  businessId: string,
  id: string,
  input: TaxCodeUpdateInput,
): Promise<TaxCodeRecord | null> {
  const existing = await getTaxCodeById(businessId, id);
  if (!existing) return null;

  // Proteksi: jika sedang dinonaktifkan tetapi masih dipakai baris aktif -> tolak 400
  if (input.isActive === false && existing.isActive) {
    const isUsed = await hasActiveUsages(businessId, id);
    if (isUsed) {
      throw new TaxCodeValidationError(
        "Kode pajak masih digunakan pada transaksi aktif, tidak dapat dinonaktifkan.",
      );
    }
  }

  const updateValues: Partial<typeof taxCodes.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.code !== undefined) updateValues.code = input.code.trim();
  if (input.name !== undefined) updateValues.name = input.name.trim();
  if (input.ratePercent !== undefined) {
    updateValues.ratePercent = input.ratePercent.toFixed(2);
  }
  if (input.isActive !== undefined) updateValues.isActive = input.isActive;
  if (input.description !== undefined) {
    updateValues.description = input.description;
  }

  await db
    .update(taxCodes)
    .set(updateValues)
    .where(
      and(
        eq(taxCodes.id, id),
        eq(taxCodes.businessId, businessId),
        isNull(taxCodes.deletedAt),
      ),
    );

  return getTaxCodeById(businessId, id);
}

export async function deleteTaxCode(
  businessId: string,
  id: string,
): Promise<boolean> {
  const existing = await getTaxCodeById(businessId, id);
  if (!existing) return false;

  // Proteksi: jika masih dipakai baris aktif -> tolak 400
  const isUsed = await hasActiveUsages(businessId, id);
  if (isUsed) {
    throw new TaxCodeValidationError(
      "Kode pajak masih digunakan pada transaksi aktif, tidak dapat dihapus.",
    );
  }

  const rows = await db
    .update(taxCodes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(taxCodes.id, id),
        eq(taxCodes.businessId, businessId),
        isNull(taxCodes.deletedAt),
      ),
    )
    .returning({ id: taxCodes.id });

  return rows.length > 0;
}
