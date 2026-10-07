import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { ReportFormDialog } from "@/components/report-form-dialog";
import { useBusinesses } from "@/hooks/use-businesses";
import {
  REPORT_TYPE_LABELS,
  REPORT_TYPE_VALUES,
  type ReportType,
  useDeleteReportDefinition,
  useReportDefinitions,
} from "@/hooks/use-reports";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/reports/$type")({
  validateSearch: z.object({
    page: z.number().optional(),
    q: z.string().optional(),
  }),
  beforeLoad: ({ params }) => {
    if (!REPORT_TYPE_VALUES.includes(params.type as ReportType)) {
      throw new Error("Jenis laporan tidak dikenal");
    }
  },
  component: ReportTypeListPage,
});

function ReportTypeListPage() {
  const { businessId, type } = Route.useParams();
  const reportType = type as ReportType;
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";
  const page = Route.useSearch({ select: (s) => s.page ?? 1 });
  const q = Route.useSearch({ select: (s) => s.q ?? "" });
  const navigate = Route.useNavigate();

  const [search, setSearch] = useState(q);
  const { data, isPending, isError, error } = useReportDefinitions(
    businessId,
    reportType,
    page,
    q || undefined,
  );
  const deleteDefinition = useDeleteReportDefinition(businessId, reportType);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Hapus definisi laporan "${title}"?`)) return;
    setDeleteError(null);
    try {
      await deleteDefinition.mutateAsync(id);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            {REPORT_TYPE_LABELS[reportType]}
          </h1>
          {data && <p className="text-sm text-gray-500">{data.pagination.total} definisi</p>}
        </div>
        {canWrite && <Button onClick={() => setFormOpen(true)}>New Report</Button>}
      </div>

      {deleteError && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      <Input
        className="max-w-xs"
        placeholder="Cari title..."
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          const timeout = setTimeout(() => {
            void navigate({ search: { page: 1, q: event.target.value.trim() } });
          }, 300);
          void timeout;
        }}
      />

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat definisi...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada laporan tersimpan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Title</th>
                    <th className="px-6 py-3 font-medium">Periode</th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((definition) => (
                    <tr key={definition.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">
                        <Link
                          to="/businesses/$businessId/reports/$type/$id"
                          params={{ businessId, type: reportType, id: definition.id }}
                          className="text-blue-700 hover:underline"
                        >
                          {definition.title}
                        </Link>
                        {definition.description && (
                          <p className="text-xs text-gray-500">{definition.description}</p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {definition.type === "balance_sheet"
                          ? `As at ${definition.asOfDate}`
                          : `${definition.dateFrom} — ${definition.dateTo}`}
                      </td>
                      <td className="px-6 py-3">
                        {canWrite && (
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteDefinition.isPending}
                              onClick={() => void handleDelete(definition.id, definition.title)}
                            >
                              Hapus
                            </Button>
                          </div>
                        )}
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
        <Pagination page={page} totalPages={data.pagination.totalPages} onPageChange={(p) => void navigate({ search: { page: p, q } })} />
      )}

      {formOpen && (
        <ReportFormDialog
          businessId={businessId}
          type={reportType}
          definition={null}
          canWrite={canWrite}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
