import { z } from "zod";
import { BusinessIdParamsSchema } from "./Business.js";
import { SearchQuerySchema } from "./globals.js";

export const CUSTOM_FIELD_ENTITY_TYPE_VALUES = [
  "customer",
  "sales_invoice",
] as const;
export const CUSTOM_FIELD_TYPE_VALUES = [
  "text",
  "number",
  "date",
  "boolean",
  "select",
] as const;

export const CustomFieldEntityTypeSchema = z.enum(
  CUSTOM_FIELD_ENTITY_TYPE_VALUES,
);
export const CustomFieldFieldTypeSchema = z.enum(CUSTOM_FIELD_TYPE_VALUES);

export const CustomFieldKeySchema = z
  .string()
  .trim()
  .min(1, "Key wajib diisi")
  .max(50, "Key maksimal 50 karakter")
  .regex(
    /^[a-z0-9_]+$/,
    "Key hanya boleh huruf kecil, angka, dan underscore (snake_case)",
  );

const optionsSchema = z
  .array(z.string().trim().min(1, "Opsi tidak boleh kosong").max(255))
  .min(1, "Tipe select wajib punya minimal 1 opsi")
  .max(255)
  .optional()
  .nullable();

const definitionBase = z.object({
  entityType: CustomFieldEntityTypeSchema,
  key: CustomFieldKeySchema,
  label: z.string().trim().min(1, "Label wajib diisi").max(100, "Label maksimal 100 karakter"),
  fieldType: CustomFieldFieldTypeSchema,
  isRequired: z.boolean().optional().default(false),
  options: optionsSchema,
  sortOrder: z.number().int().min(0).max(100000).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export const CreateCustomFieldDefinitionSchema = definitionBase.superRefine(
  (val, ctx) => {
    if (val.fieldType === "select") {
      if (!val.options || val.options.length < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Tipe select wajib punya daftar opsi (minimal 1)",
        });
      }
    } else if (val.options && val.options.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Options hanya boleh diisi untuk tipe select",
      });
    }
  },
);

export const UpdateCustomFieldDefinitionSchema = definitionBase
  .partial()
  .superRefine((val, ctx) => {
    if (val.fieldType === "select") {
      // Saat update boleh tidak mengirim options (pakai yang lama) —
      // tapi kalau fieldType BARU adalah select dan options dikirim kosong,
      // tolak (options lama mungkin sudah cocok, jadi cek dilakukan juga
      // di repository: definisi select tanpa options sama sekali ditolak).
      if (val.options !== undefined && val.options !== null && val.options.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Tipe select wajib punya daftar opsi (minimal 1)",
        });
      }
    } else if (val.options && val.options.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Options hanya boleh diisi untuk tipe select",
      });
    }
  });

export const CustomFieldDefinitionListQuerySchema = SearchQuerySchema.extend({
  entityType: CustomFieldEntityTypeSchema.optional(),
  isActive: z
    .preprocess((val) => {
      if (typeof val === "string") {
        if (val.toLowerCase() === "true") return true;
        if (val.toLowerCase() === "false") return false;
      }
      return val;
    }, z.boolean().optional()),
});

export const CustomFieldIdParamsSchema = BusinessIdParamsSchema.extend({
  id: z.string().uuid("ID definisi tidak valid"),
});

/** Value bebas dari klien: teks, angka, boolean, atau null (hapus value). */
export const CustomFieldValueInputSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const UpsertCustomFieldValuesSchema = z.object({
  entityType: CustomFieldEntityTypeSchema,
  recordId: z.string().uuid("Record ID tidak valid"),
  values: z
    .array(
      z.object({
        definitionId: z.string().uuid("ID definisi tidak valid"),
        value: CustomFieldValueInputSchema,
      }),
    )
    .max(200),
});

export const ListCustomFieldValuesQuerySchema = z.object({
  entityType: CustomFieldEntityTypeSchema,
  recordId: z.string().uuid("Record ID tidak valid"),
});

export const CustomFieldDefinitionResponseSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  entityType: z.string(),
  key: z.string(),
  label: z.string(),
  fieldType: z.string(),
  isRequired: z.boolean(),
  options: z.array(z.string()).nullable(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  valuesCount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CustomFieldValueResponseSchema = z.object({
  id: z.string(),
  definitionId: z.string(),
  entityType: z.string(),
  recordId: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
  definition: z.object({
    key: z.string(),
    label: z.string(),
    fieldType: z.string(),
    isRequired: z.boolean(),
    isActive: z.boolean(),
    options: z.array(z.string()).nullable(),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
});
