import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
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
import { useSuppliers } from "@/hooks/use-suppliers";
import {
  PURCHASE_QUOTE_STATUSES,
  type CreatePurchaseQuoteInput,
  type PurchaseQuote,
  type PurchaseQuoteLineInput,
  type PurchaseQuoteStatus,
  useCreatePurchaseQuote,
  useDeletePurchaseQuote,
  usePurchaseQuote,
  usePurchaseQuotes,
  useUpdatePurchaseQuote,
} from "@/hooks/use-purchase-quotes";
import { getTodayDateString } from "@/hooks/use-purchase-orders";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/errors";
import { useFormatAmount } from "@/lib/format";

export const Route = createFileRoute("/businesses/$businessId/purchase-quotes")({
  validateSearch: z.object({
    convertFromQuote: z.string().optional(),
  }),
  component: PurchaseQuotesPage,
});

function StatusBadge({ status }: { status: PurchaseQuoteStatus }) {
  if (status === "Accepted") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 border border-green-200">
        Accepted
      </span>
    );
  }
  if (status === "Rejected") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 border border-red-200">
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 border border-gray-200">
      Draft
    </span>
  );
}

function PurchaseQuotesPage() {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const { businessId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseQuoteStatus | "">("");

  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = usePurchaseQuotes(
    businessId,
    page,
    {
      q: q || undefined,
      status: statusFilter || undefined,
    },
    10,
  );

  const deleteQuote = useDeletePurchaseQuote(businessId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalAmount = useMemo(
    () => data?.data.reduce((total, quote) => total + quote.totalAmount, 0) ?? 0,
    [data],
  );

  const handleDelete = async (quote: PurchaseQuote) => {
    const refText = quote.quoteNumber ? ` "${quote.quoteNumber}"` : "";
    if (
      !window.confirm(
        t("purchaseQuotes.deleteConfirm", { ref: refText, supplier: quote.supplierName }),
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      await deleteQuote.mutateAsync(quote.id);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
    }
  };

  const handleCopyToPO = (quote: PurchaseQuote) => {
    void navigate({
      to: "/businesses/$businessId/purchase-orders",
      params: { businessId },
      search: { convertFromQuote: quote.id },
    });
  };

  const handleCopyToInvoice = (quote: PurchaseQuote) => {
    void navigate({
      to: "/businesses/$businessId/purchase-invoices",
      params: { businessId },
      search: { convertFromQuote: quote.id },
    });
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t("purchaseQuotes.title")}</h1>
          {data && (
            <p className="text-sm text-gray-500">
              {t("purchaseQuotes.subtitle", { count: data.pagination.total })}
            </p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveQuoteId("new")}>
            {t("purchaseQuotes.newButton")}
          </Button>
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
          placeholder={t("purchaseQuotes.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as PurchaseQuoteStatus | "");
            setPage(1);
          }}
        >
          <option value="">{t("common.allStatuses")}</option>
          <option value="Draft">Draft</option>
          <option value="Accepted">Accepted</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">{t("purchaseQuotes.loading")}</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">
              {t("purchaseQuotes.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t("common.date")}</th>
                    <th className="px-6 py-3 font-medium">{t("purchaseQuotes.colQuoteNumber")}</th>
                    <th className="px-6 py-3 font-medium">{t("purchaseQuotes.colSupplier")}</th>
                    <th className="px-6 py-3 text-right font-medium">
                      {t("purchaseQuotes.colTotalAmount")}
                    </th>
                    <th className="px-6 py-3 font-medium">{t("common.colStatus")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((quote) => (
                    <tr key={quote.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{quote.date}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {quote.quoteNumber || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {quote.supplierName}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(quote.totalAmount)}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={quote.status} />
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveQuoteId(quote.id)}
                          >
                            {canWrite ? t("common.edit") : t("common.view")}
                          </Button>
                          {canWrite && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCopyToPO(quote)}
                              >
                                {t("purchaseQuotes.copyToPO")}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCopyToInvoice(quote)}
                              >
                                {t("purchaseQuotes.copyToInvoice")}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={deleteQuote.isPending}
                                onClick={() => void handleDelete(quote)}
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
                    <td colSpan={3} className="px-6 py-3 font-medium text-gray-900">
                      {t("common.total")}
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

      {activeQuoteId && (
        <PurchaseQuoteFormDialog
          businessId={businessId}
          quoteId={activeQuoteId}
          canWrite={canWrite}
          onClose={() => setActiveQuoteId(null)}
        />
      )}
    </div>
  );
}

interface FormLine {
  id: string;
  accountId: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

function computeLineTotal(line: FormLine): number {
  const qty = parseFloat(line.quantity) || 0;
  const price = parseFloat(line.unitPrice) || 0;
  return qty * price;
}

function createEmptyLine(): FormLine {
  return {
    id: Math.random().toString(36).substring(2, 9),
    accountId: "",
    description: "",
    quantity: "1",
    unitPrice: "0",
  };
}

interface PurchaseQuoteFormDialogProps {
  businessId: string;
  quoteId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function PurchaseQuoteFormDialog({
  businessId,
  quoteId,
  canWrite,
  onClose,
}: PurchaseQuoteFormDialogProps) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const isNew = quoteId === "new";
  const { data: existingQuote, isPending: isQuoteLoading } = usePurchaseQuote(
    businessId,
    isNew ? null : quoteId,
  );

  const { data: suppliersData, isPending: isSuppliersLoading } = useSuppliers(
    businessId,
    1,
    {},
    100,
  );

  const { data: accountsData, isPending: isAccountsLoading } = useAccounts(
    businessId,
    1,
    { category: "Expense" },
    100,
  );

  const createQuote = useCreatePurchaseQuote(businessId);
  const updateQuote = useUpdatePurchaseQuote(businessId);

  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(getTodayDateString());
  const [quoteNumber, setQuoteNumber] = useState("");
  const [status, setStatus] = useState<PurchaseQuoteStatus>("Draft");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<FormLine[]>([createEmptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && existingQuote) {
      setSupplierId(existingQuote.supplierId);
      setDate(existingQuote.date);
      setQuoteNumber(existingQuote.quoteNumber ?? "");
      setStatus(existingQuote.status);
      setDescription(existingQuote.description ?? "");

      if (existingQuote.lines && existingQuote.lines.length > 0) {
        setLines(
          existingQuote.lines.map((line) => ({
            id: line.id || Math.random().toString(36).substring(2, 9),
            accountId: line.accountId,
            description: line.description ?? "",
            quantity: String(line.quantity),
            unitPrice: String(line.unitPrice),
          })),
        );
      }
    }
  }, [isNew, existingQuote]);

  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLine()]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateLine = (index: number, field: keyof FormLine, value: string) => {
    setLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, [field]: value } : line)),
    );
  };

  const liveTotalAmount = useMemo(() => {
    return lines.reduce((sum, line) => sum + computeLineTotal(line), 0);
  }, [lines]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!supplierId) {
      setFormError(t("common.supplierRequired"));
      return;
    }

    const finalDate = date.trim() || getTodayDateString();

    if (lines.length === 0) {
      setFormError(t("purchaseQuotes.validationMinLines"));
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.accountId) {
        setFormError(t("purchaseQuotes.validationAccountLine", { index: i + 1 }));
        return;
      }
      const qty = parseFloat(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        setFormError(`Baris #${i + 1}: Kuantitas harus lebih dari 0.`);
        return;
      }
      const price = parseFloat(line.unitPrice);
      if (!Number.isFinite(price) || price < 0) {
        setFormError(`Baris #${i + 1}: Harga satuan tidak boleh negatif.`);
        return;
      }
    }

    const formattedLines: PurchaseQuoteLineInput[] = lines.map((l) => ({
      accountId: l.accountId,
      description: l.description.trim() || null,
      quantity: parseFloat(l.quantity) || 1,
      unitPrice: parseFloat(l.unitPrice) || 0,
    }));

    try {
      if (isNew) {
        const input: CreatePurchaseQuoteInput = {
          supplierId,
          date: finalDate,
          quoteNumber: quoteNumber.trim() || null,
          description: description.trim() || null,
          status,
          lines: formattedLines,
        };
        await createQuote.mutateAsync(input);
      } else {
        await updateQuote.mutateAsync({
          quoteId,
          supplierId,
          date: finalDate,
          quoteNumber: quoteNumber.trim() || null,
          description: description.trim() || null,
          status,
          lines: formattedLines,
        });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createQuote.isPending || updateQuote.isPending;
  const isInitialLoading = !isNew && isQuoteLoading;
  const expenseAccounts = accountsData?.data ?? [];

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew
              ? t("purchaseQuotes.dialogTitleNew")
              : canWrite
                ? t("purchaseQuotes.dialogTitleEdit")
                : t("purchaseQuotes.dialogTitleDetail")}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? t("purchaseQuotes.dialogDescNew")
              : t("purchaseQuotes.dialogDescEdit")}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            {t("purchaseQuotes.loadingDetail")}
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
                    {t("purchaseQuotes.fieldSupplier")} *
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={supplierId}
                    disabled={!canWrite || isSuppliersLoading}
                    onChange={(event) => setSupplierId(event.target.value)}
                    required
                  >
                    <option value="">{t("debitNotes.supplierPlaceholder")}</option>
                    {suppliersData?.data.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.code ? `(${c.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("purchaseQuotes.fieldDate")} *
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
                    {t("purchaseQuotes.fieldQuoteNumber")}
                  </label>
                  <Input
                    placeholder={t("purchaseQuotes.placeholderQuoteNumber")}
                    value={quoteNumber}
                    disabled={!canWrite}
                    onChange={(event) => setQuoteNumber(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("common.colStatus")} *
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={status}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setStatus(event.target.value as PurchaseQuoteStatus)
                    }
                    required
                  >
                    {PURCHASE_QUOTE_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("purchaseQuotes.fieldSummary")}
                  </label>
                  <textarea
                    className="min-h-9 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    placeholder={t("purchaseQuotes.placeholderSummary")}
                    rows={2}
                    value={description}
                    disabled={!canWrite}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {t("purchaseQuotes.linesTitle")}
                  </h3>
                  {canWrite && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addLine}
                    >
                      + {t("common.addLine")}
                    </Button>
                  )}
                </div>

                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-gray-50 uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2 font-medium min-w-[200px]">
                          {t("purchaseQuotes.colAccount")} *
                        </th>
                        <th className="px-3 py-2 font-medium min-w-[180px]">
                          Description
                        </th>
                        <th className="px-3 py-2 font-medium w-24">{t("common.qty")} *</th>
                        <th className="px-3 py-2 font-medium w-36">{t("purchaseQuotes.colUnitPrice")} *</th>
                        <th className="px-3 py-2 text-right font-medium w-36">
                          {t("common.total")}
                        </th>
                        {canWrite && (
                          <th className="px-3 py-2 text-center font-medium w-16">
                            {t("common.delete")}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((line, index) => {
                        const lineTotal = computeLineTotal(line);
                        return (
                          <tr key={line.id} className="hover:bg-gray-50">
                            <td className="p-2">
                                                              <Combobox
                                  className="h-8 text-xs"
                                  ariaLabel={t("common.accountRowAria", { index: index + 1 })}
                                  value={line.accountId}
                                  disabled={!canWrite || isAccountsLoading}
                                  onChange={(value) =>
                                    updateLine(index, "accountId", value)
                                  }
                                  placeholder={t("common.accountPlaceholder")}
                                  options={expenseAccounts.map((acc) => ({
                                    value: acc.id,
                                    label: `${acc.code} - ${acc.name}`,
                                  }))}
                                />
                              {expenseAccounts.length === 0 &&
                                !isAccountsLoading && (
                                  <p className="mt-0.5 text-[10px] text-amber-600">
                                    Belum ada akun kategori Expense
                                  </p>
                                )}
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                placeholder={t("purchaseQuotes.lineDescriptionPlaceholder")}
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
                                min="0.0001"
                                className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                value={line.quantity}
                                disabled={!canWrite}
                                onChange={(event) =>
                                  updateLine(index, "quantity", event.target.value)
                                }
                                required
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                value={line.unitPrice}
                                disabled={!canWrite}
                                onChange={(event) =>
                                  updateLine(index, "unitPrice", event.target.value)
                                }
                                required
                              />
                            </td>
                            <td className="p-2 text-right font-medium text-gray-900">
                              {formatAmount(lineTotal)}
                            </td>
                            {canWrite && (
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  className="text-red-600 hover:text-red-800 disabled:text-gray-400"
                                  disabled={lines.length <= 1}
                                  onClick={() => removeLine(index)}
                                >
                                  ✕
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-end gap-6">
                  <div className="text-right">
                    <div className="text-xs text-gray-500">{t("common.total")}</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatAmount(liveTotalAmount)}
                    </div>
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
                    ? (isSubmitting ? t("common.submitting") : t("purchaseQuotes.submitNew"))
                    : (isSubmitting ? t("common.submitting") : t("purchaseQuotes.submitEdit"))}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
