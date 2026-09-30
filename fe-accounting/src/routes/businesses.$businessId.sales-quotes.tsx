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
import { useCustomers } from "@/hooks/use-customers";
import {
  getTodayDateString,
  type SalesQuote,
  type SalesQuoteLineInput,
  useCreateSalesQuote,
  useDeleteSalesQuote,
  useSalesQuote,
  useSalesQuotes,
  useUpdateSalesQuote,
} from "@/hooks/use-sales-quotes";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/sales-quotes")({
  component: SalesQuotesPage,
});

function formatAmount(value: number) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function addDaysToDateString(dateStr: string, days: number): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return "";
  const [y, m, d] = parts;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function SalesQuotesPage() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useSalesQuotes(businessId, page, {
    q: q || undefined,
  }, 10);

  const deleteQuote = useDeleteSalesQuote(businessId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalAmount = useMemo(
    () => data?.data.reduce((total, quote) => total + quote.totalAmount, 0) ?? 0,
    [data],
  );

  const handleDelete = async (quote: SalesQuote) => {
    const refText = quote.reference ? ` "${quote.reference}"` : "";
    if (
      !window.confirm(
        `Hapus penawaran${refText} untuk pelanggan "${quote.customerName}"?`,
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

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Sales Quotes</h1>
          {data && (
            <p className="text-sm text-gray-500">{data.pagination.total} penawaran</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveQuoteId("new")}>Penawaran Baru</Button>
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
          placeholder="Cari referensi, pelanggan, keterangan..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat penawaran...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada penawaran.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Issue Date</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Customer</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 text-right font-medium">
                      Total Amount
                    </th>
                    <th className="px-6 py-3 font-medium">Expiry Date</th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((quote) => (
                    <tr key={quote.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{quote.issueDate}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {quote.reference || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {quote.customerName}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {quote.description || "-"}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(quote.totalAmount)}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {quote.expiryDate || "-"}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveQuoteId(quote.id)}
                          >
                            {canWrite ? "Edit" : "Lihat"}
                          </Button>
                          {canWrite && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteQuote.isPending}
                              onClick={() => void handleDelete(quote)}
                            >
                              Hapus
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

      {activeQuoteId && (
        <SalesQuoteFormDialog
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
    description: "",
    quantity: "1",
    unitPrice: "0",
  };
}

interface SalesQuoteFormDialogProps {
  businessId: string;
  quoteId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function SalesQuoteFormDialog({
  businessId,
  quoteId,
  canWrite,
  onClose,
}: SalesQuoteFormDialogProps) {
  const isNew = quoteId === "new";
  const { data: existingQuote, isPending: isQuoteLoading } = useSalesQuote(
    businessId,
    isNew ? null : quoteId,
  );

  const { data: customersData, isPending: isCustomersLoading } = useCustomers(
    businessId,
    1,
    {},
    100,
  );

  const createQuote = useCreateSalesQuote(businessId);
  const updateQuote = useUpdateSalesQuote(businessId);

  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(getTodayDateString());
  const [validForDays, setValidForDays] = useState("");
  const [reference, setReference] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<FormLine[]>([createEmptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);

  // Inisialisasi form saat mode edit selesai memuat data penawaran
  useEffect(() => {
    if (!isNew && existingQuote) {
      setCustomerId(existingQuote.customerId);
      setIssueDate(existingQuote.issueDate);
      setValidForDays(
        existingQuote.validForDays == null ? "" : String(existingQuote.validForDays),
      );
      setReference(existingQuote.reference ?? "");
      setBillingAddress(existingQuote.billingAddress ?? "");
      setDescription(existingQuote.description ?? "");

      if (existingQuote.lines && existingQuote.lines.length > 0) {
        setLines(
          existingQuote.lines.map((line) => ({
            id: line.id || Math.random().toString(36).substring(2, 9),
            description: line.description ?? "",
            quantity: String(line.quantity),
            unitPrice: String(line.unitPrice),
          })),
        );
      }
    }
  }, [isNew, existingQuote]);

  // Perubahan customer: auto-fill billingAddress (pola sama dgn modul lain)
  const handleCustomerChange = (newCustomerId: string) => {
    setCustomerId(newCustomerId);
    const selectedCust = customersData?.data.find((c) => c.id === newCustomerId);
    if (selectedCust && (!billingAddress || isNew)) {
      setBillingAddress(selectedCust.billingAddress ?? "");
    }
  };

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

  const liveTotalAmount = useMemo(
    () => lines.reduce((sum, line) => sum + computeLineTotal(line), 0),
    [lines],
  );

  const parsedValidForDays = validForDays.trim()
    ? Number.parseInt(validForDays.trim(), 10)
    : null;

  // Expiry Date live (read-only) — hanya kalau Valid For diisi
  const liveExpiryDate =
    parsedValidForDays != null &&
    Number.isInteger(parsedValidForDays) &&
    parsedValidForDays > 0
      ? addDaysToDateString(issueDate, parsedValidForDays)
      : "";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!customerId) {
      setFormError("Pelanggan wajib dipilih.");
      return;
    }

    if (!issueDate) {
      setFormError("Issue Date wajib diisi.");
      return;
    }

    if (parsedValidForDays != null && (!Number.isInteger(parsedValidForDays) || parsedValidForDays <= 0)) {
      setFormError("Valid For harus bilangan bulat lebih dari 0 hari.");
      return;
    }

    if (lines.length === 0) {
      setFormError("Penawaran wajib memiliki minimal 1 baris item.");
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.description.trim()) {
        setFormError(`Baris #${i + 1}: Deskripsi item wajib diisi.`);
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

    const formattedLines: SalesQuoteLineInput[] = lines.map((l) => ({
      description: l.description.trim(),
      quantity: parseFloat(l.quantity) || 1,
      unitPrice: parseFloat(l.unitPrice) || 0,
    }));

    try {
      if (isNew) {
        await createQuote.mutateAsync({
          customerId,
          issueDate,
          validForDays: parsedValidForDays,
          reference: reference.trim() || undefined,
          billingAddress: billingAddress.trim() || undefined,
          description: description.trim() || undefined,
          lines: formattedLines,
        });
      } else {
        await updateQuote.mutateAsync({
          quoteId,
          customerId,
          issueDate,
          validForDays: parsedValidForDays,
          reference: reference.trim() || null,
          billingAddress: billingAddress.trim() || null,
          description: description.trim() || null,
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

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew ? "Penawaran Baru" : canWrite ? "Edit Penawaran" : "Detail Penawaran"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Buat penawaran harga. Penawaran tidak memposting jurnal apa pun."
              : "Lihat atau perbarui penawaran beserta baris itemnya."}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            Memuat data penawaran...
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
                    Issue Date *
                  </label>
                  <Input
                    type="date"
                    value={issueDate}
                    disabled={!canWrite}
                    onChange={(event) => setIssueDate(event.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Customer *
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={customerId}
                    disabled={!canWrite || isCustomersLoading}
                    onChange={(event) => handleCustomerChange(event.target.value)}
                    required
                  >
                    <option value="">-- Pilih Pelanggan --</option>
                    {customersData?.data.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.code ? `(${c.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Valid For (hari)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Contoh: 14"
                    value={validForDays}
                    disabled={!canWrite}
                    onChange={(event) => setValidForDays(event.target.value)}
                  />
                  <div className="text-xs text-gray-500">
                    Expiry Date:{" "}
                    <span className="font-medium text-gray-700">
                      {liveExpiryDate || "-"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Reference
                  </label>
                  <Input
                    placeholder="Contoh: QTE-2026-0042"
                    value={reference}
                    disabled={!canWrite}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Billing Address
                  </label>
                  <textarea
                    className="min-h-9 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    placeholder="Otomatis dari alamat pelanggan (bisa diedit)"
                    rows={2}
                    value={billingAddress}
                    disabled={!canWrite}
                    onChange={(event) => setBillingAddress(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1 md:col-span-3">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Description
                  </label>
                  <Input
                    placeholder="Keterangan umum penawaran (opsional)"
                    value={description}
                    disabled={!canWrite}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Baris Item Penawaran
                  </h3>
                  {canWrite && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addLine}
                    >
                      + Tambah Baris
                    </Button>
                  )}
                </div>

                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-gray-50 uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2 font-medium min-w-[260px]">
                          Description *
                        </th>
                        <th className="px-3 py-2 font-medium w-28">Qty *</th>
                        <th className="px-3 py-2 font-medium w-40">Unit Price *</th>
                        <th className="px-3 py-2 text-right font-medium w-40">
                          Total
                        </th>
                        {canWrite && (
                          <th className="px-3 py-2 text-center font-medium w-16">
                            Hapus
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((line, index) => (
                        <tr key={line.id} className="hover:bg-gray-50">
                          <td className="p-2">
                            <input
                              type="text"
                              className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                              placeholder="Nama barang/jasa yang ditawarkan"
                              value={line.description}
                              disabled={!canWrite}
                              onChange={(event) =>
                                updateLine(index, "description", event.target.value)
                              }
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="any"
                              min="0.0001"
                              className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 text-right"
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
                              className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 text-right"
                              value={line.unitPrice}
                              disabled={!canWrite}
                              onChange={(event) =>
                                updateLine(index, "unitPrice", event.target.value)
                              }
                              required
                            />
                          </td>
                          <td className="p-2 text-right font-medium text-gray-900">
                            {formatAmount(computeLineTotal(line))}
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
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-end gap-6">
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Total Penawaran</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatAmount(liveTotalAmount)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Batal
              </Button>
              {canWrite && (
                <Button type="submit" disabled={isSubmitting}>
                  {isNew
                    ? (isSubmitting ? "Menyimpan..." : "Simpan Penawaran")
                    : (isSubmitting ? "Menyimpan..." : "Perbarui Penawaran")}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
