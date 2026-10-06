import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useBusinesses } from "@/hooks/use-businesses";
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_TYPE_LABEL_KEYS,
  type CustomFieldDefinition,
  type CustomFieldEntityType,
  type CreateCustomFieldDefinitionInput,
  useCreateCustomFieldDefinition,
  useCustomFieldDefinition,
  useCustomFieldDefinitions,
  useDeleteCustomFieldDefinition,
  useUpdateCustomFieldDefinition,
} from "@/hooks/use-custom-fields";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/custom-fields")({
  component: CustomFieldsPage,
});

const ENTITY_TYPE_LABEL_KEYS: Record<CustomFieldEntityType, string> = {
  customer: "menu.customers",
  sales_invoice: "menu.salesInvoices",
};

function StatusBadge({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation();
  const style = isActive
    ? "bg-green-100 text-green-800 border border-green-200"
    : "bg-gray-100 text-gray-600 border border-gray-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {isActive ? t("common.active") : t("customFields.optionInactive")}
    </span>
  );
}

function CustomFieldsPage() {
  const { t } = useTranslation();
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [entityFilter, setEntityFilter] = useState<"" | CustomFieldEntityType>("");
  const [statusFilter, setStatusFilter] = useState<"" | "true" | "false">("");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [entityFilter, statusFilter]);

  const { data, isPending, isError, error } = useCustomFieldDefinitions(
    businessId,
    page,
    {
      q: q || undefined,
      entityType: entityFilter || undefined,
      isActive: statusFilter === "" ? undefined : statusFilter === "true",
    },
    10,
  );

  const updateDefinition = useUpdateCustomFieldDefinition(businessId);
  const deleteDefinition = useDeleteCustomFieldDefinition(businessId);

  const handleToggleActive = async (definition: CustomFieldDefinition) => {
    setActionError(null);
    try {
      await updateDefinition.mutateAsync({
        id: definition.id,
        isActive: !definition.isActive,
      });
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  const handleDelete = async (definition: CustomFieldDefinition) => {
    if (!window.confirm(t("customFields.deleteConfirm", { label: definition.label, key: definition.key }))) {
      return;
    }
    setActionError(null);
    try {
      await deleteDefinition.mutateAsync(definition.id);
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t("customFields.title")}</h1>
          {data && (
            <p className="text-sm text-gray-500">
              {t("customFields.subtitle", { count: data.pagination.total })}
            </p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveId("new")}>{t("customFields.newButton")}</Button>
        )}
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder={t("customFields.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          value={entityFilter}
          onChange={(e) =>
            setEntityFilter(e.target.value as "" | CustomFieldEntityType)
          }
        >
          <option value="">{t("customFields.allEntities")}</option>
          {CUSTOM_FIELD_ENTITY_TYPES.map((entityType) => (
            <option key={entityType} value={entityType}>
              {t(ENTITY_TYPE_LABEL_KEYS[entityType])}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "" | "true" | "false")
          }
        >
          <option value="">{t("common.allStatuses")}</option>
          <option value="true">{t("common.active")}</option>
          <option value="false">{t("customFields.optionInactive")}</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">
              {t("customFields.loading")}
            </p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">
              {t("customFields.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t("customFields.colEntity")}</th>
                    <th className="px-6 py-3 font-medium">{t("customFields.colKey")}</th>
                    <th className="px-6 py-3 font-medium">{t("customFields.colLabel")}</th>
                    <th className="px-6 py-3 font-medium">{t("customFields.colType")}</th>
                    <th className="px-6 py-3 font-medium">{t("customFields.colRequired")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.colStatus")}</th>
                    <th className="px-6 py-3 font-medium text-right">{t("common.used")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((definition) => (
                    <tr key={definition.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-900">
                        {t(ENTITY_TYPE_LABEL_KEYS[definition.entityType as CustomFieldEntityType] ??
                          definition.entityType)}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-gray-600">
                        {definition.key}
                      </td>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {definition.label}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {t(CUSTOM_FIELD_TYPE_LABEL_KEYS[
                          definition.fieldType as keyof typeof CUSTOM_FIELD_TYPE_LABEL_KEYS
                        ] ?? definition.fieldType)}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {definition.isRequired ? t("common.yes") : "—"}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge isActive={definition.isActive} />
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-gray-600">
                        {definition.valuesCount}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveId(definition.id)}
                          >
                            {canWrite ? t("common.edit") : t("common.view")}
                          </Button>
                          {canWrite && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={updateDefinition.isPending}
                              onClick={() => void handleToggleActive(definition)}
                            >
                              {definition.isActive
                                ? t("customFields.deactivate")
                                : t("customFields.activate")}
                            </Button>
                          )}
                          {canWrite && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteDefinition.isPending}
                              onClick={() => void handleDelete(definition)}
                            >
                              {t("common.delete")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data && (
        <Pagination
          page={page}
          totalPages={data.pagination.totalPages}
          onPageChange={setPage}
        />
      )}

      {activeId && (
        <CustomFieldFormDialog
          businessId={businessId}
          definitionId={activeId}
          canWrite={canWrite}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>
  );
}

interface CustomFieldFormDialogProps {
  businessId: string;
  definitionId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function CustomFieldFormDialog({
  businessId,
  definitionId,
  canWrite,
  onClose,
}: CustomFieldFormDialogProps) {
  const { t } = useTranslation();
  const isNew = definitionId === "new";
  const { data: existing, isPending: isLoading } = useCustomFieldDefinition(
    businessId,
    isNew ? null : definitionId,
  );

  const createDefinition = useCreateCustomFieldDefinition(businessId);
  const updateDefinition = useUpdateCustomFieldDefinition(businessId);

  const [entityType, setEntityType] = useState<CustomFieldEntityType>("customer");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] =
    useState<CreateCustomFieldDefinitionInput["fieldType"]>("text");
  const [isRequired, setIsRequired] = useState(false);
  const [optionsText, setOptionsText] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Inisialisasi form saat mode edit selesai memuat data definisi.
  useEffect(() => {
    if (!isNew && existing) {
      setEntityType(existing.entityType as CustomFieldEntityType);
      setKey(existing.key);
      setLabel(existing.label);
      setFieldType(existing.fieldType);
      setIsRequired(existing.isRequired);
      setOptionsText((existing.options ?? []).join("\n"));
      setSortOrder(String(existing.sortOrder));
      setIsActive(existing.isActive);
    }
  }, [isNew, existing]);

  // Definisi yang sudah punya values: tipe & key terkunci (guard backend 400).
  const hasValues = (existing?.valuesCount ?? 0) > 0;
  const lockTypeAndKey = !isNew && hasValues;

  const parseOptions = (): string[] | null => {
    if (fieldType !== "select") return null;
    return optionsText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!key.trim()) {
      setFormError(t("customFields.keyRequired"));
      return;
    }
    if (!/^[a-z0-9_]+$/.test(key.trim())) {
      setFormError(t("customFields.keyPattern"));
      return;
    }
    if (!label.trim()) {
      setFormError(t("customFields.labelRequired"));
      return;
    }
    const parsedOptions = parseOptions();
    if (fieldType === "select" && (parsedOptions?.length ?? 0) < 1) {
      setFormError(t("customFields.selectOptionsRequired"));
      return;
    }
    const sort = parseInt(sortOrder, 10);
    if (!Number.isInteger(sort) || sort < 0) {
      setFormError(t("customFields.orderInt"));
      return;
    }

    try {
      if (isNew) {
        await createDefinition.mutateAsync({
          entityType,
          key: key.trim(),
          label: label.trim(),
          fieldType,
          isRequired,
          options: parsedOptions,
          sortOrder: sort,
          isActive,
        });
      } else {
        await updateDefinition.mutateAsync({
          id: definitionId,
          label: label.trim(),
          isRequired,
          options: parsedOptions,
          sortOrder: sort,
          isActive,
          // fieldType hanya dikirim kalau benar-benar berubah (guard values);
          // key & entityType terkunci di UI saat edit.
          ...(fieldType !== existing?.fieldType ? { fieldType } : {}),
        });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createDefinition.isPending || updateDefinition.isPending;
  const isInitialLoading = !isNew && isLoading;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isNew
              ? t("customFields.dialogTitleNew")
              : canWrite
                ? t("customFields.dialogTitleEdit")
                : t("customFields.dialogTitleDetail")}
          </DialogTitle>
          <DialogDescription>
            {t("customFields.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-8 text-center text-sm text-gray-500">
{t("customFields.loadingDetail")}
          </div>
        ) : (
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {formError && (
              <div
                role="alert"
                className="rounded bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {formError}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                {t("customFields.fieldEntity")} *
              </label>
              <select
                className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-100"
                value={entityType}
                disabled={!isNew || !canWrite}
                onChange={(event) =>
                  setEntityType(event.target.value as CustomFieldEntityType)
                }
                required
              >
                {CUSTOM_FIELD_ENTITY_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(ENTITY_TYPE_LABEL_KEYS[value])}
                  </option>
                ))}
              </select>
              {!isNew && <p className="text-xs text-gray-400">{t("customFields.entityNoChange")}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                {t("customFields.fieldKey")} *
              </label>
              <Input
                placeholder={t("customFields.placeholderKey")}
                value={key}
                disabled={!canWrite || lockTypeAndKey}
                onChange={(event) => setKey(event.target.value)}
                required
                className="font-mono"
              />
              {lockTypeAndKey && (
                <p className="text-xs text-amber-600">
                  {t("customFields.lockKey", { count: existing?.valuesCount ?? 0 })}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                {t("customFields.fieldLabel")} *
              </label>
              <Input
                placeholder={t("customFields.placeholderLabel")}
                value={label}
                disabled={!canWrite}
                onChange={(event) => setLabel(event.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                {t("customFields.fieldType")} *
              </label>
              <select
                className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-100"
                value={fieldType}
                disabled={!canWrite || lockTypeAndKey}
                onChange={(event) =>
                  setFieldType(
                    event.target
                      .value as CreateCustomFieldDefinitionInput["fieldType"],
                  )
                }
                required
              >
                {(
                  Object.keys(CUSTOM_FIELD_TYPE_LABEL_KEYS) as Array<
                    keyof typeof CUSTOM_FIELD_TYPE_LABEL_KEYS
                  >
                ).map((value) => (
                  <option key={value} value={value}>
                    {t(CUSTOM_FIELD_TYPE_LABEL_KEYS[value])}
                  </option>
                ))}
              </select>
              {lockTypeAndKey && (
                <p className="text-xs text-amber-600">
                  {t("customFields.lockType", { count: existing?.valuesCount ?? 0 })}
                </p>
              )}
            </div>

            {fieldType === "select" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                  {t("customFields.fieldOptions")} *
                </label>
                <textarea
                  className="min-h-[64px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-100"
                  placeholder={t("customFields.placeholderOptions")}
                  value={optionsText}
                  disabled={!canWrite}
                  onChange={(event) => setOptionsText(event.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={isRequired}
                  disabled={!canWrite}
                  onChange={(event) => setIsRequired(event.target.checked)}
                />
                {t("customFields.fieldRequired")}
              </label>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                {t("customFields.fieldOrder")}
              </label>
              <Input
                type="number"
                min="0"
                step="1"
                value={sortOrder}
                disabled={!canWrite}
                onChange={(event) => setSortOrder(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                {t("common.colStatus")}
              </label>
              <select
                className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-100"
                value={isActive ? "active" : "inactive"}
                disabled={!canWrite}
                onChange={(event) =>
                  setIsActive(event.target.value === "active")
                }
              >
                <option value="active">{t("common.active")}</option>
                <option value="inactive">{t("customFields.optionInactive")}</option>
              </select>
            </div>
            </div>

            <DialogFooter className="shrink-0 border-t pt-3">
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                {t("common.cancel")}
              </Button>
              {canWrite && (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? t("common.submitting")
                    : isNew
                      ? t("customFields.submitNew")
                      : t("customFields.submitEdit")}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
