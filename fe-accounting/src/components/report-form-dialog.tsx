import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { REPORT_TYPE_LABELS, isParameterOnlyReport, isAgedReport, type ReportDefinition, type ReportDefinitionInput, type ReportType,
  useCreateReportDefinition, useUpdateReportDefinition, useReportAccounts, useReportCustomFields } from "@/hooks/use-reports";
import { getApiErrorMessage } from "@/lib/errors";

interface ReportFormDialogProps {
  businessId: string; type: ReportType; definition: ReportDefinition | null; canWrite: boolean; onClose: () => void;
}

export function ReportFormDialog({ businessId, type, definition, canWrite, onClose }: ReportFormDialogProps) {
  const { t } = useTranslation();
  const isNew = definition === null;
  const parameterOnly = isParameterOnlyReport(type);
  const asOf = type === "balance_sheet" || isAgedReport(type);
  const create = useCreateReportDefinition(businessId, type);
  const update = useUpdateReportDefinition(businessId, type);
  const accounts = useReportAccounts(businessId, type === "general_ledger_transactions");
  const customGrouping = type === "sales_invoice_totals_by_custom_field";
  const fields = useReportCustomFields(businessId, customGrouping);
  const [customFieldId, setCustomFieldId] = useState(definition?.customFieldId ?? "");
  const [title, setTitle] = useState(definition?.title ?? REPORT_TYPE_LABELS[type]);
  const [description, setDescription] = useState(definition?.description ?? "");
  const [dateFrom, setDateFrom] = useState(definition?.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(definition?.dateTo ?? "");
  const [asOfDate, setAsOfDate] = useState(definition?.asOfDate ?? "");
  const [accountId, setAccountId] = useState(definition?.accountId ?? "");
  const [sortBy, setSortBy] = useState<"total" | "name">(definition?.sortBy ?? "total");
  const [showInvoices, setShowInvoices] = useState(definition?.showInvoices ?? false);
  const [showAccountCodes, setShowAccountCodes] = useState(definition?.showAccountCodes ?? false);
  const [excludeZeroBalances, setExcludeZeroBalances] = useState(definition?.excludeZeroBalances ?? false);
  const [footer, setFooter] = useState(definition?.footer ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const isSubmitting = create.isPending || update.isPending;
  const label = parameterOnly ? t(`reports.${type}`) : REPORT_TYPE_LABELS[type];
  const fieldClass = "flex flex-col gap-1 text-sm font-medium text-gray-700";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setFormError(null);
    if (!parameterOnly && !title.trim()) { setFormError(t("reports.titleRequired")); return; }
    if (!asOf && (!dateFrom || !dateTo)) { setFormError(t("reports.rangeRequired")); return; }
    if (!asOf && dateFrom > dateTo) { setFormError(t("reports.rangeInvalid")); return; }
    if (asOf && !asOfDate) { setFormError(t("reports.dateRequired")); return; }
    if (customGrouping && !customFieldId) { setFormError(t("reports.customFieldRequired")); return; }
    const input: ReportDefinitionInput = {
      type, ...(asOf ? { asOfDate } : { dateFrom, dateTo }),
      ...(!parameterOnly ? { title: title.trim(), description: description.trim() || null, accountingMethod: "accrual" as const,
        showAccountCodes, excludeZeroBalances, footer: footer.trim() || null } : {}),
      ...(type === "receipts_payments_summary" ? { showAccountCodes, excludeZeroBalances, footer: footer.trim() || null } : {}),
      ...(type === "general_ledger_transactions" ? { accountId: accountId || null } : {}),
      ...(isAgedReport(type) ? { sortBy, showInvoices } : {}),
      ...(customGrouping ? { title: title.trim(), customFieldId } : {}),
    };
    try {
      if (isNew) {
        const created = await create.mutateAsync(input); onClose();
        window.location.assign(`/businesses/${businessId}/reports/${type}/${created.id}`);
      } else { await update.mutateAsync({ id: definition.id, ...input }); onClose(); }
    } catch (err) { setFormError(getApiErrorMessage(err)); }
  };

  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">
      <DialogHeader className="shrink-0">
        <DialogTitle>{t("reports.formTitle", { action: isNew ? t("reports.newReport") : t("common.edit"), report: label })}</DialogTitle>
        <DialogDescription>{t("reports.definitionHint")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => void handleSubmit(event)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {formError && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
          {!parameterOnly && <>
            <label className={fieldClass}>{t("reports.title")} *<Input value={title} disabled={!canWrite} onChange={e => setTitle(e.target.value)} required /></label>
            <label className={fieldClass}>{t("common.description")}<Input value={description} disabled={!canWrite} onChange={e => setDescription(e.target.value)} /></label>
          </>}
          {asOf ? <label className={fieldClass}>{t("common.date")} *<Input type="date" value={asOfDate} disabled={!canWrite} onChange={e => setAsOfDate(e.target.value)} required /></label> : <>
            <label className={fieldClass}>{t("reports.from")} *<Input type="date" value={dateFrom} disabled={!canWrite} onChange={e => setDateFrom(e.target.value)} required /></label>
            <label className={fieldClass}>{t("reports.to")} *<Input type="date" value={dateTo} disabled={!canWrite} onChange={e => setDateTo(e.target.value)} required /></label>
          </>}
          {customGrouping && <label className={fieldClass}>{t("common.colName")}<Input value={title} disabled={!canWrite} onChange={e => setTitle(e.target.value)} /></label>}
          {customGrouping && <label className={fieldClass}>{t("reports.customField")} *
            <select required className="h-9 rounded-md border border-gray-300 px-3" value={customFieldId}
              disabled={!canWrite || fields.isPending || fields.isError} onChange={e => setCustomFieldId(e.target.value)}>
              <option value="">{t("reports.selectCustomField")}</option>
              {(fields.data ?? []).map(field => <option key={field.id} value={field.id}>{field.label}</option>)}
            </select>
            {fields.isError && <span role="alert" className="text-red-700">{getApiErrorMessage(fields.error)}</span>}
          </label>}
          {type === "general_ledger_transactions" && <div className={fieldClass}>
            <span>{t("reports.account")}</span>
            <Combobox value={accountId} onChange={setAccountId} disabled={!canWrite || accounts.isPending || accounts.isError}
              ariaLabel={t("reports.account")} placeholder={t("reports.allAccounts")}
              options={[{ value: "", label: t("reports.allAccounts") }, ...(accounts.data ?? []).map(a => ({ value: a.id, label: `${a.code} - ${a.name}` }))]} />
            {accounts.isError && <p role="alert" className="text-red-700">{getApiErrorMessage(accounts.error)}</p>}
          </div>}
          {isAgedReport(type) && <>
            <label className={fieldClass}>{t("reports.sortBy")}
              <select className="h-9 rounded-md border border-gray-300 px-3" value={sortBy} disabled={!canWrite} onChange={e => setSortBy(e.target.value as "total" | "name")}>
                <option value="total">{t("reports.sortTotal")}</option><option value="name">{t("reports.sortName")}</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showInvoices} disabled={!canWrite} onChange={e => setShowInvoices(e.target.checked)} />{t("reports.showInvoices")}</label>
          </>}
          {!parameterOnly && <label className={fieldClass}>{t("reports.accountingMethod")}<select disabled className="h-9 rounded-md border border-gray-300 bg-gray-100 px-3"><option>{t("reports.accrual")}</option></select></label>}
          {(!parameterOnly || type === "receipts_payments_summary") && <>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showAccountCodes} disabled={!canWrite} onChange={e => setShowAccountCodes(e.target.checked)} />{t("reports.showAccountCodes")}</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={excludeZeroBalances} disabled={!canWrite} onChange={e => setExcludeZeroBalances(e.target.checked)} />{t("reports.excludeZeroBalances")}</label>
            {type !== "trial_balance" && <label className={fieldClass}>{t("reports.footer")}<textarea className="min-h-14 rounded-md border border-gray-300 p-2" value={footer} disabled={!canWrite} onChange={e => setFooter(e.target.value)} /></label>}
          </>}
        </div>
        <DialogFooter className="shrink-0 border-t pt-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>{t("common.cancel")}</Button>
          {canWrite && <Button type="submit" disabled={isSubmitting}>{isSubmitting ? t("common.submitting") : isNew ? t("reports.create") : t("common.save")}</Button>}
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
