import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { useCustomers } from "@/hooks/use-customers";
import {
  type CreateProjectInput,
  type Project,
  type ProjectStatus,
  type UpdateProjectInput,
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from "@/hooks/use-projects";
import { getApiErrorMessage } from "@/lib/errors";
import { useFormatAmount } from "@/lib/format";

export const Route = createFileRoute("/businesses/$businessId/projects")({
  component: ProjectsPage,
});

function StatusBadge({ status }: { status: ProjectStatus }) {
  const { t } = useTranslation();
  if (status === "active") {
    return (
      <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
        {t("projects.statusActive")}
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
        {t("projects.statusCompleted")}
      </span>
    );
  }
  return (
    <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
      {t("projects.statusInactive")}
    </span>
  );
}

function ProjectsPage() {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((business) => business.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useProjects(businessId, page, {
    q: q || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  }, 10);

  const totals = useMemo(() => {
    if (!data?.data) return { income: 0, expenses: 0, netProfit: 0 };
    return data.data.reduce(
      (acc, p) => ({
        income: acc.income + p.totalIncome,
        expenses: acc.expenses + p.totalExpenses,
        netProfit: acc.netProfit + p.netProfit,
      }),
      { income: 0, expenses: 0, netProfit: 0 },
    );
  }, [data]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t("projects.title")}</h1>
          {data && (
            <p className="text-sm text-gray-500">{t("projects.subtitle", { count: data.pagination.total })}</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setAddOpen(true)}>{t("projects.newButton")}</Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder={t("projects.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as ProjectStatus | "all");
            setPage(1);
          }}
        >
          <option value="all">{t("projects.filterAllStatuses")}</option>
          <option value="active">{t("projects.statusActive")}</option>
          <option value="completed">{t("projects.statusCompleted")}</option>
          <option value="inactive">{t("projects.statusInactive")}</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">{t("projects.loading")}</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">{t("projects.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t("projects.colCode")}</th>
                    <th className="px-6 py-3 font-medium">{t("projects.colName")}</th>
                    <th className="px-6 py-3 font-medium">{t("projects.colCustomer")}</th>
                    <th className="px-6 py-3 text-right font-medium">{t("projects.colIncome")}</th>
                    <th className="px-6 py-3 text-right font-medium">{t("projects.colExpenses")}</th>
                    <th className="px-6 py-3 text-right font-medium">{t("projects.colNetProfit")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.colStatus")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((project) => (
                    <ProjectRow
                      key={project.id}
                      businessId={businessId}
                      project={project}
                      canWrite={canWrite}
                    />
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={3} className="px-6 py-3 font-medium text-gray-900">
                      {t("common.total")}
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-gray-900">
                      {formatAmount(totals.income)}
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-gray-900">
                      {formatAmount(totals.expenses)}
                    </td>
                    <td
                      className={`px-6 py-3 text-right font-medium ${
                        totals.netProfit > 0
                          ? "text-green-600"
                          : totals.netProfit < 0
                            ? "text-red-600"
                            : "text-gray-900"
                      }`}
                    >
                      {formatAmount(totals.netProfit)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
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

      {canWrite && (
        <ProjectFormDialog
          mode="create"
          open={addOpen}
          onOpenChange={setAddOpen}
          businessId={businessId}
        />
      )}
    </div>
  );
}

function ProjectRow({
  businessId,
  project,
  canWrite,
}: {
  businessId: string;
  project: Project;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const deleteProject = useDeleteProject(businessId);
  const [editOpen, setEditOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!window.confirm(t("common.deleteConfirmItem", { item: project.name }))) return;
    setRowError(null);
    try {
      await deleteProject.mutateAsync(project.id);
    } catch (error) {
      setRowError(getApiErrorMessage(error));
    }
  };

  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-6 py-3 text-gray-600">{project.code ?? "-"}</td>
        <td className="px-6 py-3 font-medium text-gray-900">{project.name}</td>
        <td className="px-6 py-3 text-gray-600">
          {project.customerName ?? "-"}
        </td>
        <td className="px-6 py-3 text-right text-gray-900">
          {formatAmount(project.totalIncome)}
        </td>
        <td className="px-6 py-3 text-right text-gray-900">
          {formatAmount(project.totalExpenses)}
        </td>
        <td
          className={`px-6 py-3 text-right ${
            project.netProfit > 0
              ? "text-green-600 font-medium"
              : project.netProfit < 0
                ? "text-red-600 font-medium"
                : "text-gray-900"
          }`}
        >
          {formatAmount(project.netProfit)}
        </td>
        <td className="px-6 py-3">
          <StatusBadge status={project.status} />
        </td>
        <td className="px-6 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSummaryOpen(true)}
            >
              {t("projects.summaryButton")}
            </Button>
            {canWrite && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditOpen(true)}
                >
                  {t("common.edit")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteProject.isPending}
                  onClick={() => void handleDelete()}
                >
                  {t("common.delete")}
                </Button>
              </>
            )}
          </div>
          {rowError && <p className="mt-1 text-xs text-red-600">{rowError}</p>}
        </td>
      </tr>
      <ProjectSummaryDialog
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        project={project}
      />
      {canWrite && (
        <ProjectFormDialog
          mode="edit"
          open={editOpen}
          onOpenChange={setEditOpen}
          businessId={businessId}
          project={project}
        />
      )}
    </>
  );
}

function ProjectSummaryDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{t("projects.summaryTitle", { name: project.name })}</DialogTitle>
          <DialogDescription>
            {project.code ? t("projects.summaryDescriptionWithCode", { code: project.code }) : t("projects.summaryDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-3">
            <span className="text-sm text-gray-600">{t("projects.colIncome")}</span>
            <span className="text-sm font-semibold text-gray-900">
              {formatAmount(project.totalIncome)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-3">
            <span className="text-sm text-gray-600">{t("projects.colExpenses")}</span>
            <span className="text-sm font-semibold text-gray-900">
              {formatAmount(project.totalExpenses)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-3">
            <span className="text-sm text-gray-600">{t("projects.colNetProfit")}</span>
            <span
              className={`text-sm font-semibold ${
                project.netProfit > 0
                  ? "text-green-600"
                  : project.netProfit < 0
                    ? "text-red-600"
                    : "text-gray-900"
              }`}
            >
              {formatAmount(project.netProfit)}
            </span>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectFormDialog({
  mode,
  open,
  onOpenChange,
  businessId,
  project,
}: {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  project?: Project;
}) {
  const { t } = useTranslation();
  const createProject = useCreateProject(businessId);
  const updateProject = useUpdateProject(businessId);
  const { data: customersData } = useCustomers(businessId, 1, {}, 100);

  const [name, setName] = useState(project?.name ?? "");
  const [code, setCode] = useState(project?.code ?? "");
  const [customerId, setCustomerId] = useState(project?.customerId ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(project?.name ?? "");
      setCode(project?.code ?? "");
      setCustomerId(project?.customerId ?? "");
      setStatus(project?.status ?? "active");
      setFormError(null);
    }
  }, [open, project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError(t("projects.validationNameRequired"));
      return;
    }

    try {
      if (mode === "create") {
        const payload: CreateProjectInput = {
          name: trimmedName,
          code: code.trim() || undefined,
          customerId: customerId || undefined,
          status,
        };
        await createProject.mutateAsync(payload);
      } else if (project) {
        const payload: UpdateProjectInput = {
          id: project.id,
          name: trimmedName,
          code: code.trim() || null,
          customerId: customerId || null,
          status,
        };
        await updateProject.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createProject.isPending || updateProject.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("projects.newButton") : t("projects.dialogTitleEdit")}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? t("projects.dialogDescriptionNew")
              : t("projects.dialogDescriptionEdit")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError && (
            <div
              role="alert"
              className="rounded bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {formError}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              {t("projects.fieldName")} *
            </label>
            <Input
              placeholder={t("projects.placeholderName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              {t("projects.fieldCode")}
            </label>
            <Input
              placeholder={t("projects.placeholderCode")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              {t("projects.fieldCustomer")}
            </label>
            <select
              className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">{t("projects.noCustomer")}</option>
              {customersData?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.code ? `(${c.code})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{t("projects.fieldStatus")}</label>
            <select
              className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            >
              <option value="active">{t("projects.statusActive")}</option>
              <option value="completed">{t("projects.statusCompleted")}</option>
              <option value="inactive">{t("projects.statusInactive")}</option>
            </select>
          </div>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? t("common.submitting")
                : mode === "create"
                  ? t("projects.submitNew")
                  : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
