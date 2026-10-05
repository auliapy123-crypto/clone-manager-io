/**
 * CustomFieldRepository — Field Tambahan Bebas (Custom Fields, Fase 4 Fase 1).
 *
 * Catatan Arsitektur:
 * - Penyimpanan EAV generik: definisi per (business, entity_type, key) +
 *   nilai per (definition, record). TIDAK menyentuh tabel modul lain.
 * - entity_type di tabel values adalah denormalisasi dari definisi —
 *   mendukung index (business_id, entity_type, record_id) untuk fetch
 *   values per record tanpa JOIN.
 * - Value null/kosong = HAPUS FISIK baris value (tabel values tanpa
 *   soft-delete).
 * - Tipe definisi (field_type/key) IMMUTABLE setelah ada values; hapus/
 *   nonaktifkan definisi yang masih punya values ditolak 400.
 */
import { and, asc, count, eq, ilike, isNull, or } from "drizzle-orm";
import db from "../db/index.js";
import {
  contacts,
  customFieldDefinitions,
  customFieldValues,
  salesInvoices,
  type CustomFieldEntityType,
  type CustomFieldType,
} from "../db/schema.js";
import { getCustomerById } from "./ContactRepository.js";
import { getSalesInvoiceById } from "./SalesInvoiceRepository.js";

/** Error validasi Custom Field (tipe salah, required kurang, guard) -> 400. */
export class CustomFieldValidationError extends Error {
  readonly statusCode = 400;
}

export interface CustomFieldDefinitionRecord {
  id: string;
  businessId: string;
  entityType: CustomFieldEntityType;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  isRequired: boolean;
  options: string[] | null;
  sortOrder: number;
  isActive: boolean;
  valuesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomFieldValueRecord {
  id: string;
  definitionId: string;
  entityType: string;
  recordId: string;
  value: string | number | boolean | null;
  definition: {
    key: string;
    label: string;
    fieldType: CustomFieldType;
    isRequired: boolean;
    isActive: boolean;
    options: string[] | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomFieldDefinitionListOptions {
  page: number;
  pageSize: number;
  q?: string;
  entityType?: CustomFieldEntityType;
  isActive?: boolean;
}

export interface CustomFieldDefinitionCreateInput {
  entityType: CustomFieldEntityType;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  isRequired?: boolean;
  options?: string[] | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CustomFieldDefinitionUpdateInput {
  entityType?: CustomFieldEntityType;
  key?: string;
  label?: string;
  fieldType?: CustomFieldType;
  isRequired?: boolean;
  options?: string[] | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpsertCustomFieldValuesInput {
  entityType: CustomFieldEntityType;
  recordId: string;
  values: {
    definitionId: string;
    value: string | number | boolean | null;
  }[];
}

function toDefinitionRecord(row: {
  id: string;
  businessId: string;
  entityType: CustomFieldEntityType;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  isRequired: boolean;
  options: string[] | null;
  sortOrder: number;
  isActive: boolean;
  valuesCount?: string | number | null;
  createdAt: Date;
  updatedAt: Date;
}): CustomFieldDefinitionRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    entityType: row.entityType,
    key: row.key,
    label: row.label,
    fieldType: row.fieldType,
    isRequired: row.isRequired,
    options: row.options ?? null,
    sortOrder: Number(row.sortOrder),
    isActive: row.isActive,
    // value_number-style numeric TIDAK ada di definisi, tapi tetap aman:
    // hasil agregat count() bisa datang sebagai string dari driver.
    valuesCount: Number(row.valuesCount ?? 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Ambil satu nilai "aktif" per tipe dari baris values. numeric Postgres
 * dikembalikan sebagai STRING oleh driver — WAJIB Number() eksplisit
 * (pelajaran pahit #2).
 */
function extractValue(row: {
  valueText: string | null;
  valueNumber: string | null;
  valueDate: string | null;
  valueBoolean: boolean | null;
}): string | number | boolean | null {
  if (row.valueText !== null) return row.valueText;
  if (row.valueNumber !== null) return Number(row.valueNumber);
  if (row.valueDate !== null) return row.valueDate;
  if (row.valueBoolean !== null) return row.valueBoolean;
  return null;
}

/** Value dianggap kosong (harus dihapus fisik) hanya jika null/"". */
function isEmptyValue(
  fieldType: CustomFieldType,
  value: string | number | boolean | null,
): boolean {
  if (value === null) return true;
  if (fieldType === "text" || fieldType === "select") {
    // Value bertipe salah (mis. number ke text) BUKAN "kosong" — ditolak
    // oleh assertValueMatchesType, bukan dianggap perintah hapus.
    return typeof value === "string" && (value as string).trim() === "";
  }
  return false;
}

/** Validasi format tanggal YYYY-MM-DD sungguhan (bukan sekadar regex). */
function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

/**
 * Validasi tipe value terhadap fieldType definisi. Melempar
 * CustomFieldValidationError (400) jika tidak cocok.
 */
function assertValueMatchesType(
  def: {
    key: string;
    label: string;
    fieldType: CustomFieldType;
    options: string[] | null;
  },
  value: string | number | boolean | null,
): void {
  if (value === null) return; // null selalu valid: artinya hapus value.

  switch (def.fieldType) {
    case "text":
      if (typeof value !== "string") {
        throw new CustomFieldValidationError(
          `Field "${def.label}" bertipe text menerima teks, diterima ${typeof value}.`,
        );
      }
      break;
    case "select":
      if (typeof value !== "string") {
        throw new CustomFieldValidationError(
          `Field "${def.label}" bertipe select menerima teks pilihan, diterima ${typeof value}.`,
        );
      }
      if (!(def.options ?? []).includes(value)) {
        throw new CustomFieldValidationError(
          `Field "${def.label}" hanya menerima salah satu opsi: ${(def.options ?? []).join(", ")}.`,
        );
      }
      break;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new CustomFieldValidationError(
          `Field "${def.label}" bertipe number menerima angka, diterima ${typeof value}.`,
        );
      }
      break;
    case "date":
      if (
        typeof value !== "string" ||
        !isValidDateString(value)
      ) {
        throw new CustomFieldValidationError(
          `Field "${def.label}" bertipe date menerima tanggal format YYYY-MM-DD yang valid.`,
        );
      }
      break;
    case "boolean":
      if (typeof value !== "boolean") {
        throw new CustomFieldValidationError(
          `Field "${def.label}" bertipe boolean menerima true/false, diterima ${typeof value}.`,
        );
      }
      break;
  }
}

/**
 * Validasi bahwa record pemilik values benar-benar ada di bisnis ini dan
 * belum di-soft-delete — record_id di tabel values TANPA FK, jadi tanpa
 * cek ini upsert ke ID acak akan diam-diam membuat values yatim.
 */
async function assertRecordExists(
  businessId: string,
  entityType: CustomFieldEntityType,
  recordId: string,
): Promise<void> {
  if (entityType === "customer") {
    const record = await getCustomerById(businessId, recordId);
    if (!record) {
      throw new CustomFieldValidationError(
        "Customer pemilik values tidak ditemukan di bisnis ini (atau sudah dihapus).",
      );
    }
    return;
  }
  const record = await getSalesInvoiceById(businessId, recordId);
  if (!record) {
    throw new CustomFieldValidationError(
      "Faktur penjualan pemilik values tidak ditemukan di bisnis ini (atau sudah dihapus).",
    );
  }
}

/** Nilai kolom yang diisi untuk satu fieldType (kolom lain dipaksa null). */
function columnsForType(
  fieldType: CustomFieldType,
  value: string | number | boolean,
): {
  valueText: string | null;
  valueNumber: string | null;
  valueDate: string | null;
  valueBoolean: boolean | null;
} {
  switch (fieldType) {
    case "text":
    case "select":
      return {
        valueText: value as string,
        valueNumber: null,
        valueDate: null,
        valueBoolean: null,
      };
    case "number":
      return {
        valueText: null,
        valueNumber: Number(value).toFixed(2),
        valueDate: null,
        valueBoolean: null,
      };
    case "date":
      return {
        valueText: null,
        valueNumber: null,
        valueDate: value as string,
        valueBoolean: null,
      };
    case "boolean":
      return {
        valueText: null,
        valueNumber: null,
        valueDate: null,
        valueBoolean: value as boolean,
      };
  }
}

/**
 * Hitung jumlah values milik satu definisi yang pemilik record-nya masih
 * AKTIF (record soft-deleted = values yatim, tidak dihitung — kalau tidak,
 * definisi tak bisa dihapus setelah salah satu pemakainya dihapus).
 * Definisi selalu ber-scope satu bisnis, jadi business_id cukup dari definisinya.
 */
export async function countValues(
  businessId: string,
  definitionId: string,
): Promise<number> {
  const [def] = await db
    .select({ entityType: customFieldDefinitions.entityType })
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.id, definitionId),
        eq(customFieldDefinitions.businessId, businessId),
      ),
    )
    .limit(1);

  if (!def) return 0;

  const valueConditions = and(
    eq(customFieldValues.definitionId, definitionId),
    eq(customFieldValues.businessId, businessId),
  );

  if (def.entityType === "customer") {
    const [row] = await db
      .select({ count: count() })
      .from(customFieldValues)
      .innerJoin(
        contacts,
        and(
          eq(customFieldValues.recordId, contacts.id),
          eq(contacts.businessId, businessId),
          isNull(contacts.deletedAt),
        ),
      )
      .where(valueConditions);
    return Number(row?.count ?? 0);
  }

  if (def.entityType === "sales_invoice") {
    const [row] = await db
      .select({ count: count() })
      .from(customFieldValues)
      .innerJoin(
        salesInvoices,
        and(
          eq(customFieldValues.recordId, salesInvoices.id),
          eq(salesInvoices.businessId, businessId),
          isNull(salesInvoices.deletedAt),
        ),
      )
      .where(valueConditions);
    return Number(row?.count ?? 0);
  }

  // Entity di luar Fase 1 tidak bisa punya definisi (enum Zod) — anggap kosong.
  return 0;
}

export async function hasValues(
  businessId: string,
  definitionId: string,
): Promise<boolean> {
  return (await countValues(businessId, definitionId)) > 0;
}

export async function getDefinitionById(
  businessId: string,
  id: string,
): Promise<CustomFieldDefinitionRecord | null> {
  const [row] = await db
    .select()
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.id, id),
        eq(customFieldDefinitions.businessId, businessId),
        isNull(customFieldDefinitions.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  const valuesCount = await countValues(businessId, id);
  return toDefinitionRecord({ ...row, valuesCount });
}

export async function listDefinitions(
  businessId: string,
  opts: CustomFieldDefinitionListOptions,
): Promise<{ data: CustomFieldDefinitionRecord[]; total: number }> {
  const conditions = [
    eq(customFieldDefinitions.businessId, businessId),
    isNull(customFieldDefinitions.deletedAt),
  ];

  if (opts.entityType) {
    conditions.push(eq(customFieldDefinitions.entityType, opts.entityType));
  }
  if (opts.isActive !== undefined) {
    conditions.push(eq(customFieldDefinitions.isActive, opts.isActive));
  }
  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(customFieldDefinitions.key, pattern),
        ilike(customFieldDefinitions.label, pattern),
      )!,
    );
  }

  const where = and(...conditions);

  // Subquery agregat pemakaian per definisi (pola TaxCodeRepository).
  const valuesSq = db
    .select({
      definitionId: customFieldValues.definitionId,
      valuesCount: count().as("values_count"),
    })
    .from(customFieldValues)
    .where(eq(customFieldValues.businessId, businessId))
    .groupBy(customFieldValues.definitionId)
    .as("cf_value_counts");

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: customFieldDefinitions.id,
        businessId: customFieldDefinitions.businessId,
        entityType: customFieldDefinitions.entityType,
        key: customFieldDefinitions.key,
        label: customFieldDefinitions.label,
        fieldType: customFieldDefinitions.fieldType,
        isRequired: customFieldDefinitions.isRequired,
        options: customFieldDefinitions.options,
        sortOrder: customFieldDefinitions.sortOrder,
        isActive: customFieldDefinitions.isActive,
        createdAt: customFieldDefinitions.createdAt,
        updatedAt: customFieldDefinitions.updatedAt,
        valuesCount: valuesSq.valuesCount,
      })
      .from(customFieldDefinitions)
      .leftJoin(
        valuesSq,
        eq(customFieldDefinitions.id, valuesSq.definitionId),
      )
      .where(where)
      .orderBy(
        asc(customFieldDefinitions.entityType),
        asc(customFieldDefinitions.sortOrder),
        asc(customFieldDefinitions.label),
      )
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(customFieldDefinitions)
      .where(where),
  ]);

  return {
    data: rows.map(toDefinitionRecord),
    total: totalRow?.total ?? 0,
  };
}

export async function createDefinition(
  businessId: string,
  input: CustomFieldDefinitionCreateInput,
): Promise<CustomFieldDefinitionRecord> {
  const options =
    input.fieldType === "select"
      ? (input.options ?? null)
      : null; // tipe non-select tidak menyimpan options.

  const [created] = await db
    .insert(customFieldDefinitions)
    .values({
      businessId,
      entityType: input.entityType,
      key: input.key.trim(),
      label: input.label.trim(),
      fieldType: input.fieldType,
      isRequired: input.isRequired ?? false,
      options,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    })
    .returning({ id: customFieldDefinitions.id });

  const record = await getDefinitionById(businessId, created.id);
  if (!record) {
    throw new Error("Gagal mengambil definisi custom field yang baru dibuat.");
  }
  return record;
}

export async function updateDefinition(
  businessId: string,
  id: string,
  input: CustomFieldDefinitionUpdateInput,
): Promise<CustomFieldDefinitionRecord | null> {
  const existing = await getDefinitionById(businessId, id);
  if (!existing) return null;

  // Guard immutability: tipe & key terkunci setelah definisi punya values.
  const typeChanged =
    input.fieldType !== undefined && input.fieldType !== existing.fieldType;
  const keyChanged = input.key !== undefined && input.key.trim() !== existing.key;
  if ((typeChanged || keyChanged) && (await hasValues(businessId, id))) {
    throw new CustomFieldValidationError(
      "Tipe dan key definisi tidak dapat diubah karena sudah ada nilai tersimpan (hapus dulu nilainya).",
    );
  }

  // Guard nonaktif: definisi yang masih punya values ditolak (§5.6).
  if (input.isActive === false && existing.isActive) {
    const usedCount = await countValues(businessId, id);
    if (usedCount > 0) {
      throw new CustomFieldValidationError(
        `Definisi masih dipakai oleh ${usedCount} nilai tersimpan dan tidak dapat dinonaktifkan.`,
      );
    }
  }

  const finalFieldType = typeChanged ? input.fieldType! : existing.fieldType;
  const finalOptions =
    input.options !== undefined ? input.options : existing.options;
  if (finalFieldType === "select") {
    const hasOptions = Array.isArray(finalOptions) && finalOptions.length >= 1;
    if (!hasOptions) {
      throw new CustomFieldValidationError(
        "Tipe select wajib punya daftar opsi (minimal 1).",
      );
    }
  }

  const updateValues: Partial<typeof customFieldDefinitions.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.entityType !== undefined) updateValues.entityType = input.entityType;
  if (input.key !== undefined) updateValues.key = input.key.trim();
  if (input.label !== undefined) updateValues.label = input.label.trim();
  if (input.fieldType !== undefined) updateValues.fieldType = input.fieldType;
  if (input.isRequired !== undefined) updateValues.isRequired = input.isRequired;
  if (input.options !== undefined) {
    updateValues.options = finalFieldType === "select" ? input.options : null;
  }
  if (input.sortOrder !== undefined) updateValues.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) updateValues.isActive = input.isActive;

  await db
    .update(customFieldDefinitions)
    .set(updateValues)
    .where(
      and(
        eq(customFieldDefinitions.id, id),
        eq(customFieldDefinitions.businessId, businessId),
        isNull(customFieldDefinitions.deletedAt),
      ),
    );

  return getDefinitionById(businessId, id);
}

export async function deleteDefinition(
  businessId: string,
  id: string,
): Promise<boolean> {
  const existing = await getDefinitionById(businessId, id);
  if (!existing) return false;

  // Guard: definisi yang masih punya values (record AKTIF) ditolak
  // (pola Project/Division/TaxCode).
  const usedCount = await countValues(businessId, id);
  if (usedCount > 0) {
    throw new CustomFieldValidationError(
      `Definisi masih dipakai oleh ${usedCount} nilai tersimpan dan tidak dapat dihapus.`,
    );
  }

  // Values yatim (pemilik record sudah dihapus) dibersihkan fisik agar
  // tidak menumpuk tanpa pernah bisa diakses lagi.
  await db
    .delete(customFieldValues)
    .where(
      and(
        eq(customFieldValues.definitionId, id),
        eq(customFieldValues.businessId, businessId),
      ),
    );

  const rows = await db
    .update(customFieldDefinitions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(customFieldDefinitions.id, id),
        eq(customFieldDefinitions.businessId, businessId),
        isNull(customFieldDefinitions.deletedAt),
      ),
    )
    .returning({ id: customFieldDefinitions.id });

  return rows.length > 0;
}

/**
 * Values satu record — join definisi yang AKTIF maupun NONAKTIF tapi
 * belum soft-deleted (values dari definisi nonaktif tetap tampil di
 * detail, sesuai CustomFields.md §6). Urut sort_order definisi.
 */
export async function listValues(
  businessId: string,
  entityType: CustomFieldEntityType,
  recordId: string,
): Promise<CustomFieldValueRecord[]> {
  const rows = await db
    .select({
      id: customFieldValues.id,
      definitionId: customFieldValues.definitionId,
      entityType: customFieldValues.entityType,
      recordId: customFieldValues.recordId,
      valueText: customFieldValues.valueText,
      valueNumber: customFieldValues.valueNumber,
      valueDate: customFieldValues.valueDate,
      valueBoolean: customFieldValues.valueBoolean,
      createdAt: customFieldValues.createdAt,
      updatedAt: customFieldValues.updatedAt,
      defKey: customFieldDefinitions.key,
      defLabel: customFieldDefinitions.label,
      defFieldType: customFieldDefinitions.fieldType,
      defIsRequired: customFieldDefinitions.isRequired,
      defIsActive: customFieldDefinitions.isActive,
      defOptions: customFieldDefinitions.options,
    })
    .from(customFieldValues)
    .innerJoin(
      customFieldDefinitions,
      eq(customFieldValues.definitionId, customFieldDefinitions.id),
    )
    .where(
      and(
        eq(customFieldValues.businessId, businessId),
        eq(customFieldValues.entityType, entityType),
        eq(customFieldValues.recordId, recordId),
        isNull(customFieldDefinitions.deletedAt),
      ),
    )
    .orderBy(
      asc(customFieldDefinitions.sortOrder),
      asc(customFieldDefinitions.label),
    );

  return rows.map((row) => ({
    id: row.id,
    definitionId: row.definitionId,
    entityType: row.entityType,
    recordId: row.recordId,
    value: extractValue(row),
    definition: {
      key: row.defKey,
      label: row.defLabel,
      fieldType: row.defFieldType,
      isRequired: row.defIsRequired,
      isActive: row.defIsActive,
      options: row.defOptions ?? null,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/**
 * Upsert batch values untuk satu record.
 *
 * Validasi (CustomFields.md §5.3–5.4):
 * - tiap item: definisi harus milik bisnis+entity ini, aktif, belum
 *   dihapus, dan tipe value cocok (salah -> 400);
 * - value null/kosong ("") -> hapus fisik baris value;
 * - setelah upsert, SEMUA definisi required+aktif entity itu wajib punya
 *   value non-kosong untuk record ini (kurang -> 400, transaksi rollback).
 */
export async function upsertCustomFieldValues(
  businessId: string,
  input: UpsertCustomFieldValuesInput,
): Promise<CustomFieldValueRecord[]> {
  await db.transaction(async (tx) => {
    // 0. Record pemilik harus benar-benar ada di bisnis ini dan aktif
    //    (record_id tanpa FK — tanpa cek ini bisa terbentuk values yatim).
    await assertRecordExists(businessId, input.entityType, input.recordId);

    // 1. Kumpulan definisi entity ini (belum dihapus).
    const defs = await tx
      .select()
      .from(customFieldDefinitions)
      .where(
        and(
          eq(customFieldDefinitions.businessId, businessId),
          eq(customFieldDefinitions.entityType, input.entityType),
          isNull(customFieldDefinitions.deletedAt),
        ),
      );
    const defById = new Map(defs.map((d) => [d.id, d]));

    // 2. Validasi tiap item terhadap definisinya. null/kosong ("") adalah
    //    perintah HAPUS value (§5.3) — selalu valid, tidak masuk cek tipe.
    for (const item of input.values) {
      const def = defById.get(item.definitionId);
      if (!def) {
        throw new CustomFieldValidationError(
          "Ada definisi yang tidak ditemukan, bukan milik bisnis ini, atau bukan untuk entity tersebut.",
        );
      }
      if (!def.isActive) {
        throw new CustomFieldValidationError(
          `Definisi "${def.label}" sedang nonaktif dan tidak dapat diisi.`,
        );
      }
      if (!isEmptyValue(def.fieldType, item.value)) {
        assertValueMatchesType(def, item.value);
      }
    }

    // 3. Terapkan: null/kosong = hapus fisik, selain itu upsert.
    for (const item of input.values) {
      const def = defById.get(item.definitionId)!;

      if (isEmptyValue(def.fieldType, item.value)) {
        await tx
          .delete(customFieldValues)
          .where(
            and(
              eq(customFieldValues.definitionId, def.id),
              eq(customFieldValues.recordId, input.recordId),
              eq(customFieldValues.businessId, businessId),
            ),
          );
        continue;
      }

      const columns = columnsForType(
        def.fieldType,
        item.value as string | number | boolean,
      );

      await tx
        .insert(customFieldValues)
        .values({
          businessId,
          definitionId: def.id,
          entityType: input.entityType,
          recordId: input.recordId,
          ...columns,
        })
        .onConflictDoUpdate({
          target: [
            customFieldValues.definitionId,
            customFieldValues.recordId,
          ],
          set: {
            ...columns,
            updatedAt: new Date(),
          },
        });
    }

    // 4. Semua definisi required+aktif entity ini wajib terisi non-kosong.
    const requiredDefs = defs.filter((d) => d.isRequired && d.isActive);
    if (requiredDefs.length > 0) {
      const existingValues = await tx
        .select({
          definitionId: customFieldValues.definitionId,
          valueText: customFieldValues.valueText,
          valueNumber: customFieldValues.valueNumber,
          valueDate: customFieldValues.valueDate,
          valueBoolean: customFieldValues.valueBoolean,
        })
        .from(customFieldValues)
        .where(
          and(
            eq(customFieldValues.businessId, businessId),
            eq(customFieldValues.entityType, input.entityType),
            eq(customFieldValues.recordId, input.recordId),
          ),
        );

      for (const def of requiredDefs) {
        const row = existingValues.find((v) => v.definitionId === def.id);
        const value = row ? extractValue(row) : null;
        if (isEmptyValue(def.fieldType, value)) {
          throw new CustomFieldValidationError(
            `Field wajib "${def.label}" belum diisi.`,
          );
        }
      }
    }
  });

  return listValues(businessId, input.entityType, input.recordId);
}
