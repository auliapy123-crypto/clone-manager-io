import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { isContactSummary, type ReportResult } from "@/hooks/use-reports";
import { useFormatAmount } from "@/lib/format";

export function ReportStage1bTable({ result }: { result: ReportResult }) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const signed = (n: number) => `${formatAmount(Math.abs(n))} ${n < 0 ? "Cr" : "Dr"}`;
  const name = (row: ReportResult["rows"][number]) => row.kind === "profit" ? t("reports.profit") : row.name;
  const th = "px-4 py-3 text-right font-medium";
  const td = "px-4 py-2 text-right tabular-nums whitespace-nowrap";
  if (result.type === "sales_invoice_totals_by_customer") {
    return <div className="overflow-x-auto rounded-lg border print:overflow-visible">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
          <tr>
            <th className="px-4 py-3">{t("common.customer")}</th>
            <th className={th}>{t("common.total")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {result.rows.map((row, i) => (
            <tr key={`${row.customerId ?? row.kind}-${i}`} className={row.kind === "total" ? "bg-gray-50 font-semibold border-t" : ""}>
              <td className="px-4 py-2">{row.kind === "total" ? t("common.total") : row.name}</td>
              <td className={td}>{formatAmount(row.amount ?? 0)}</td>
            </tr>
          ))}
          {result.rows.length === 0 && <tr><td colSpan={2} className="p-4 text-gray-500">{t("reports.noTransactions")}</td></tr>}
        </tbody>
      </table>
    </div>;
  }

  if (result.type === "billable_time_summary") {
    return <div className="overflow-x-auto rounded-lg border print:overflow-visible">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
          <tr>
            <th className="px-4 py-3">{t("common.customer")}</th>
            <th className={th}>{t("reports.opening")}</th>
            <th className={th}>{t("reports.newBillableTime")}</th>
            <th className={th}>{t("reports.invoiced")}</th>
            <th className={th}>{t("reports.writtenOff")}</th>
            <th className={th}>{t("reports.closing")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {result.rows.map((row, i) => (
            <tr key={`${row.customerId ?? row.kind}-${i}`} className={row.kind === "total" ? "bg-gray-50 font-semibold border-t" : ""}>
              <td className="px-4 py-2">{row.kind === "total" ? t("common.total") : row.name}</td>
              <td className={td}>{formatAmount(row.opening ?? 0)}</td>
              <td className={td}>{formatAmount(row.movement ?? 0)}</td>
              <td className={td}>{formatAmount(row.invoices ?? 0)}</td>
              <td className={td}>{formatAmount(0)}</td>
              <td className={td}>{formatAmount(row.closing ?? 0)}</td>
            </tr>
          ))}
          {result.rows.length === 0 && <tr><td colSpan={6} className="p-4 text-gray-500">{t("reports.noTransactions")}</td></tr>}
        </tbody>
      </table>
    </div>;
  }

  if (result.type === "receipts_payments_summary") {
    return <div className="overflow-x-auto rounded-lg border print:overflow-visible">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
          <tr>
            <th className="px-4 py-3">{t("reports.account")}</th>
            <th className={th}>{t("common.total")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {result.rows.map((row, i) => {
            const isSection = row.kind === "section";
            const isTotal = row.kind === "total";
            const isSummary = row.kind === "summary";
            return (
              <tr
                key={`${row.accountId ?? row.kind}-${i}`}
                className={isSection ? "bg-gray-100 font-semibold" : isTotal || isSummary ? "bg-gray-50 font-semibold border-t" : ""}
              >
                <td className={`px-4 py-2 ${isSection ? "uppercase text-xs" : !isTotal && !isSummary ? "pl-8" : ""}`}>
                  {row.name}
                </td>
                <td className={td}>{row.amount !== null && row.amount !== undefined ? formatAmount(row.amount) : ""}</td>
              </tr>
            );
          })}
          {result.rows.length === 0 && <tr><td colSpan={2} className="p-4 text-gray-500">{t("reports.noTransactions")}</td></tr>}
        </tbody>
      </table>
    </div>;
  }

  const summary = result.type === "general_ledger_summary";
  const transactions = result.type === "general_ledger_transactions";
  const contactSummary = isContactSummary(result.type);
  const supplier = result.type === "supplier_summary" || result.type === "aged_payables";
  const columns = summary ? ["opening", "debits", "credits", "movement", "closing"]
    : transactions ? ["debit", "credit", "balance"]
    : contactSummary ? supplier ? ["opening", "invoices", "payments", "closing"] : ["opening", "invoices", "creditNotes", "lateFees", "closing"]
    : ["current", "days1To30", "days31To60", "days61To90", "daysOver90"];
  const colCount = 1 + columns.length + (transactions || (!summary && !contactSummary) ? 1 : 0);
  return <div className="overflow-x-auto rounded-lg border print:overflow-visible">
    <table className="w-full text-left text-sm">
      <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
        <tr>
          {transactions && <th className="px-4 py-3">{t("common.date")}</th>}
          <th className="px-4 py-3">{transactions ? t("reports.label") : summary ? t("reports.account") : t(supplier ? "common.supplier" : "common.customer")}</th>
          {columns.map(key => <th key={key} className={th}>{t(`reports.${key}`)}</th>)}
          {!summary && !transactions && !contactSummary && <th className={th}>{t("common.total")}</th>}
        </tr>
      </thead>
      <tbody className="divide-y">
        {result.rows.map((row, i) => {
          const group = transactions ? row.accountId : row.groupName;
          const previous = result.rows[i - 1];
          const previousGroup = transactions ? previous?.accountId : previous?.groupName;
          const startGroup = (summary || transactions) && group && group !== previousGroup;
          return <Fragment key={`${row.accountId ?? row.invoiceId ?? row.customerId ?? row.supplierId ?? row.kind}-${i}`}>
            {startGroup && <tr className="bg-gray-50 font-semibold"><td colSpan={colCount} className="px-4 py-2">
              {transactions ? row.name : t(`common.category${group}`)}
              {transactions && <span className="ml-4 font-normal">{t("reports.opening")}: {signed(row.opening ?? 0)}</span>}
            </td></tr>}
            <tr className={row.kind === "total" || row.kind === "profit" ? "bg-gray-50 font-semibold" : row.kind === "invoice" ? "text-gray-500" : ""}>
              {transactions && <td className="px-4 py-2 whitespace-nowrap">{row.date}</td>}
              <td className={`px-4 py-2 ${row.kind === "invoice" ? "pl-8" : ""}`}>
                {transactions ? row.kind === "profit" ? t("reports.profit") : row.label : row.kind === "total" ? t("common.total") : name(row)}
                {row.kind === "invoice" && <span className="ml-2 text-xs">{row.date}</span>}
              </td>
              {summary ? <>
                <td className={td}>{signed(row.opening ?? 0)}</td>
                <td className={td}>{row.debit === null ? "" : formatAmount(row.debit)}</td>
                <td className={td}>{row.credit === null ? "" : formatAmount(row.credit)}</td>
                <td className={td}>{signed(row.movement ?? 0)}</td>
                <td className={td}>{signed(row.closing ?? 0)}</td>
              </> : transactions ? <>
                <td className={td}>{formatAmount(row.debit ?? 0)}</td>
                <td className={td}>{formatAmount(row.credit ?? 0)}</td>
                <td className={td}>{signed(row.balance ?? 0)}</td>
              </> : contactSummary ? <>
                {(supplier ? [row.opening, row.invoices, row.payments, row.closing]
                  : [row.opening, row.invoices, row.creditNotes, row.lateFees, row.closing]).map((n, j) => <td key={j} className={td}>{formatAmount(n ?? 0)}</td>)}
              </> : <>
                {[row.current, row.days1To30, row.days31To60, row.days61To90, row.daysOver90, row.amount].map((n, j) => <td key={j} className={td}>{formatAmount(n ?? 0)}</td>)}
              </>}
            </tr>
          </Fragment>;
        })}
        {result.rows.length === 0 && <tr><td colSpan={colCount} className="p-4 text-gray-500">{t("reports.noTransactions")}</td></tr>}
      </tbody>
    </table>
  </div>;
}
