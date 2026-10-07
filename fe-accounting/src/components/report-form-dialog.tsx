import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  REPORT_TYPE_LABELS,
  type ReportDefinition,
  type ReportDefinitionInput,
  type ReportType,
  useCreateReportDefinition,
  useUpdateReportDefinition,
} from "@/hooks/use-reports";
import { getApiErrorMessage } from "@/lib/errors";

interface ReportFormDialogProps {
  businessId: string;
  type: ReportType;
  definition: ReportDefinition | null; // null = create baru
  canWrite: boolean;
  onClose: () => void;
}

export function ReportFormDialog({
  businessId,
  type,
  definition,
  canWrite,
  onClose,
}: ReportFormDialogProps) {
  const { t } = useTranslation();
  const isNew = definition === null;
  const create = useCreateReportDefinition(businessId, type);
  const update = useUpdateReportDefinition(businessId, type);

  const [title, setTitle] = useState(definition?.title ?? REPORT_TYPE_LABELS[type]);
  const [description, setDescription] = useState(definition?.description ?? "");
  const [dateFrom, setDateFrom] = useState(definition?.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(definition?.dateTo ?? "");
  const [asOfDate, setAsOfDate] = useState(definition?.asOfDate ?? "");
  const [showAccountCodes, setShowAccountCodes] = useState(
    definition?.showAccountCodes ?? false,
  );
  const [excludeZeroBalances, setExcludeZeroBalances] = useState(
    definition?.excludeZeroBalances ?? false,
  );
  const [footer, setFooter] = useState(definition?.footer ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const isBalanceSheet = type === "balance_sheet";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError("Title wajib diisi.");
      return;
    }
    if (!isBalanceSheet && (!dateFrom || !dateTo)) {
      setFormError("From dan To wajib diisi untuk laporan ini.");
      return;
    }
    if (!isBalanceSheet && dateFrom && dateTo && dateFrom > dateTo) {
      setFormError("From tidak boleh lebih besar dari To.");
      return;
    }
    if (isBalanceSheet && !asOfDate) {
      setFormError("Date (as of) wajib diisi untuk Balance Sheet.");
      return;
    }
    const input: ReportDefinitionInput = {
      type,
      title: title.trim(),
      description: description.trim() || null,
      dateFrom: isBalanceSheet ? null : dateFrom,
      dateTo: isBalanceSheet ? null : dateTo,
      asOfDate: isBalanceSheet ? asOfDate : null,
      accountingMethod: "accrual",
      showAccountCodes,
      excludeZeroBalances,
      footer: footer.trim() || null,
    };
    try {
      if (isNew) {
        const created = await create.mutateAsync(input);
        onClose();
        window.location.assign(
          `/businesses/${businessId}/reports/${type}/${created.id}`,
        );
      } else {
        await update.mutateAsync({ id: definition.id, ...input });
        onClose();
      }
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = create.isPending || update.isPending;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isNew ? `New ${REPORT_TYPE_LABELS[type]}` : `Edit ${REPORT_TYPE_LABELS[type]}`}
          </DialogTitle>
          <DialogDescription>
            Isi laporan tidak disimpan — hanya definisinya. Laporan dihitung
            dari buku besar setiap kali dibuka.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {formError && (
              <div role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                Title *
              </label>
              <Input value={title} disabled={!canWrite} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                Description
              </label>
              <Input value={description} disabled={!canWrite} onChange={(e) => setDescription(e.target.value)} />
            </div>
            {isBalanceSheet ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                  Date (as of) *
                </label>
                <Input type="date" value={asOfDate} disabled={!canWrite} onChange={(e) => setAsOfDate(e.target.value)} required />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    From *
                  </label>
                  <Input type="date" value={dateFrom} disabled={!canWrite} onChange={(e) => setDateFrom(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    To *
                  </label>
                  <Input type="date" value={dateTo} disabled={!canWrite} onChange={(e) => setDateTo(e.target.value)} required />
                </div>
              </>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                Accounting method
              </label>
              <select disabled className="h-9 rounded-md border border-gray-300 bg-gray-100 px-3 text-sm text-gray-900">
                <option>Accrual</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" className="h-4 w-4" checked={showAccountCodes} disabled={!canWrite} onChange={(e) => setShowAccountCodes(e.target.checked)} />
              Show account codes
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" className="h-4 w-4" checked={excludeZeroBalances} disabled={!canWrite} onChange={(e) => setExcludeZeroBalances(e.target.checked)} />
              Exclude zero balances
            </label>
            {type !== "trial_balance" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                  Footer
                </label>
                <textarea
                  className="min-h-[56px] rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  value={footer}
                  disabled={!canWrite}
                  onChange={(e) => setFooter(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t("common.cancel")}
            </Button>
            {canWrite && (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("common.submitting") : isNew ? "Create" : "Save"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
