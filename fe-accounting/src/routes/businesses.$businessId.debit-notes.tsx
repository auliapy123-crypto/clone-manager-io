import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
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
import { useAccounts } from "@/hooks/use-accounts";
import { useBusinesses } from "@/hooks/use-businesses";
import {
  getTodayDateString,
  type DebitNote,
  type DebitNoteLineInput,
  useCopyDebitNote,
  useCreateDebitNote,
  useDebitNote,
  useDebitNotes,
  useDeleteDebitNote,
  useUpdateDebitNote,
} from "@/hooks/use-debit-notes";
import { usePurchaseInvoices } from "@/hooks/use-purchase-invoices";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/errors";
import { useFormatAmount } from "@/lib/format";

export const Route = createFileRoute("/businesses/$businessId/debit-notes")({
  component: DebitNotesPage,
});

function DebitNotesPage() {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useDebitNotes(
    businessId,
    page,
    q || undefined,
    10,
  );
  const deleteNote = useDeleteDebitNote(businessId);
  const copyNote = useCopyDebitNote(businessId);

  const totalAmount = useMemo(
    () => data?.data.reduce((total, note) => total + note.totalAmount, 0) ?? 0,
    [data],
  );

  const handleDelete = async (note: DebitNote) => {
    const refText = note.debitNoteNumber ? ` "${note.debitNoteNumber}"` : "";
    if (
      !window.confirm(
        t("debitNotes.deleteConfirm", { ref: refText, supplier: note.supplierName }),
      )
    ) {
      return;
    }
    setNotice(null);
    setActionError(null);
    try {
      await deleteNote.mutateAsync(note.id);
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  const handleCopy = async (note: DebitNote) => {
    setNotice(null);
    setActionError(null);
    try {
      const copied = await copyNote.mutateAsync(note.id);
      setNotice(
        t("debitNotes.copyNotice", {
          number: copied.debitNoteNumber ?? copied.id.slice(0, 8),
          date: copied.date,
        }),
      );
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t("debitNotes.title")}</h1>
          {data && (
            <p className="text-sm text-gray-500">{t("debitNotes.subtitle", { count: data.pagination.total })}</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveNoteId("new")}>{t("debitNotes.newButton")}</Button>
        )}
      </div>

      {notice && (
        <div role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-700">
          {notice}
        </div>
      )}

      {actionError && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <Input
        className="max-w-xs"
        placeholder={t("debitNotes.searchPlaceholder")}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">{t("debitNotes.loading")}</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">{t("debitNotes.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t("common.date")}</th>
                    <th className="px-6 py-3 font-medium">{t("debitNotes.colNumber")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.supplier")}</th>
                    <th className="px-6 py-3 font-medium">{t("debitNotes.colPurchaseInvoice")}</th>
                    <th className="px-6 py-3 text-right font-medium">{t("common.total")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((note) => (
                    <tr key={note.id} className="border-b hover:bg-gray-50">
                      <td className="px-6 py-4">{note.date}</td>
                      <td className="px-6 py-4">{note.debitNoteNumber || "-"}</td>
                      <td className="px-6 py-4">{note.supplierName}</td>
                      <td className="px-6 py-4">
                        {note.purchaseInvoiceId
                          ? (note.purchaseInvoiceReference ??
                            note.purchaseInvoiceId.slice(0, 8))
                          : "-"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {formatAmount(note.totalAmount)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {canWrite ? (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setActiveNoteId(note.id)}
                            >
                              {t("common.edit")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={copyNote.isPending}
                              onClick={() => handleCopy(note)}
                            >
                              {t("debitNotes.copyButton")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(note)}
                            >
                              {t("common.delete")}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveNoteId(note.id)}
                          >
                            {t("debitNotes.detailButton")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-6 py-4 font-medium text-gray-900">
                      {t("common.total")}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                      {formatAmount(totalAmount)}
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

      {activeNoteId && (
        <DebitNoteFormDialog
          businessId={businessId}
          noteId={activeNoteId === "new" ? null : activeNoteId}
          onClose={() => setActiveNoteId(null)}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}

function DebitNoteFormDialog({
  businessId,
  noteId,
  onClose,
  canWrite,
}: {
  businessId: string;
  noteId: string | null;
  onClose: () => void;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const { data: note, isLoading } = useDebitNote(businessId, noteId);
  const { data: suppliers } = useSuppliers(businessId, 1, {}, 100);
  // Filter kategori Expense di server (pageSize > 100 selalu ditolak
  // backend dengan 400, jadi jangan naikkan angkanya).
  const { data: accounts } = useAccounts(
    businessId,
    1,
    { category: "Expense" },
    100,
  );
  // Faktur pembelian difilter per supplier terpilih di sisi klien.
  const { data: purchaseInvoices } = usePurchaseInvoices(businessId, 1, {}, 100);

  const createMutation = useCreateDebitNote(businessId);
  const updateMutation = useUpdateDebitNote(businessId);

  const [formData, setFormData] = useState({
    supplierId: "",
    date: getTodayDateString(),
    debitNoteNumber: "",
    purchaseInvoiceId: "",
    description: "",
    lines: [
      { accountId: "", description: "", quantity: 1, unitPrice: 0 },
    ] as DebitNoteLineInput[],
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (note) {
      setFormData({
        supplierId: note.supplierId,
        date: note.date,
        debitNoteNumber: note.debitNoteNumber || "",
        purchaseInvoiceId: note.purchaseInvoiceId || "",
        description: note.description || "",
        lines: note.lines.map((l) => ({
          accountId: l.accountId,
          description: l.description || "",
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      });
    }
  }, [note]);

  const expenseAccounts = useMemo(() => accounts?.data ?? [], [accounts]);

  const supplierInvoices = useMemo(
    () =>
      (purchaseInvoices?.data ?? []).filter(
        (invoice) => invoice.supplierId === formData.supplierId,
      ),
    [purchaseInvoices, formData.supplierId],
  );

  const totalAmount = useMemo(
    () =>
      formData.lines.reduce(
        (sum, line) => sum + line.quantity * line.unitPrice,
        0,
      ),
    [formData.lines],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);

    try {
      if (!formData.supplierId) {
        setFormError(t("common.supplierRequired"));
        return;
      }

      if (formData.lines.length === 0) {
        setFormError(t("common.minLinesRequired"));
        return;
      }

      for (const line of formData.lines) {
        if (!line.accountId) {
          setFormError(t("common.accountRequiredPerLine"));
          return;
        }
        if (line.quantity <= 0) {
          setFormError(t("common.qtyPositive"));
          return;
        }
      }

      const payload = {
        supplierId: formData.supplierId,
        date: formData.date,
        debitNoteNumber: formData.debitNoteNumber.trim() || null,
        purchaseInvoiceId: formData.purchaseInvoiceId || null,
        description: formData.description || null,
        lines: formData.lines,
      };

      if (noteId) {
        await updateMutation.mutateAsync({ debitNoteId: noteId, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }

      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [
        ...formData.lines,
        { accountId: "", description: "", quantity: 1, unitPrice: 0 },
      ],
    });
  };

  const removeLine = (index: number) => {
    setFormData({
      ...formData,
      lines: formData.lines.filter((_, i) => i !== index),
    });
  };

  const updateLine = (index: number, field: string, value: unknown) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setFormData({ ...formData, lines: newLines });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{noteId ? t("debitNotes.dialogTitleEdit") : t("debitNotes.dialogTitleNew")}</DialogTitle>
          <DialogDescription>
            {noteId
              ? t("debitNotes.dialogDescEdit")
              : t("debitNotes.dialogDescNew")}
          </DialogDescription>
        </DialogHeader>

        {formError && (
          <div role="alert" className="shrink-0 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {formError}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-gray-500">{t("common.loadingData")}</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("common.date")} *
                </label>
                <input
                  type="date"
                  disabled={!canWrite || isSaving}
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("debitNotes.fieldNumber")}
                </label>
                <input
                  type="text"
                  disabled={!canWrite || isSaving}
                  value={formData.debitNoteNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, debitNoteNumber: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("common.supplier")} *
                </label>
                <select
                  disabled={!canWrite || isSaving}
                  value={formData.supplierId}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      supplierId: e.target.value,
                      // Ganti supplier -> faktur yang menempel direset,
                      // karena faktur itu belum tentu milik supplier baru.
                      purchaseInvoiceId: "",
                    })
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                >
                  <option value="">{t("debitNotes.supplierPlaceholder")}</option>                  {suppliers?.data.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t("debitNotes.colPurchaseInvoice")}
                </label>
                <select
                  disabled={!canWrite || isSaving || !formData.supplierId}
                  value={formData.purchaseInvoiceId}
                  onChange={(e) =>
                    setFormData({ ...formData, purchaseInvoiceId: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                >
                  <option value="">
                    {formData.supplierId
                      ? t("debitNotes.invoicePlaceholderNone")
                      : t("debitNotes.invoicePlaceholderPickSupplier")}
                  </option>
                  {supplierInvoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.reference || invoice.id.slice(0, 8)} ({invoice.issueDate})
                    </option>
                  ))}
                </select>
                {formData.supplierId && supplierInvoices.length === 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    {t("debitNotes.noActiveInvoices")}
                  </p>
                )}
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  {t("debitNotes.fieldDescription")}
                </label>
                <textarea
                  disabled={!canWrite || isSaving}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={2}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  {t("debitNotes.linesTitle")}
                </label>
                {canWrite && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLine}
                    disabled={isSaving}
                  >
                    {t("common.addLine")}
                  </Button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="min-w-[200px] px-3 py-2 whitespace-nowrap">{t("debitNotes.colAccount")}</th>
                      <th className="min-w-[150px] px-3 py-2">{t("common.description")}</th>
                      <th className="px-3 py-2 text-right">{t("common.qty")}</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">{t("debitNotes.colUnitPrice")}</th>
                      <th className="px-3 py-2 text-right">{t("common.total")}</th>
                      {canWrite && <th className="px-3 py-2">{t("common.colActions")}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {formData.lines.map((line, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="px-3 py-2">
                          <Combobox
                            className="h-8 text-xs"
                            ariaLabel={t("common.accountRowAria", { index: idx + 1 })}
                            value={line.accountId}
                            disabled={!canWrite || isSaving}
                            onChange={(value) => updateLine(idx, "accountId", value)}
                            placeholder={t("common.accountPlaceholder")}
                            options={expenseAccounts.map((a) => ({
                              value: a.id,
                              label: `${a.code} - ${a.name}`,
                            }))}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            disabled={!canWrite || isSaving}
                            value={line.description ?? ""}
                            onChange={(e) =>
                              updateLine(idx, "description", e.target.value)
                            }
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            disabled={!canWrite || isSaving}
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(
                                idx,
                                "quantity",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            step="0.0001"
                            min="0"
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm disabled:bg-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            disabled={!canWrite || isSaving}
                            value={line.unitPrice}
                            onChange={(e) =>
                              updateLine(
                                idx,
                                "unitPrice",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            step="0.01"
                            min="0"
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm disabled:bg-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatAmount(line.quantity * line.unitPrice)}
                        </td>
                        {canWrite && (
                          <td className="px-3 py-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeLine(idx)}
                              disabled={formData.lines.length === 1 || isSaving}
                            >
                              {t("common.removeLine")}
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-gray-50">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 font-medium text-gray-900">
                        {t("common.total")}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {formatAmount(totalAmount)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            </div>

            <DialogFooter className="shrink-0 border-t pt-3">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                Batal
              </Button>
              {canWrite && (
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? t("common.submitting") : noteId ? t("debitNotes.submitEdit") : t("debitNotes.submitNew")}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
