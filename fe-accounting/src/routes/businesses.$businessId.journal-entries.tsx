import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAccounts } from "@/hooks/use-accounts";
import { useBusinesses } from "@/hooks/use-businesses";
import { useCustomers } from "@/hooks/use-customers";
import { useProjectOptions } from "@/hooks/use-projects";
import { useDivisionOptions } from "@/hooks/use-divisions";
import {
  getTodayDateString,
  type JournalEntry,
  type JournalEntryLineInput,
  useCreateJournalEntry,
  useDeleteJournalEntry,
  useJournalEntries,
  useJournalEntry,
  useUpdateJournalEntry,
} from "@/hooks/use-journal-entries";
import { useSuppliers } from "@/hooks/use-suppliers";
import { getApiErrorMessage } from "@/lib/errors";
import { useFormatAmount } from "@/lib/format";

export const Route = createFileRoute("/businesses/$businessId/journal-entries")({
  component: JournalEntriesPage,
});

/** Label sumber jurnal — di dalam komponen karena butuh t(). */
function useSourceLabels(): Record<string, string> {
  const { t } = useTranslation();
  return {
    manual_journal: t("journalEntries.sourceManual"),
    sales_invoice: t("journalEntries.sourceSalesInvoice"),
    purchase_invoice: t("journalEntries.sourcePurchaseInvoice"),
    receipt: t("journalEntries.sourceReceipt"),
    payment: t("journalEntries.sourcePayment"),
    inter_account_transfer: t("journalEntries.sourceTransfer"),
  };
}

function SourceBadge({ sourceModule }: { sourceModule: string }) {
  const sourceLabels = useSourceLabels();
  const isManual = sourceModule === "manual_journal";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
        isManual
          ? "bg-blue-100 text-blue-800 border-blue-200"
          : "bg-gray-100 text-gray-700 border-gray-200"
      }`}
    >
      {sourceLabels[sourceModule] ?? sourceModule}
    </span>
  );
}

const SOURCE_FILTER_VALUES = [
  "",
  "manual_journal",
  "sales_invoice",
  "purchase_invoice",
  "receipt",
  "payment",
  "inter_account_transfer",
];

function JournalEntriesPage() {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const sourceLabels = useSourceLabels();
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [sourceModule, setSourceModule] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [viewEntryId, setViewEntryId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useJournalEntries(businessId, page, {
    q: q || undefined,
    sourceModule: sourceModule || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }, 10);

  const deleteEntry = useDeleteJournalEntry(businessId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalDebit = useMemo(
    () => data?.data.reduce((total, e) => total + e.totalDebit, 0) ?? 0,
    [data],
  );

  const handleDelete = async (entry: JournalEntry) => {
    if (
      !window.confirm(
        entry.reference
          ? t("journalEntries.deleteConfirmWithRef", {
              reference: entry.reference,
              date: entry.entryDate,
              amount: formatAmount(entry.totalDebit),
            })
          : t("journalEntries.deleteConfirm", {
              date: entry.entryDate,
              amount: formatAmount(entry.totalDebit),
            }),
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      await deleteEntry.mutateAsync(entry.id);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
    }
  };

  const resetPage = () => setPage(1);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t("journalEntries.title")}</h1>
          {data && (
            <p className="text-sm text-gray-500">{t("journalEntries.subtitle", { count: data.pagination.total })}</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveEntryId("new")}>{t("journalEntries.newButton")}</Button>
        )}
      </div>

      {deleteError && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder={t("journalEntries.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={sourceModule}
          onChange={(event) => {
            setSourceModule(event.target.value);
            resetPage();
          }}
        >
          <option value="">{t("journalEntries.sourceAll")}</option>
          {SOURCE_FILTER_VALUES.filter((v) => v !== "").map((value) => (
            <option key={value} value={value}>
              {sourceLabels[value] ?? value}
            </option>
          ))}
        </select>
        <Input
          type="date"
          className="max-w-[170px]"
          value={dateFrom}
          onChange={(event) => {
            setDateFrom(event.target.value);
            resetPage();
          }}
          aria-label={t("journalEntries.dateFrom")}
        />
        <span className="text-sm text-gray-500">{t("journalEntries.dateSeparator")}</span>
        <Input
          type="date"
          className="max-w-[170px]"
          value={dateTo}
          onChange={(event) => {
            setDateTo(event.target.value);
            resetPage();
          }}
          aria-label={t("journalEntries.dateTo")}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">{t("journalEntries.loading")}</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">{t("journalEntries.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t("journalEntries.colEntryDate")}</th>
                    <th className="px-6 py-3 font-medium">{t("journalEntries.colReference")}</th>
                    <th className="px-6 py-3 font-medium">{t("journalEntries.colSource")}</th>
                    <th className="px-6 py-3 font-medium">{t("journalEntries.colDescription")}</th>
                    <th className="px-6 py-3 text-right font-medium">
                      {t("journalEntries.colTotalAmount")}
                    </th>
                    <th className="px-6 py-3 font-medium">{t("common.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{entry.entryDate}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {entry.reference || "-"}
                      </td>
                      <td className="px-6 py-3">
                        <SourceBadge sourceModule={entry.sourceModule} />
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {entry.description || "-"}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(entry.totalDebit)}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setViewEntryId(entry.id)}
                          >
                            {t("common.view")}
                          </Button>
                          {canWrite && entry.isManual && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveEntryId(entry.id)}
                              >
                                {t("common.edit")}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={deleteEntry.isPending}
                                onClick={() => void handleDelete(entry)}
                              >
                                {t("common.delete")}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-6 py-3 font-medium text-gray-900">
                      {t("common.total")}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">
                      {formatAmount(totalDebit)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data && (
        <Pagination
          page={page}
          totalPages={data.pagination.totalPages}
          onPageChange={setPage}
        />
      )}

      {viewEntryId && (
        <JournalEntryDetailDialog
          businessId={businessId}
          entryId={viewEntryId}
          onClose={() => setViewEntryId(null)}
        />
      )}

      {activeEntryId && (
        <JournalEntryFormDialog
          businessId={businessId}
          entryId={activeEntryId}
          canWrite={canWrite}
          onClose={() => setActiveEntryId(null)}
        />
      )}
    </div>
  );
}

function JournalEntryDetailDialog({
  businessId,
  entryId,
  onClose,
}: {
  businessId: string;
  entryId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const { data: entry, isPending } = useJournalEntry(businessId, entryId);

  const totalDebit = entry?.lines.reduce((s, l) => s + l.debit, 0) ?? 0;
  const totalCredit = entry?.lines.reduce((s, l) => s + l.credit, 0) ?? 0;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            {t("journalEntries.detailTitle", {
              suffix: entry ? `— ${entry.reference || entry.id.slice(0, 8)}` : "",
            })}
          </DialogTitle>
          <DialogDescription>
            {entry ? (
              <>
                {entry.entryDate} · <SourceBadge sourceModule={entry.sourceModule} /> ·{" "}
                {entry.description || t("journalEntries.noDescription")}
              </>
            ) : (
              t("journalEntries.loadingDetail")
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto pr-2 flex-1">
          {isPending || !entry ? (
            <p className="py-8 text-center text-sm text-gray-500">{t("journalEntries.loadingLines")}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-gray-50 uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t("journalEntries.colAccount")}</th>
                    <th className="px-3 py-2 font-medium">{t("journalEntries.colContact")}</th>
                    <th className="px-3 py-2 font-medium">{t("journalEntries.colDescription")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("journalEntries.colDebit")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("journalEntries.colCredit")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entry.lines.map((line) => (
                    <tr key={line.id} className="hover:bg-gray-50">
                      <td className="p-2 text-gray-900">
                        {line.accountCode} - {line.accountName}
                      </td>
                      <td className="p-2 text-gray-900">{line.contactName || "-"}</td>
                      <td className="p-2 text-gray-600">{line.description || "-"}</td>
                      <td className="p-2 text-right text-gray-900">
                        {formatAmount(line.debit)}
                      </td>
                      <td className="p-2 text-right text-gray-900">
                        {formatAmount(line.credit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={3} className="p-2 font-medium text-gray-900">
                      {t("common.total")}
                    </td>
                    <td className="p-2 text-right font-semibold text-gray-900">
                      {formatAmount(totalDebit)}
                    </td>
                    <td className="p-2 text-right font-semibold text-gray-900">
                      {formatAmount(totalCredit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FormLine {
  id: string;
  accountId: string;
  contactId: string;
  debit: string;
  credit: string;
  description: string;
}

function parseAmountToCents(value: string): number {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

function createEmptyLine(): FormLine {
  return {
    id: Math.random().toString(36).substring(2, 9),
    accountId: "",
    contactId: "",
    debit: "",
    credit: "",
    description: "",
  };
}

interface ContactOption {
  id: string;
  name: string;
  kinds: string[];
}

interface JournalEntryFormDialogProps {
  businessId: string;
  entryId: string; // "new" atau UUID (selalu manual)
  canWrite: boolean;
  onClose: () => void;
}

function JournalEntryFormDialog({
  businessId,
  entryId,
  canWrite,
  onClose,
}: JournalEntryFormDialogProps) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const isNew = entryId === "new";
  const { data: existingEntry, isPending: isEntryLoading } = useJournalEntry(
    businessId,
    isNew ? null : entryId,
  );

  const { data: accountsData, isPending: isAccountsLoading } = useAccounts(
    businessId,
    1,
    {},
    100,
  );

  const { data: customersData, isPending: isCustomersLoading } = useCustomers(
    businessId,
    1,
    {},
    100,
  );

  const { data: suppliersData, isPending: isSuppliersLoading } = useSuppliers(
    businessId,
    1,
    {},
    100,
  );

  const createEntry = useCreateJournalEntry(businessId);
  const updateEntry = useUpdateJournalEntry(businessId);

  const [entryDate, setEntryDate] = useState(getTodayDateString());
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [lines, setLines] = useState<FormLine[]>([createEmptyLine(), createEmptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);

  const { options: divisionOptions } = useDivisionOptions(
    businessId,
    existingEntry?.divisionId,
  );

  const { options: projectOptions } = useProjectOptions(
    businessId,
    existingEntry?.projectId,
  );

  useEffect(() => {
    if (!isNew && existingEntry) {
      setEntryDate(existingEntry.entryDate);
      setReference(existingEntry.reference ?? "");
      setDescription(existingEntry.description ?? "");
      setProjectId(existingEntry.projectId ?? "");
      setDivisionId(existingEntry.divisionId ?? "");
      if (existingEntry.lines && existingEntry.lines.length > 0) {
        setLines(
          existingEntry.lines.map((line) => ({
            id: line.id || Math.random().toString(36).substring(2, 9),
            accountId: line.accountId,
            contactId: line.contactId ?? "",
            debit: line.debit > 0 ? String(line.debit) : "",
            credit: line.credit > 0 ? String(line.credit) : "",
            description: line.description ?? "",
          })),
        );
      }
    }
  }, [isNew, existingEntry]);

  const contactOptions: ContactOption[] = useMemo(() => {
    const map = new Map<string, ContactOption>();
    for (const c of customersData?.data ?? []) {
      const entry = map.get(c.id) ?? { id: c.id, name: c.name, kinds: [] };
      if (!entry.kinds.includes("Customer")) entry.kinds.push("Customer");
      map.set(c.id, entry);
    }
    for (const s of suppliersData?.data ?? []) {
      const entry = map.get(s.id) ?? { id: s.id, name: s.name, kinds: [] };
      if (!entry.kinds.includes("Supplier")) entry.kinds.push("Supplier");
      map.set(s.id, entry);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [customersData, suppliersData]);

  const isContactsLoading = isCustomersLoading || isSuppliersLoading;
  const allAccounts = accountsData?.data ?? [];

  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLine()]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateLine = (index: number, field: keyof FormLine, value: string) => {
    setLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== index) return line;
        const next = { ...line, [field]: value };
        // Satu baris cuma boleh satu sisi: isi sisi ini -> kosongkan sisi lain.
        if (field === "debit" && value.trim() !== "") next.credit = "";
        if (field === "credit" && value.trim() !== "") next.debit = "";
        return next;
      }),
    );
  };

  const totals = useMemo(() => {
    let debitCents = 0;
    let creditCents = 0;
    for (const line of lines) {
      debitCents += parseAmountToCents(line.debit);
      creditCents += parseAmountToCents(line.credit);
    }
    return { debitCents, creditCents };
  }, [lines]);

  const validationError: string | null = useMemo(() => {
    if (lines.length < 2) return t("journalEntries.validationMinLines");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.accountId) return t("journalEntries.validationLineAccount", { index: i + 1 });
      const filled =
        (parseAmountToCents(line.debit) > 0 ? 1 : 0) +
        (parseAmountToCents(line.credit) > 0 ? 1 : 0);
      if (filled !== 1)
        return t("journalEntries.validationLineOneSide", { index: i + 1 });
    }
    if (totals.debitCents !== totals.creditCents)
      return t("journalEntries.validationUnbalanced");
    if (totals.debitCents <= 0) return t("journalEntries.validationPositiveTotal");
    return null;
  }, [lines, totals, t]);

  const isBalanced = totals.debitCents === totals.creditCents && totals.debitCents > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    const finalDate = entryDate.trim() || getTodayDateString();
    const formattedLines: JournalEntryLineInput[] = lines.map((l) => ({
      accountId: l.accountId,
      contactId: l.contactId || null,
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
      description: l.description.trim() || null,
    }));

    try {
      if (isNew) {
        await createEntry.mutateAsync({
          entryDate: finalDate,
          reference: reference.trim() || undefined,
          description: description.trim() || undefined,
          projectId: projectId || null,
          divisionId: divisionId || null,
          lines: formattedLines,
        });
      } else {
        await updateEntry.mutateAsync({
          entryId,
          entryDate: finalDate,
          reference: reference.trim() || null,
          description: description.trim() || null,
          projectId: projectId || null,
          divisionId: divisionId || null,
          lines: formattedLines,
        });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createEntry.isPending || updateEntry.isPending;
  const isInitialLoading = !isNew && isEntryLoading;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew
              ? t("journalEntries.newButton")
              : canWrite
                ? t("journalEntries.dialogTitleEdit")
                : t("journalEntries.dialogTitleDetail")}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? t("journalEntries.dialogDescriptionNew")
              : t("journalEntries.dialogDescriptionEdit")}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            {t("journalEntries.loadingDialog")}
          </div>
        ) : (
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="flex flex-col gap-4 overflow-hidden flex-1"
          >
            <div className="overflow-y-auto pr-2 flex flex-col gap-4 flex-1">
              {formError && (
                <div
                  role="alert"
                  className="rounded bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("journalEntries.fieldEntryDate")} *
                  </label>
                  <Input
                    type="date"
                    value={entryDate}
                    disabled={!canWrite}
                    onChange={(event) => setEntryDate(event.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("journalEntries.fieldReference")}
                  </label>
                  <Input
                    placeholder={t("journalEntries.placeholderReference")}
                    value={reference}
                    disabled={!canWrite}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("journalEntries.fieldDescription")}
                  </label>
                  <Input
                    placeholder={t("journalEntries.placeholderDescription")}
                    value={description}
                    disabled={!canWrite}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("journalEntries.fieldProject")}
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={projectId}
                    disabled={!canWrite}
                    onChange={(event) => setProjectId(event.target.value)}
                  >
                    <option value="">{t("journalEntries.noProject")}</option>
                    {projectOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.code ? `(${p.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("journalEntries.fieldDivision")}
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={divisionId}
                    disabled={!canWrite}
                    onChange={(event) => setDivisionId(event.target.value)}
                  >
                    <option value="">{t("journalEntries.noDivision")}</option>
                    {divisionOptions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.code ? `(${d.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {t("journalEntries.linesTitle")}
                  </h3>
                  {canWrite && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addLine}
                    >
                      {t("journalEntries.addLine")}
                    </Button>
                  )}
                </div>

                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-gray-50 uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2 font-medium min-w-[200px]">
                          {t("journalEntries.lineColAccount")} *
                        </th>
                        <th className="px-3 py-2 font-medium min-w-[160px]">
                          {t("journalEntries.lineColContact")}
                        </th>
                        <th className="px-3 py-2 font-medium min-w-[150px]">
                          {t("journalEntries.lineColDescription")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium w-32">
                          {t("journalEntries.lineColDebit")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium w-32">
                          {t("journalEntries.lineColCredit")}
                        </th>
                        {canWrite && (
                          <th className="px-3 py-2 text-center font-medium w-16">
                            {t("journalEntries.lineColRemove")}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((line, index) => (
                        <tr key={line.id} className="hover:bg-gray-50">
                          <td className="p-2">
                            <Combobox
                              className="h-8 text-xs"
                              ariaLabel={`Akun baris ${index + 1}`}
                              value={line.accountId}
                              disabled={!canWrite || isAccountsLoading}
                              onChange={(value) =>
                                updateLine(index, "accountId", value)
                              }
                                placeholder={t("journalEntries.selectLineAccount")}
                              options={allAccounts.map((acc) => ({
                                value: acc.id,
                                label: `${acc.code} - ${acc.name}`,
                              }))}
                            />
                          </td>
                          <td className="p-2">
                            <select
                              className="w-full h-8 rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                              value={line.contactId}
                              disabled={!canWrite || isContactsLoading}
                              onChange={(event) =>
                                updateLine(index, "contactId", event.target.value)
                              }
                            >
                              <option value="">{t("journalEntries.noContact")}</option>
                              {contactOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name} ({c.kinds.join(", ")})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                placeholder={t("journalEntries.lineDescriptionPlaceholder")}
                              value={line.description}
                              disabled={!canWrite}
                              onChange={(event) =>
                                updateLine(index, "description", event.target.value)
                              }
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              placeholder="0.00"
                              value={line.debit}
                              disabled={!canWrite}
                              onChange={(event) =>
                                updateLine(index, "debit", event.target.value)
                              }
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              placeholder="0.00"
                              value={line.credit}
                              disabled={!canWrite}
                              onChange={(event) =>
                                updateLine(index, "credit", event.target.value)
                              }
                            />
                          </td>
                          {canWrite && (
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                className="text-red-600 hover:text-red-800 disabled:text-gray-400"
                                disabled={lines.length <= 2}
                                onClick={() => removeLine(index)}
                              >
                                ✕
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-end gap-6">
                  <div className="text-right">
                    <div className="text-xs text-gray-500">{t("journalEntries.totalDebitLabel")}</div>
                    <div
                      className={`text-lg font-semibold ${isBalanced ? "text-gray-900" : "text-red-600"}`}
                    >
                      {formatAmount(totals.debitCents / 100)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">{t("journalEntries.totalCreditLabel")}</div>
                    <div
                      className={`text-lg font-semibold ${isBalanced ? "text-gray-900" : "text-red-600"}`}
                    >
                      {formatAmount(totals.creditCents / 100)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">{t("journalEntries.statusLabel")}</div>
                    <div
                      className={`text-sm font-semibold ${isBalanced ? "text-green-700" : "text-red-600"}`}
                    >
                      {isBalanced ? t("journalEntries.balanced") : t("journalEntries.unbalanced")}
                    </div>
                  </div>
                </div>
                {validationError && canWrite && (
                  <p className="mt-2 text-right text-xs text-red-600">{validationError}</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                {t("common.cancel")}
              </Button>
              {canWrite && (
                <Button
                  type="submit"
                  disabled={isSubmitting || validationError !== null}
                >
                  {isNew
                    ? (isSubmitting ? t("common.submitting") : t("journalEntries.submitNew"))
                    : (isSubmitting ? t("common.submitting") : t("journalEntries.submitEdit"))}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
