import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useBusinesses } from "@/hooks/use-businesses";
import { useContacts } from "@/hooks/use-contacts";
import { useCustomers } from "@/hooks/use-customers";
import {
  getTodayDateString,
  type BillableTimeEntry,
  useBillableTimeEntries,
  useCopyBillableTimeEntry,
  useCreateBillableTimeEntry,
  useDeleteBillableTimeEntry,
  useBillableTimeEntry,
  useUpdateBillableTimeEntry,
} from "@/hooks/use-billable-time";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/errors";
import { useFormatAmount } from "@/lib/format";

export const Route = createFileRoute("/businesses/$businessId/billable-time")({
  component: BillableTimePage,
});

function BillableTimePage() {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useBillableTimeEntries(
    businessId,
    page,
    { q: q || undefined },
    10,
  );

  const deleteEntry = useDeleteBillableTimeEntry(businessId);
  const copyEntry = useCopyBillableTimeEntry(businessId);
  const [listError, setListError] = useState<string | null>(null);

  const totalAmount = useMemo(
    () => data?.data.reduce((total, e) => total + e.amount, 0) ?? 0,
    [data],
  );

  const handleDelete = async (entry: BillableTimeEntry) => {
    if (
      !window.confirm(
        t("billableTime.deleteConfirm", { description: entry.description, customer: entry.customerName }),
      )
    ) {
      return;
    }
    setListError(null);
    try {
      await deleteEntry.mutateAsync(entry.id);
    } catch (err) {
      setListError(getApiErrorMessage(err));
    }
  };

  const handleCopy = async (entry: BillableTimeEntry) => {
    setListError(null);
    try {
      await copyEntry.mutateAsync(entry.id);
    } catch (err) {
      setListError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t("billableTime.title")}</h1>
          {data && (
            <p className="text-sm text-gray-500">
              {t("billableTime.subtitle", { count: data.pagination.total })}
            </p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveEntryId("new")}>{t("billableTime.newButton")}</Button>
        )}
      </div>

      {listError && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {listError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder={t("billableTime.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">
              {t("billableTime.loading")}
            </p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">
              {t("billableTime.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t("common.date")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.customer")}</th>
                    <th className="px-6 py-3 font-medium">{t("billableTime.colEmployee")}</th>
                    <th className="px-6 py-3 font-medium">{t("billableTime.colDescription")}</th>
                    <th className="px-6 py-3 text-right font-medium">{t("billableTime.colAmount")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.colStatus")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{entry.date}</td>
                      <td className="px-6 py-3 text-gray-900">
                        {entry.customerName}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {entry.employeeName}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {entry.description}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(entry.amount)}
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 border border-yellow-200">
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveEntryId(entry.id)}
                          >
                            {canWrite ? t("common.edit") : t("common.view")}
                          </Button>
                          {canWrite && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={copyEntry.isPending}
                              onClick={() => void handleCopy(entry)}
                            >
                              Duplikat
                            </Button>
                          )}
                          {canWrite && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteEntry.isPending}
                              onClick={() => void handleDelete(entry)}
                            >
                              {t("common.delete")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-6 py-3 font-medium text-gray-900">
                      Total
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">
                      {formatAmount(totalAmount)}
                    </td>
                    <td colSpan={2} />
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

      {activeEntryId && (
        <BillableTimeFormDialog
          businessId={businessId}
          entryId={activeEntryId}
          canWrite={canWrite}
          onClose={() => setActiveEntryId(null)}
        />
      )}
    </div>
  );
}

interface BillableTimeFormDialogProps {
  businessId: string;
  entryId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function BillableTimeFormDialog({
  businessId,
  entryId,
  canWrite,
  onClose,
}: BillableTimeFormDialogProps) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const isNew = entryId === "new";
  const { data: existingEntry, isPending: isEntryLoading } = useBillableTimeEntry(
    businessId,
    isNew ? null : entryId,
  );

  const { data: customersData, isPending: isCustomersLoading } = useCustomers(
    businessId,
    1,
    {},
    100,
  );

  // Employee = SEMUA kontak di bisnis ini (tanpa flag customer/supplier).
  const { data: contactsData, isPending: isContactsLoading } =
    useContacts(businessId);

  const createEntry = useCreateBillableTimeEntry(businessId);
  const updateEntry = useUpdateBillableTimeEntry(businessId);

  const [customerId, setCustomerId] = useState("");
  const [employeeContactId, setEmployeeContactId] = useState("");
  const [date, setDate] = useState(getTodayDateString());
  const [description, setDescription] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Inisialisasi form saat mode edit selesai memuat data entry
  useEffect(() => {
    if (!isNew && existingEntry) {
      setCustomerId(existingEntry.customerId);
      setEmployeeContactId(existingEntry.employeeContactId);
      setDate(existingEntry.date);
      setDescription(existingEntry.description);
      setHourlyRate(String(existingEntry.hourlyRate));
      setHours(String(Math.floor(existingEntry.timeSpentMinutes / 60)));
      setMinutes(String(existingEntry.timeSpentMinutes % 60));
    }
  }, [isNew, existingEntry]);

  const totalMinutes = useMemo(() => {
    const h = parseInt(hours, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    return h * 60 + m;
  }, [hours, minutes]);

  const liveAmount = useMemo(() => {
    const rate = parseFloat(hourlyRate) || 0;
    const cents = Math.round(rate * 100);
    return Math.round((cents * totalMinutes) / 60) / 100;
  }, [hourlyRate, totalMinutes]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!customerId) {
      setFormError(t("common.customerRequired"));
      return;
    }

    if (!employeeContactId) {
      setFormError(t("billableTime.employeeRequired"));
      return;
    }

    if (!date) {
      setFormError(t("billableTime.dateRequired"));
      return;
    }

    if (!description.trim()) {
      setFormError(t("billableTime.descriptionRequired"));
      return;
    }

    const rate = parseFloat(hourlyRate);
    if (!Number.isFinite(rate) || rate < 0) {
      setFormError(t("billableTime.rateNonNegative"));
      return;
    }

    const h = parseInt(hours, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    if (h < 0 || m < 0 || m > 59) {
      setFormError(t("billableTime.minutesRange"));
      return;
    }
    const spentMinutes = h * 60 + m;
    if (spentMinutes <= 0) {
      setFormError(t("billableTime.timeSpentPositive"));
      return;
    }

    try {
      if (isNew) {
        await createEntry.mutateAsync({
          customerId,
          employeeContactId,
          date,
          description: description.trim(),
          hourlyRate: rate,
          timeSpentMinutes: spentMinutes,
        });
      } else {
        await updateEntry.mutateAsync({
          entryId,
          customerId,
          employeeContactId,
          date,
          description: description.trim(),
          hourlyRate: rate,
          timeSpentMinutes: spentMinutes,
        });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createEntry.isPending || updateEntry.isPending;
  const isInitialLoading = !isNew && isEntryLoading;
  const selectClassName =
    "h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100";

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew
              ? t("billableTime.dialogTitleNew")
              : canWrite
                ? t("billableTime.dialogTitleEdit")
                : t("billableTime.dialogTitleDetail")}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? t("billableTime.dialogDescNew")
              : t("billableTime.dialogDescEdit")}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            {t("billableTime.loadingDetail")}
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("billableTime.fieldCustomer")} *
                  </label>
                  <select
                    className={selectClassName}
                    value={customerId}
                    disabled={!canWrite || isCustomersLoading}
                    onChange={(event) => setCustomerId(event.target.value)}
                    required
                  >
                    <option value="">{t("billableTime.customerPlaceholder")}</option>
                    {customersData?.data.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.code ? `(${c.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("billableTime.fieldEmployee")} *
                  </label>
                  <select
                    className={selectClassName}
                    value={employeeContactId}
                    disabled={!canWrite || isContactsLoading}
                    onChange={(event) => setEmployeeContactId(event.target.value)}
                    required
                  >
                    <option value="">{t("billableTime.employeePlaceholder")}</option>
                    {contactsData?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.code ? `(${c.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("billableTime.fieldDate")} *
                  </label>
                  <Input
                    type="date"
                    value={date}
                    disabled={!canWrite}
                    onChange={(event) => setDate(event.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("billableTime.fieldHourlyRate")} *
                  </label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder={t("billableTime.placeholderRate")}
                    value={hourlyRate}
                    disabled={!canWrite}
                    onChange={(event) => setHourlyRate(event.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("billableTime.fieldDescription")} *
                  </label>
                  <Input
                    placeholder={t("billableTime.placeholderDescription")}
                    value={description}
                    disabled={!canWrite}
                    onChange={(event) => setDescription(event.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("billableTime.fieldTimeSpent")} *
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-1 items-center gap-1">
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={hours}
                        disabled={!canWrite}
                        onChange={(event) => setHours(event.target.value)}
                        required
                      />
                      <span className="text-xs text-gray-500">{t("billableTime.unitJam")}</span>
                    </div>
                    <div className="flex flex-1 items-center gap-1">
                      <Input
                        type="number"
                        min="0"
                        max="59"
                        placeholder="0"
                        value={minutes}
                        disabled={!canWrite}
                        onChange={(event) => setMinutes(event.target.value)}
                        required
                      />
                      <span className="text-xs text-gray-500">Menit</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-end gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Amount (read-only)
                  </label>
                  <div className="h-9 flex items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-900">
                    {formatAmount(liveAmount)}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                {t("common.cancel")}
              </Button>
              {canWrite && (
                <Button type="submit" disabled={isSubmitting}>
                  {isNew
                    ? (isSubmitting ? t("common.submitting") : t("billableTime.submitNew"))
                    : (isSubmitting ? t("common.submitting") : t("billableTime.submitEdit"))}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
