import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  type Division,
  type DivisionStatus,
  useCreateDivision,
  useDeleteDivision,
  useDivision,
  useDivisions,
  useUpdateDivision,
} from "@/hooks/use-divisions";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/divisions")({
  component: DivisionsPage,
});

function StatusBadge({ status }: { status: DivisionStatus }) {
  const style =
    status === "active"
      ? "bg-green-100 text-green-800 border border-green-200"
      : "bg-gray-100 text-gray-600 border border-gray-200";
  const { t } = useTranslation();
  const label = status === "active" ? t("divisions.statusActive") : t("divisions.statusInactive");
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}

function DivisionsPage() {
  const { t } = useTranslation();
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | DivisionStatus>("");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const { data, isPending, isError, error } = useDivisions(
    businessId,
    page,
    {
      q: q || undefined,
      status: (statusFilter || undefined) as DivisionStatus | undefined,
    },
    10,
  );

  const deleteDivision = useDeleteDivision(businessId);

  const handleDelete = async (division: Division) => {
    const name = division.code ? `${division.code} - ${division.name}` : division.name;
    if (!window.confirm(t("divisions.deleteConfirm", { name }))) {
      return;
    }
    setDeleteError(null);
    try {
      await deleteDivision.mutateAsync(division.id);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t("divisions.title")}</h1>
          {data && (
            <p className="text-sm text-gray-500">
              {t("divisions.subtitle", { count: data.pagination.total })}
            </p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveId("new")}>{t("divisions.newButton")}</Button>
        )}
      </div>

      {deleteError && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder={t("divisions.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | DivisionStatus)}
        >
          <option value="">{t("common.allStatuses")}</option>
          <option value="active">{t("divisions.statusActive")}</option>
          <option value="inactive">{t("divisions.statusInactive")}</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">{t("divisions.loading")}</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">{t("divisions.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t("divisions.colCode")}</th>
                    <th className="px-6 py-3 font-medium">{t("divisions.colName")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.colStatus")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((division) => (
                    <tr key={division.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-mono text-xs text-gray-600">
                        {division.code || "-"}
                      </td>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {division.name}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={division.status} />
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveId(division.id)}
                          >
                            {canWrite ? t("common.edit") : t("common.view")}
                          </Button>
                          {canWrite && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteDivision.isPending}
                              onClick={() => void handleDelete(division)}
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
        <DivisionFormDialog
          businessId={businessId}
          divisionId={activeId}
          canWrite={canWrite}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>
  );
}

interface DivisionFormDialogProps {
  businessId: string;
  divisionId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function DivisionFormDialog({
  businessId,
  divisionId,
  canWrite,
  onClose,
}: DivisionFormDialogProps) {
  const { t } = useTranslation();
  const isNew = divisionId === "new";
  const { data: existing, isPending: isLoading } = useDivision(
    businessId,
    isNew ? null : divisionId,
  );

  const createDivision = useCreateDivision(businessId);
  const updateDivision = useUpdateDivision(businessId);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<DivisionStatus>("active");
  const [formError, setFormError] = useState<string | null>(null);

  // Inisialisasi form saat mode edit selesai memuat data divisi.
  useEffect(() => {
    if (!isNew && existing) {
      setName(existing.name);
      setCode(existing.code ?? "");
      setStatus(existing.status);
    }
  }, [isNew, existing]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError(t("divisions.validationName"));
      return;
    }

    try {
      if (isNew) {
        await createDivision.mutateAsync({
          name: name.trim(),
          code: code.trim() || null,
          status,
        });
      } else {
        await updateDivision.mutateAsync({
          id: divisionId,
          name: name.trim(),
          code: code.trim() || null,
          status,
        });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createDivision.isPending || updateDivision.isPending;
  const isInitialLoading = !isNew && isLoading;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isNew ? t("divisions.dialogTitleNew") : canWrite ? t("divisions.dialogTitleEdit") : t("divisions.dialogTitleDetail")}
          </DialogTitle>
          <DialogDescription>
            {t("divisions.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-8 text-center text-sm text-gray-500">
            {t("divisions.loadingDetail")}
          </div>
        ) : (
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="flex flex-col gap-4"
          >
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
                {t("divisions.fieldName")} *
              </label>
              <Input
                placeholder={t("divisions.placeholderName")}
                value={name}
                disabled={!canWrite}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                {t("divisions.fieldCode")}
              </label>
              <Input
                placeholder={t("divisions.placeholderCode")}
                value={code}
                disabled={!canWrite}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                {t("common.colStatus")}
              </label>
              <select
                className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-100"
                value={status}
                disabled={!canWrite}
                onChange={(event) =>
                  setStatus(event.target.value as DivisionStatus)
                }
              >
                <option value="active">{t("divisions.statusActive")}</option>
                <option value="inactive">{t("divisions.statusInactive")}</option>
              </select>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                {t("common.cancel")}
              </Button>
              {canWrite && (
                <Button type="submit" disabled={isSubmitting}>
                  {isNew
                    ? isSubmitting
                      ? t("common.submitting")
                      : t("divisions.submitNew")
                    : isSubmitting
                      ? t("common.submitting")
                      : t("divisions.submitEdit")}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
