import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ReportStage1bTable } from "@/components/report-stage1b-table";
import { StatementDetailTable, StatementParamsDialog, todayIso, STATEMENT_EPOCH } from "@/components/statement-views";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReportFormDialog } from "@/components/report-form-dialog";
import { useBusinesses } from "@/hooks/use-businesses";
import {
  REPORT_TYPE_LABELS,
  REPORT_TYPE_VALUES,
  type ReportType,
  type StatementParams,
  type StatementType,
  useReportResult,
  useReportDefinition,
  useStatementDetail,
  isParameterOnlyReport,
  isAgedReport,
  isStatementReport,
  isUnpaidStatement,
} from "@/hooks/use-reports";
import { useFormatAmount } from "@/lib/format";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/reports/$type/$id")({
  validateSearch: z.object({
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
  component: ReportResultPage,
});

function ReportResultPage() {
  const { type } = Route.useParams();
  return isStatementReport(type) ? (
    <StatementDetailPage type={type} />
  ) : (
    <DefinitionResultPage />
  );
}

/** Detail statement satu kontak (§12.3) — parameter-only, tanpa definisi. */
function StatementDetailPage({ type }: { type: StatementType }) {
  const { t } = useTranslation();
  const { businessId, id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const unpaid = isUnpaidStatement(type);
  const [dialogOpen, setDialogOpen] = useState(false);

  const params: StatementParams = unpaid
    ? { asOfDate: search.asOf ?? todayIso() }
    : { dateFrom: search.from ?? STATEMENT_EPOCH, dateTo: search.to ?? todayIso() };

  const { data, isPending, isError, error } = useStatementDetail(businessId, type, id, params);

  const applyParams = (next: StatementParams) => {
    setDialogOpen(false);
    void navigate({
      search: unpaid
        ? { asOf: next.asOfDate }
        : { from: next.dateFrom, to: next.dateTo },
    });
  };

  return (
    <div className="report-print-area flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t(`reports.${type}`)}</h1>
          <p className="text-sm font-medium text-gray-700">
            {data?.contact.name ?? ""}
          </p>
          {data?.contact.billingAddress && (
            <p className="whitespace-pre-line text-sm text-gray-500">
              {data.contact.billingAddress}
            </p>
          )}
          <p className="text-sm text-gray-500">
            {unpaid
              ? t("reports.asAt", { date: params.asOfDate })
              : data?.headerDate ?? `${params.dateFrom} — ${params.dateTo}`}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            {t("reports.print")}
          </Button>
          <Button onClick={() => setDialogOpen(true)}>{t("common.edit")}</Button>
        </div>
      </div>

      {isPending ? (
        <p className="p-6 text-sm text-gray-500">{t("reports.calculating")}</p>
      ) : isError ? (
        <p role="alert" className="p-6 text-sm text-red-700">{getApiErrorMessage(error)}</p>
      ) : (
        data && <StatementDetailTable result={data} />
      )}

      <Link
        to="/businesses/$businessId/reports/$type"
        params={{ businessId, type }}
        search={unpaid ? { asOf: params.asOfDate } : { from: params.dateFrom, to: params.dateTo }}
        className="text-sm text-blue-700 hover:underline print:hidden"
      >
        {t("reports.back")}
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

function DefinitionResultPage() {
  const { t } = useTranslation();
  const { businessId, type, id } = Route.useParams();
  const reportType = type as ReportType;
  const { formatAmount } = useFormatAmount();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";
  const { data, isPending, isError, error } = useReportResult(businessId, id);
  const definition = useReportDefinition(businessId, id);
  const [editOpen, setEditOpen] = useState(false);

  const print = () => window.print();

  return (
    <div className="report-print-area flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            {isParameterOnlyReport(reportType) ? t(`reports.${reportType}`) : REPORT_TYPE_LABELS[reportType]}
          </h1>
          {data && <p className="text-sm text-gray-500">{isAgedReport(reportType) ? t("reports.asAt", { date: data.headerDate.replace("As at ", "") }) : data.headerDate}</p>}
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={print}>
            {t("reports.print")}
          </Button>
          {canWrite && data && definition.data && (
            <Button onClick={() => setEditOpen(true)}>{t("common.edit")}</Button>
          )}
        </div>
      </div>

      {isPending ? (
        <p className="p-6 text-sm text-gray-500">{t("reports.calculating")}</p>
      ) : isError ? (
        <p role="alert" className="p-6 text-sm text-red-700">
          {getApiErrorMessage(error)}
        </p>
      ) : data && isParameterOnlyReport(reportType) ? (
        <ReportStage1bTable result={data} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  {data.rows.some((r) => r.debit !== null || r.credit !== null) ? (
                    <>
                      <th className="px-6 py-3 font-medium">Account</th>
                      <th className="px-6 py-3 text-right font-medium">Debit</th>
                      <th className="px-6 py-3 text-right font-medium">Credit</th>
                    </>
                  ) : (
                    <th className="px-6 py-3 font-medium">Account</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.map((row, index) => {
                  const isHeader =
                    row.accountId === null &&
                    row.amount === null &&
                    row.debit === null &&
                    row.credit === null &&
                    row.name !== "Net profit (loss)" &&
                    row.name !== "Net Profit";
                  const isTotal = row.name.startsWith("Total ") || row.name === "Total Equity" || row.name.includes("Net assets") || row.name === "Retained earnings";
                  return (
                    <tr
                      key={`${row.accountId ?? "row"}-${index}`}
                      className={
                        isHeader
                          ? "bg-gray-50 font-semibold"
                          : isTotal
                            ? "font-semibold"
                            : ""
                      }
                    >
                      <td className={`px-6 py-2 ${isHeader ? "uppercase text-xs" : ""} ${isTotal ? "border-t" : ""} ${row.name.startsWith("Total ") ? "bg-gray-50" : ""}`}>
                        {row.code ? `${row.code} - ` : ""}
                        {row.name}
                      </td>
                      {row.debit !== null || row.credit !== null ? (
                        <>
                          <td className="px-6 py-2 text-right tabular-nums">
                            {row.debit === null ? "" : formatAmount(row.debit)}
                          </td>
                          <td className="px-6 py-2 text-right tabular-nums">
                            {row.credit === null ? "" : formatAmount(row.credit)}
                          </td>
                        </>
                      ) : (
                        <td className={`px-6 py-2 text-right tabular-nums ${isTotal || row.name === "Net profit (loss)" || row.name === "Net Profit" ? "font-semibold" : ""}`} colSpan={2}>
                          {row.amount === null ? "" : formatAmount(row.amount)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {data?.footer && <p className="text-sm text-gray-500">{reportType === "sales_invoice_totals_by_item" ? t("reports.itemsUnavailableHint") : data.footer}</p>}
      {isAgedReport(reportType) && <p className="text-sm text-gray-500">{t(reportType === "aged_payables" ? "reports.historicalPayablesHint" : "reports.historicalHint")}</p>}
      {definition.isError && <p role="alert" className="text-sm text-red-700">{getApiErrorMessage(definition.error)}</p>}

      <Link
        to="/businesses/$businessId/reports/$type"
        params={{ businessId, type: reportType }}
        className="text-sm text-blue-700 hover:underline print:hidden"
      >
        {t("reports.back")}
      </Link>

      {editOpen && definition.data && (
        <ReportFormDialog
          businessId={businessId}
          type={reportType}
          definition={definition.data}
          canWrite={canWrite}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
