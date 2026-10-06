import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  type CustomFieldEntityType,
  type CustomFieldDefinition,
  type CustomFieldValue,
  type CustomFieldValueUpsertItem,
  useActiveCustomFieldDefinitions,
  useCustomFieldValues,
  useUpsertCustomFieldValues,
} from "@/hooks/use-custom-fields";

/**
 * Section dinamis "Field Tambahan" untuk form Customer & Sales Invoice
 * (level header/record — BUKAN per baris item).
 *
 * Dipakai via hook `useCustomFieldsForm` + komponen render ini:
 * - Edit mode: nilai tersimpan di-prefill; values milik definisi yang kini
 *   nonaktif tetap ditampilkan (read-only, termasuk dari definisi nonaktif).
 * - Create mode: recordId null — definisi aktif ditampilkan tanpa nilai.
 * - Save DIPANGGIL MANUAL oleh form induk SETELAH save record utama sukses
 *   (kalau save utama gagal, values tidak dikirim) — lihat `save()`.
 */
export interface CustomFieldsFormApi {
  definitions: CustomFieldDefinition[];
  isPending: boolean;
  /** Nilai input per definitionId ("" = kosong/hapus; boolean langsung boolean). */
  values: Record<string, string | number | boolean | "">;
  /** Values milik definisi nonaktif — read-only, ikut tampil di detail. */
  inactiveValues: CustomFieldValue[];
  setString(definitionId: string, value: string): void;
  setBoolean(definitionId: string, value: boolean): void;
  /** Pesan error kalau ada definisi required aktif yang kosong, atau null. */
  validateRequired(): string | null;
  /** Kirim upsert batch values untuk record (panggil setelah save utama sukses). */
  save(recordId: string): Promise<void>;
  reset(): void;
}

export function useCustomFieldsForm(
  businessId: string,
  entityType: CustomFieldEntityType,
  recordId: string | null | undefined,
): CustomFieldsFormApi {
  const { definitions, isPending } = useActiveCustomFieldDefinitions(
    businessId,
    entityType,
  );
  const { data: savedValues } = useCustomFieldValues(
    businessId,
    entityType,
    recordId,
  );
  const upsert = useUpsertCustomFieldValues(businessId);

  const [values, setValues] = useState<
    Record<string, string | number | boolean | "">
  >({});
  const [inactiveValues, setInactiveValues] = useState<CustomFieldValue[]>([]);

  // Prefill nilai tersimpan saat data values/record berubah (mode edit).
  useEffect(() => {
    const next: Record<string, string | number | boolean | ""> = {};
    const inactive: CustomFieldValue[] = [];
    for (const saved of savedValues ?? []) {
      if (saved.definition.isActive) {
        next[saved.definitionId] = saved.value ?? "";
      } else {
        inactive.push(saved);
      }
    }
    setValues(next);
    setInactiveValues(inactive);
  }, [savedValues, recordId]);

  const setString = (definitionId: string, value: string) => {
    setValues((prev) => ({ ...prev, [definitionId]: value }));
  };

  const setBoolean = (definitionId: string, value: boolean) => {
    setValues((prev) => ({ ...prev, [definitionId]: value }));
  };

  const validateRequired = (): string | null => {
    for (const def of definitions) {
      if (!def.isRequired) continue;
      const raw = values[def.id];
      if (raw === undefined || raw === null || raw === "") {
        return `Field wajib "${def.label}" (Field Tambahan) belum diisi.`;
      }
    }
    return null;
  };

  const buildPayload = (): CustomFieldValueUpsertItem[] => {
    return definitions.map((def) => {
      const raw = values[def.id];
      if (raw === undefined || raw === null || raw === "") {
        return { definitionId: def.id, value: null };
      }
      if (def.fieldType === "number") {
        const num = typeof raw === "number" ? raw : Number(raw);
        return {
          definitionId: def.id,
          value: Number.isFinite(num) ? num : null,
        };
      }
      if (def.fieldType === "boolean") {
        return { definitionId: def.id, value: raw === true };
      }
      return { definitionId: def.id, value: String(raw) };
    });
  };

  const save = async (targetRecordId: string) => {
    // Tanpa definisi aktif sama sekali = tidak ada yang perlu dikirim.
    if (definitions.length === 0) return;
    await upsert.mutateAsync({
      entityType,
      recordId: targetRecordId,
      values: buildPayload(),
    });
  };

  const reset = () => {
    const next: Record<string, string | number | boolean | ""> = {};
    for (const saved of savedValues ?? []) {
      if (saved.definition.isActive) {
        next[saved.definitionId] = saved.value ?? "";
      }
    }
    setValues(next);
  };

  return {
    definitions,
    isPending,
    values,
    inactiveValues,
    setString,
    setBoolean,
    validateRequired,
    save,
    reset,
  };
}

function formatReadOnlyValue(
  value: string | number | boolean | null,
  fieldType: CustomFieldDefinition["fieldType"],
): string {
  if (value === null || value === "") return "-";
  if (fieldType === "boolean") return value === true ? "Ya" : "Tidak";
  return String(value);
}

interface CustomFieldsSectionProps {
  state: CustomFieldsFormApi;
  canWrite: boolean;
}

export function CustomFieldsSection({ state, canWrite }: CustomFieldsSectionProps) {
  const { t } = useTranslation();
  const { definitions, inactiveValues } = state;
  if (definitions.length === 0 && inactiveValues.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-md border border-dashed border-gray-300 p-3">
      <h3 className="text-sm font-semibold text-gray-900">{t("customFields.sectionTitle")}</h3>

      {state.isPending && definitions.length === 0 ? (
        <p className="text-xs text-gray-500">{t("customFields.sectionLoading")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {definitions.map((def) => {
            const raw = state.values[def.id];
            const stringValue = raw === undefined || raw === null ? "" : String(raw);
            const label = (
              <label
                htmlFor={`cf-${def.id}`}
                className="text-xs font-semibold uppercase tracking-wider text-gray-700"
              >
                {def.label}
                {def.isRequired ? " *" : ""}
              </label>
            );

            return (
              <div key={def.id} className="flex flex-col gap-1">
                {def.fieldType === "boolean" ? (
                  <label
                    htmlFor={`cf-${def.id}`}
                    className="flex items-center gap-2 text-sm font-medium text-gray-700"
                  >
                    <input
                      id={`cf-${def.id}`}
                      type="checkbox"
                      className="h-4 w-4"
                      checked={raw === true}
                      disabled={!canWrite}
                      onChange={(event) =>
                        state.setBoolean(def.id, event.target.checked)
                      }
                    />
                    {def.label}
                    {def.isRequired ? " *" : ""}
                  </label>
                ) : (
                  <>
                    {label}
                    {def.fieldType === "select" ? (
                      <select
                        id={`cf-${def.id}`}
                        className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                        value={stringValue}
                        disabled={!canWrite}
                        onChange={(event) =>
                          state.setString(def.id, event.target.value)
                        }
                      >
                        <option value="">{t("customFields.optionEmpty")}</option>
                        {(def.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id={`cf-${def.id}`}
                        type={
                          def.fieldType === "number"
                            ? "number"
                            : def.fieldType === "date"
                              ? "date"
                              : "text"
                        }
                        step={def.fieldType === "number" ? "any" : undefined}
                        value={stringValue}
                        disabled={!canWrite}
                        onChange={(event) =>
                          state.setString(def.id, event.target.value)
                        }
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {inactiveValues.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t("customFields.inactiveValuesTitle")}
          </p>
          <dl className="flex flex-col gap-0.5">
            {inactiveValues.map((saved) => (
              <div key={saved.id} className="flex items-center gap-2 text-sm">
                <dt className="text-gray-700">{saved.definition.label}</dt>
                <dd className="text-gray-900">
                  {formatReadOnlyValue(saved.value, saved.definition.fieldType)}
                  <span className="ml-1 text-xs text-amber-600">{t("customFields.inactiveTag")}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
