import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReportFormDialog } from "@/components/report-form-dialog";
import { useBusinesses } from "@/hooks/use-businesses";
import {
  REPORT_TYPE_LABELS,
  REPORT_TYPE_VALUES,
  type ReportType,
  useReportResult,
} from "@/hooks/use-reports";
import { useFormatAmount } from "@/lib/format";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/reports/$type/$id")({
  beforeLoad: ({ params }) => {
    if (!REPORT_TYPE_VALUES.includes(params.type as ReportType)) {
      throw new Error("Jenis laporan tidak dikenal");
    }
  },
  component: ReportResultPage,
});

function ReportResultPage() {
  const { businessId, type, id } = Route.useParams();
  const reportType = type as ReportType;
  const { formatAmount } = useFormatAmount();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";
  const { data, isPending, isError, error } = useReportResult(businessId, id);
  const [editOpen, setEditOpen] = useState(false);

  const print = () => window.print();

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            {REPORT_TYPE_LABELS[reportType]}
          </h1>
          {data && <p className="text-sm text-gray-500">{data.headerDate}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={print}>
            Print
          </Button>
          {canWrite && data && (
            <Button onClick={() => setEditOpen(true)}>Edit</Button>
          )}
        </div>
      </div>

      {isPending ? (
        <p className="p-6 text-sm text-gray-500">Menghitung laporan...</p>
      ) : isError ? (
        <p role="alert" className="p-6 text-sm text-red-700">
          {getApiErrorMessage(error)}
        </p>
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

      {data?.footer && <p className="text-sm text-gray-500">{data.footer}</p>}

      <Link
        to="/businesses/$businessId/reports/$type"
        params={{ businessId, type: reportType }}
        className="text-sm text-blue-700 hover:underline"
      >
        ← Kembali ke daftar laporan
      </Link>

      {editOpen && data && (
        <ReportFormDialog
          businessId={businessId}
          type={reportType}
          definition={{
            id,
            businessId,
            type: reportType,
            title: data.title,
            description: null,
            dateFrom: data.type === "balance_sheet" ? null : data.headerDate.split(" — ")[0] ?? null,
            dateTo: data.type === "balance_sheet" ? null : data.headerDate.split(" — ")[1] ?? null,
            asOfDate: data.type === "balance_sheet" ? data.headerDate.replace("As at ", "") : null,
            accountingMethod: "accrual",
            showAccountCodes: data.rows.some((r) => r.code !== null),
            excludeZeroBalances: false,
            footer: data.footer,
            createdAt: "",
            updatedAt: "",
          }}
          canWrite={canWrite}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
