import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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

export const Route = createFileRoute("/businesses/$businessId/projects")({
  component: ProjectsPage,
});

function formatAmount(value: number) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  if (status === "active") {
    return (
      <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
        Active
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
        Completed
      </span>
    );
  }
  return (
    <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
      Inactive
    </span>
  );
}

function ProjectsPage() {
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
  });

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
          <h1 className="text-lg font-semibold text-gray-900">Projects</h1>
          {data && (
            <p className="text-sm text-gray-500">{data.pagination.total} proyek</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setAddOpen(true)}>Proyek Baru</Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Cari nama atau kode proyek..."
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
          <option value="all">Semua Status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat proyek...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada proyek.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Code</th>
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium">Customer</th>
                    <th className="px-6 py-3 text-right font-medium">Income</th>
                    <th className="px-6 py-3 text-right font-medium">Expenses</th>
                    <th className="px-6 py-3 text-right font-medium">Net Profit</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    {canWrite && <th className="px-6 py-3 font-medium">Aksi</th>}
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
                      Total
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
                    <td colSpan={canWrite ? 2 : 1} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Sebelumnya
          </Button>
          <span className="text-sm text-gray-500">
            Halaman {data.pagination.currentPage} dari {data.pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Berikutnya
          </Button>
        </div>
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
  const deleteProject = useDeleteProject(businessId);
  const [editOpen, setEditOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!window.confirm(`Hapus proyek "${project.name}"?`)) return;
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
        {canWrite && (
          <td className="px-6 py-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteProject.isPending}
                onClick={() => void handleDelete()}
              >
                Hapus
              </Button>
            </div>
            {rowError && <p className="mt-1 text-xs text-red-600">{rowError}</p>}
          </td>
        )}
      </tr>
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
      setFormError("Nama proyek wajib diisi.");
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
            {mode === "create" ? "Proyek Baru" : "Edit Proyek"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Tambahkan proyek baru untuk pelacakan transaksi keuangan."
              : "Perbarui informasi proyek ini."}
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
              Nama Proyek *
            </label>
            <Input
              placeholder="Contoh: Pengembangan Website"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Kode Proyek (opsional)
            </label>
            <Input
              placeholder="Contoh: PRJ-001"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Pelanggan (opsional)
            </label>
            <select
              className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">-- Tanpa Pelanggan --</option>
              {customersData?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.code ? `(${c.code})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Status</label>
            <select
              className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Menyimpan..."
                : mode === "create"
                  ? "Tambah Proyek"
                  : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
