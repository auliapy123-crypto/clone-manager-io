import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  isUnpaidStatement,
  type StatementDetailResult,
  type StatementListResponse,
  type StatementParams,
  type StatementType,
} from "@/hooks/use-reports";
import { useFormatAmount } from "@/lib/format";

/** Tanggal hari ini menurut waktu LOKAL (bukan UTC) — default dialog. */
export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Awal waktu untuk default From pada statement Transactions (§12.2). */
export const STATEMENT_EPOCH = "1900-01-01";

export function defaultStatementParams(type: StatementType): StatementParams {
  return isUnpaidStatement(type)
    ? { asOfDate: todayIso() }
    : { dateFrom: STATEMENT_EPOCH, dateTo: todayIso() };
}

/**
 * Dialog Set Date (unpaid) / Set Period (transactions). TANPA definisi
 * tersimpan: nilai hanya jadi parameter query, bukan baris database.
 */
export function StatementParamsDialog({
  type,
  initial,
  onSubmit,
  onClose,
}: {
  type: StatementType;
  initial: StatementParams;
  onSubmit: (params: StatementParams) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const unpaid = isUnpaidStatement(type);
  const [asOfDate, setAsOfDate] = useState(initial.asOfDate ?? todayIso());
  const [dateFrom, setDateFrom] = useState(initial.dateFrom ?? STATEMENT_EPOCH);
  const [dateTo, setDateTo] = useState(initial.dateTo ?? todayIso());
  const [error, setError] = useState<string | null>(null);
  const fieldClass = "flex flex-col gap-1 text-sm font-medium text-gray-700";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (unpaid) {
      if (!asOfDate) return setError(t("reports.dateRequired"));
      onSubmit({ asOfDate });
      return;
    }
    if (!dateFrom || !dateTo) return setError(t("reports.rangeRequired"));
    if (dateFrom > dateTo) return setError(t("reports.rangeInvalid"));
    onSubmit({ dateFrom, dateTo });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {unpaid ? t("reports.setDate") : t("reports.setPeriod")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {unpaid ? (
            <label className={fieldClass}>
              {t("common.date")} *
              <Input
                type="date"
                value={asOfDate}
                required
                onChange={(e) => setAsOfDate(e.target.value)}
              />
            </label>
          ) : (
            <>
              <label className={fieldClass}>
                {t("reports.from")} *
                <Input
                  type="date"
                  value={dateFrom}
                  required
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label className={fieldClass}>
                {t("reports.to")} *
                <Input
                  type="date"
                  value={dateTo}
                  required
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit">{t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const th = "px-4 py-3 text-right font-medium";
const thLeft = "px-4 py-3 text-left font-medium";
const td = "px-4 py-2 text-right tabular-nums whitespace-nowrap";
const tdLeft = "px-4 py-2 whitespace-nowrap";

/** Daftar kontak §12.3 + baris total. */
export function StatementListTable({
  result,
  type,
  params,
  onView,
}: {
  result: StatementListResponse;
  type: StatementType;
  params: StatementParams;
  onView: (contactId: string) => void;
}) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const unpaid = isUnpaidStatement(type);
  const supplier = type.startsWith("supplier_");
  const contactHeader = t(supplier ? "common.supplier" : "common.customer");
  const total = result.totals[0]?.value ?? 0;

  return (
    <div className="overflow-x-auto rounded-lg border print:overflow-visible">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
          <tr>
            {unpaid ? (
              <th className={thLeft}>{t("common.date")}</th>
            ) : (
              <>
                <th className={thLeft}>{t("reports.from")}</th>
                <th className={thLeft}>{t("reports.to")}</th>
              </>
            )}
            <th className={thLeft}>{contactHeader}</th>
            <th className={th}>{t("reports.transactions")}</th>
            <th className={th}>{unpaid ? t("common.total") : t("reports.balance")}</th>
            <th className={`${th} print:hidden`}>{t("common.colActions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {result.data.map((row) => (
            <tr key={row.contactId} className="hover:bg-gray-50">
              {unpaid ? (
                <td className={tdLeft}>{params.asOfDate}</td>
              ) : (
                <>
                  <td className={tdLeft}>{params.dateFrom}</td>
                  <td className={tdLeft}>{params.dateTo}</td>
                </>
              )}
              <td className={`${tdLeft} font-medium text-gray-900`}>{row.name}</td>
              <td className={td}>{row.transactionCount}</td>
              <td className={td}>{formatAmount(row.amount)}</td>
              <td className={`${td} print:hidden`}>
                <Button variant="outline" size="sm" onClick={() => onView(row.contactId)}>
                  {t("common.view")}
                </Button>
              </td>
            </tr>
          ))}
          {result.data.length === 0 && (
            <tr>
              <td colSpan={unpaid ? 5 : 6} className="p-4 text-gray-500">
                {t("reports.noTransactions")}
              </td>
            </tr>
          )}
          {result.data.length > 0 && (
            <tr className="border-t bg-gray-50 font-semibold">
              <td className={tdLeft} colSpan={unpaid ? 3 : 4}>
                {t("common.total")}
              </td>
              <td className={td}>{formatAmount(total)}</td>
              <td className={`${td} print:hidden`} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Detail Unpaid: per faktur + footer aging §12.3. */
function UnpaidDetailTable({ result }: { result: StatementDetailResult }) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const buckets = result.buckets;
  return (
    <>
      <div className="overflow-x-auto rounded-lg border print:overflow-visible">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className={thLeft}>{t("common.date")}</th>
              <th className={thLeft}>{t("reports.orderNumber")}</th>
              <th className={thLeft}>{t("reports.invoiceRef")}</th>
              <th className={thLeft}>{t("common.description")}</th>
              <th className={th}>{t("reports.invoiceTotal")}</th>
              <th className={th}>{t("reports.overdue")}</th>
              <th className={th}>{t("reports.balanceDue")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {result.rows.map((row, i) => (
              <tr key={`${row.invoiceId}-${i}`}>
                <td className={tdLeft}>{row.date}</td>
                <td className={tdLeft}>{row.orderNumber ?? ""}</td>
                <td className={tdLeft}>{row.reference}</td>
                <td className="px-4 py-2">{row.description ?? ""}</td>
                <td className={td}>{formatAmount(row.invoiceTotal ?? 0)}</td>
                <td className={td}>{row.overdueDays ?? 0}</td>
                <td className={td}>{formatAmount(row.balanceDue ?? 0)}</td>
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-gray-500">
                  {t("reports.noTransactions")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {buckets && (
        <div className="overflow-x-auto rounded-lg border print:overflow-visible">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className={thLeft}>{t("reports.aging")}</th>
                <th className={th}>{t("reports.current")}</th>
                <th className={th}>{t("reports.days1To30")}</th>
                <th className={th}>{t("reports.days31To60")}</th>
                <th className={th}>{t("reports.days61To90")}</th>
                <th className={th}>{t("reports.daysOver90")}</th>
                <th className={th}>{t("common.total")}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="font-semibold">
                <td className={thLeft}>{t("common.total")}</td>
                <td className={td}>{formatAmount(buckets.current)}</td>
                <td className={td}>{formatAmount(buckets.days1To30)}</td>
                <td className={td}>{formatAmount(buckets.days31To60)}</td>
                <td className={td}>{formatAmount(buckets.days61To90)}</td>
                <td className={td}>{formatAmount(buckets.daysOver90)}</td>
                <td className={td}>{formatAmount(buckets.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Detail Transactions: kronologis + saldo berjalan + footer §12.3. */
function TransactionsDetailTable({ result }: { result: StatementDetailResult }) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const value = (label: string) => result.totals.find((x) => x.label === label)?.value ?? 0;
  return (
    <div className="overflow-x-auto rounded-lg border print:overflow-visible">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
          <tr>
            <th className={thLeft}>{t("common.date")}</th>
            <th className={thLeft}>{t("common.description")}</th>
            <th className={th}>{t("reports.debit")}</th>
            <th className={th}>{t("reports.credit")}</th>
            <th className={th}>{t("reports.balance")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {result.rows.map((row, i) => (
            <tr key={`${row.date}-${row.sourceModule}-${i}`}>
              <td className={tdLeft}>{row.date}</td>
              <td className="px-4 py-2">{row.description}</td>
              <td className={td}>{row.debit ? formatAmount(row.debit) : ""}</td>
              <td className={td}>{row.credit ? formatAmount(row.credit) : ""}</td>
              <td className={td}>{formatAmount(row.runningBalance ?? 0)}</td>
            </tr>
          ))}
          {result.rows.length === 0 && (
            <tr>
              <td colSpan={5} className="p-4 text-gray-500">
                {t("reports.noTransactions")}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot className="border-t bg-gray-50 font-semibold">
          <tr>
            <td className={tdLeft} colSpan={2}>
              {t("common.total")}
            </td>
            <td className={td}>{formatAmount(value("debits"))}</td>
            <td className={td}>{formatAmount(value("credits"))}</td>
            <td className={td}>{formatAmount(value("closing"))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function StatementDetailTable({ result }: { result: StatementDetailResult }) {
  const unpaid = result.type.endsWith("_unpaid");
  return unpaid ? <UnpaidDetailTable result={result} /> : <TransactionsDetailTable result={result} />;
}
