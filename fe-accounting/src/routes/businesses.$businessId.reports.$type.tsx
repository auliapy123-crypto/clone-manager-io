import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { ReportFormDialog } from "@/components/report-form-dialog";
import {
  STATEMENT_EPOCH,
  StatementListTable,
  StatementParamsDialog,
  todayIso,
} from "@/components/statement-views";
import { useBusinesses } from "@/hooks/use-businesses";
import {
  REPORT_TYPE_LABELS,
  REPORT_TYPE_VALUES,
  type ReportType,
  type StatementParams,
  type StatementType,
  useDeleteReportDefinition,
  useReportDefinitions,
  useStatementList,
  isParameterOnlyReport,
  isAgedReport,
  isStatementReport,
  isUnpaidStatement,
  type ReportDefinition,
} from "@/hooks/use-reports";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/reports/$type")({
  validateSearch: z.object({
    page: z.number().optional(),
    q: z.string().optional(),
    // Parameter statement (§12.2) — TIDAK disimpan sebagai definisi.
    asOf: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
  beforeLoad: ({ params }) => {
    if (
      !REPORT_TYPE_VALUES.includes(params.type as ReportType) &&
      !isStatementReport(params.type)
    ) {
      throw new Error("Jenis laporan tidak dikenal");
    }
  },
  component: ReportTypePage,
});

function ReportTypePage() {
  const isList = useRouterState({ select: state => state.matches.at(-1)?.routeId === Route.id });
  const { type } = Route.useParams();
  if (!isList) return <Outlet />;
  return isStatementReport(type) ? <StatementListPage type={type} /> : <ReportTypeListPage />;
}

/** Daftar kontak statement: parameter-only, tanpa definisi tersimpan. */
function StatementListPage({ type }: { type: StatementType }) {
  const { t } = useTranslation();
  const { businessId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const unpaid = isUnpaidStatement(type);
  const [dialogOpen, setDialogOpen] = useState(false);

  const page = search.page ?? 1;
  const q = search.q ?? "";
  const params: StatementParams = unpaid
    ? { asOfDate: search.asOf ?? todayIso() }
    : { dateFrom: search.from ?? STATEMENT_EPOCH, dateTo: search.to ?? todayIso() };

  const [searchText, setSearchText] = useState(q);
  const { data, isPending, isError, error } = useStatementList(businessId, type, {
    ...params,
    page,
    pageSize: 20,
    q: q || undefined,
  });

  useEffect(() => {
    if (searchText === q) return;
    const timeout = setTimeout(
      () => void navigate({ search: { ...search, page: 1, q: searchText.trim() } }),
      300,
    );
    return () => clearTimeout(timeout);
  }, [searchText, q, navigate, search]);

  const applyParams = (next: StatementParams) => {
    setDialogOpen(false);
    void navigate({
      search: unpaid
        ? { ...search, page: 1, asOf: next.asOfDate }
        : { ...search, page: 1, from: next.dateFrom, to: next.dateTo },
    });
  };

  const view = (contactId: string) => {
    void navigate({
      to: "/businesses/$businessId/reports/$type/$id",
      params: { businessId, type, id: contactId },
      search: unpaid
        ? { asOf: params.asOfDate }
        : { from: params.dateFrom, to: params.dateTo },
    });
  };

  return (
    <div className="report-print-area flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t(`reports.${type}`)}</h1>
          <p className="text-sm text-gray-500">
            {unpaid
              ? t("reports.asAt", { date: data?.headerDate ?? params.asOfDate })
              : data?.headerDate ?? `${params.dateFrom} — ${params.dateTo}`}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            {t("reports.print")}
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            {unpaid ? t("reports.setDate") : t("reports.setPeriod")}
          </Button>
        </div>
      </div>

      <Input
        className="max-w-xs print:hidden"
        placeholder={t("common.search")}
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
      />

      {isPending ? (
        <p className="p-6 text-sm text-gray-500">{t("reports.calculating")}</p>
      ) : isError ? (
        <p role="alert" className="p-6 text-sm text-red-700">{getApiErrorMessage(error)}</p>
      ) : (
        data && <StatementListTable result={data} type={type} params={params} onView={view} />
      )}

      {data && (
        <Pagination
          page={page}
          totalPages={data.pagination.totalPages}
          onPageChange={(p) => void navigate({ search: { ...search, page: p } })}
        />
      )}

      <Link
        to="/businesses/$businessId/reports"
        params={{ businessId }}
        className="text-sm text-blue-700 hover:underline print:hidden"
      >
        {t("reports.backToIndex")}
      </Link>

      {dialogOpen && (
        <StatementParamsDialog
          type={type}
          initial={params}
          onSubmit={applyParams}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}

function ReportTypeListPage() {
  const { t } = useTranslation();
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
  const [editing, setEditing] = useState<ReportDefinition | null>(null);
  useEffect(() => {
    if (search === q) return;
    const timeout = setTimeout(() => void navigate({ search: { page: 1, q: search.trim() } }), 300);
    return () => clearTimeout(timeout);
  }, [search, q, navigate]);

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(t("common.deleteConfirmItem", { item: title }))) return;
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
            {isParameterOnlyReport(reportType) ? t(`reports.${reportType}`) : REPORT_TYPE_LABELS[reportType]}
          </h1>
          {data && <p className="text-sm text-gray-500">{t("reports.definitionCount", { count: data.pagination.total })}</p>}
        </div>
        {canWrite && <Button onClick={() => { setEditing(null); setFormOpen(true); }}>{t("reports.newReport")}</Button>}
      </div>

      {deleteError && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      <Input
        className="max-w-xs"
        placeholder={t("common.search")}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">{t("common.loading")}</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">{t("reports.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t(reportType === "sales_invoice_totals_by_custom_field" ? "common.colName" : "reports.title")}</th>
                    <th className="px-6 py-3 font-medium">{t("reports.period")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.colActions")}</th>
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
                        {definition.type === "balance_sheet" || isAgedReport(definition.type)
                          ? t("reports.asAt", { date: definition.asOfDate })
                          : `${definition.dateFrom} — ${definition.dateTo}`}
                      </td>
                      <td className="px-6 py-3">
                        {canWrite && (
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => { setEditing(definition); setFormOpen(true); }}>
                              {t("common.edit")}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteDefinition.isPending}
                              onClick={() => void handleDelete(definition.id, definition.title)}
                            >
                              {t("common.delete")}
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
          definition={editing}
          canWrite={canWrite}
          onClose={() => setFormOpen(false)}
        />
      )}

    </div>
  );
}
