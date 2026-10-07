import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { ReportResult } from "@/hooks/use-reports";
import { useFormatAmount } from "@/lib/format";

export function ReportStage1bTable({ result }: { result: ReportResult }) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const signed = (n: number) => `${formatAmount(Math.abs(n))} ${n < 0 ? "Cr" : "Dr"}`;
  const name = (row: ReportResult["rows"][number]) => row.kind === "profit" ? t("reports.profit") : row.name;
  const th = "px-4 py-3 text-right font-medium";
  const td = "px-4 py-2 text-right tabular-nums whitespace-nowrap";
  const summary = result.type === "general_ledger_summary";
  const transactions = result.type === "general_ledger_transactions";
  const columns = summary ? ["opening", "debits", "credits", "movement", "closing"]
    : transactions ? ["debit", "credit", "balance"] : ["current", "days1To30", "days31To60", "days61To90", "daysOver90"];
  return <div className="overflow-x-auto rounded-lg border print:overflow-visible">
    <table className="w-full text-left text-sm">
      <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
        <tr>
          {transactions && <th className="px-4 py-3">{t("common.date")}</th>}
          <th className="px-4 py-3">{transactions ? t("reports.label") : summary ? t("reports.account") : t("common.customer")}</th>
          {columns.map(key => <th key={key} className={th}>{t(`reports.${key}`)}</th>)}
          {!summary && !transactions && <th className={th}>{t("common.total")}</th>}
        </tr>
      </thead>
      <tbody className="divide-y">
        {result.rows.map((row, i) => {
          const group = transactions ? row.accountId : row.groupName;
          const previous = result.rows[i - 1];
          const previousGroup = transactions ? previous?.accountId : previous?.groupName;
          const startGroup = (summary || transactions) && group && group !== previousGroup;
          const colCount = summary ? 6 : transactions ? 5 : 7;
          return <Fragment key={`${row.accountId ?? row.invoiceId ?? row.customerId ?? row.kind}-${i}`}>
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
              </> : <>
                {[row.current, row.days1To30, row.days31To60, row.days61To90, row.daysOver90, row.amount].map((n, j) => <td key={j} className={td}>{formatAmount(n ?? 0)}</td>)}
              </>}
            </tr>
          </Fragment>;
        })}
        {result.rows.length === 0 && <tr><td colSpan={transactions ? 5 : 7} className="p-4 text-gray-500">{t("reports.noTransactions")}</td></tr>}
      </tbody>
    </table>
  </div>;
}
