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
import { useAccounts } from "@/hooks/use-accounts";
import { useBusinesses } from "@/hooks/use-businesses";
import { useSuppliers } from "@/hooks/use-suppliers";
import {
  getTodayDateString,
  type PurchaseInvoice,
  type PurchaseInvoiceLineInput,
  type PurchaseInvoiceStatus,
  useCreatePurchaseInvoice,
  useDeletePurchaseInvoice,
  usePurchaseInvoice,
  usePurchaseInvoices,
  useUpdatePurchaseInvoice,
} from "@/hooks/use-purchase-invoices";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/purchase-invoices")({
  component: PurchaseInvoicesPage,
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

function StatusBadge({ status }: { status: PurchaseInvoiceStatus }) {
  if (status === "Paid") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 border border-green-200">
        Paid
      </span>
    );
  }
  if (status === "Overdue") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 border border-red-200">
        Overdue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 border border-yellow-200">
      Unpaid
    </span>
  );
}

function PurchaseInvoicesPage() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseInvoiceStatus | "">("");

  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = usePurchaseInvoices(businessId, page, {
    q: q || undefined,
    status: statusFilter || undefined,
  });

  const deleteInvoice = useDeletePurchaseInvoice(businessId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalInvoiceAmount = useMemo(
    () => data?.data.reduce((total, inv) => total + inv.invoiceAmount, 0) ?? 0,
    [data],
  );

  const totalBalanceDue = useMemo(
    () => data?.data.reduce((total, inv) => total + inv.balanceDue, 0) ?? 0,
    [data],
  );

  const handleDelete = async (invoice: PurchaseInvoice) => {
    const refText = invoice.reference ? ` "${invoice.reference}"` : "";
    if (
      !window.confirm(
        `Hapus faktur${refText} untuk supplier "${invoice.supplierName}"? Jurnal terkait juga akan dihapus.`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      await deleteInvoice.mutateAsync(invoice.id);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Purchase Invoices</h1>
          {data && (
            <p className="text-sm text-gray-500">{data.pagination.total} faktur</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveInvoiceId("new")}>Buat Faktur</Button>
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
          placeholder="Cari referensi, supplier, keterangan..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as PurchaseInvoiceStatus | "");
            setPage(1);
          }}
        >
          <option value="">Semua Status</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Overdue">Overdue</option>
          <option value="Paid">Paid</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat faktur pembelian...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada faktur pembelian.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Supplier</th>
                    <th className="px-6 py-3 font-medium">Issue Date</th>
                    <th className="px-6 py-3 font-medium">Due Date</th>
                    <th className="px-6 py-3 text-right font-medium">
                      Invoice Amount
                    </th>
                    <th className="px-6 py-3 text-right font-medium">
                      Balance Due
                    </th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {invoice.reference || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {invoice.supplierName}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {invoice.issueDate}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {invoice.dueDate || "-"}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(invoice.invoiceAmount)}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(invoice.balanceDue)}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveInvoiceId(invoice.id)}
                          >
                            {canWrite ? "Edit" : "Lihat"}
                          </Button>
                          {canWrite && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteInvoice.isPending}
                              onClick={() => void handleDelete(invoice)}
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
                      {formatAmount(totalInvoiceAmount)}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">
                      {formatAmount(totalBalanceDue)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Sebelumnya
          </Button>
          <span className="text-sm text-gray-500">
            Halaman {data.pagination.currentPage} dari {data.pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Berikutnya
          </Button>
        </div>
      )}

      {activeInvoiceId && (
        <PurchaseInvoiceFormDialog
          businessId={businessId}
          invoiceId={activeInvoiceId}
          canWrite={canWrite}
          onClose={() => setActiveInvoiceId(null)}
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

function computeLineSubtotal(line: FormLine): number {
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

interface PurchaseInvoiceFormDialogProps {
  businessId: string;
  invoiceId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function PurchaseInvoiceFormDialog({
  businessId,
  invoiceId,
  canWrite,
  onClose,
}: PurchaseInvoiceFormDialogProps) {
  const isNew = invoiceId === "new";
  const { data: existingInvoice, isPending: isInvoiceLoading } = usePurchaseInvoice(
    businessId,
    isNew ? null : invoiceId,
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

  const createInvoice = useCreatePurchaseInvoice(businessId);
  const updateInvoice = useUpdatePurchaseInvoice(businessId);

  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [issueDate, setIssueDate] = useState(getTodayDateString());
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [lines, setLines] = useState<FormLine[]>([createEmptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && existingInvoice) {
      setSupplierId(existingInvoice.supplierId);
      setReference(existingInvoice.reference ?? "");
      setIssueDate(existingInvoice.issueDate);
      setDueDate(existingInvoice.dueDate ?? "");
      setDescription(existingInvoice.description ?? "");
      setQuoteNumber(existingInvoice.quoteNumber ?? "");
      setOrderNumber(existingInvoice.orderNumber ?? "");

      if (existingInvoice.lines && existingInvoice.lines.length > 0) {
        setLines(
          existingInvoice.lines.map((line) => ({
            id: line.id || Math.random().toString(36).substring(2, 9),
            accountId: line.accountId,
            description: line.description ?? "",
            quantity: String(line.quantity),
            unitPrice: String(line.unitPrice),
          })),
        );
      }
    }
  }, [isNew, existingInvoice]);

  const handleSupplierChange = (newSupplierId: string) => {
    setSupplierId(newSupplierId);
    const selectedSupp = suppliersData?.data.find((c) => c.id === newSupplierId);
    if (selectedSupp) {
      if (
        selectedSupp.purchaseInvoiceDueDateDays != null &&
        selectedSupp.purchaseInvoiceDueDateDays > 0 &&
        (!dueDate || isNew)
      ) {
        setDueDate(
          addDaysToDateString(
            issueDate || getTodayDateString(),
            selectedSupp.purchaseInvoiceDueDateDays,
          ),
        );
      }
    }
  };

  const handleIssueDateChange = (newIssueDate: string) => {
    setIssueDate(newIssueDate);
    const selectedSupp = suppliersData?.data.find((c) => c.id === supplierId);
    if (
      selectedSupp &&
      selectedSupp.purchaseInvoiceDueDateDays != null &&
      selectedSupp.purchaseInvoiceDueDateDays > 0
    ) {
      setDueDate(
        addDaysToDateString(newIssueDate, selectedSupp.purchaseInvoiceDueDateDays),
      );
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

  const liveTotalInvoiceAmount = useMemo(() => {
    return lines.reduce((sum, line) => sum + computeLineSubtotal(line), 0);
  }, [lines]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!supplierId) {
      setFormError("Supplier wajib dipilih.");
      return;
    }

    const finalIssueDate = issueDate.trim() || getTodayDateString();

    if (lines.length === 0) {
      setFormError("Faktur wajib memiliki minimal 1 baris item.");
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.accountId) {
        setFormError(`Baris #${i + 1}: Akun beban wajib dipilih.`);
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

    const formattedLines: PurchaseInvoiceLineInput[] = lines.map((l) => ({
      accountId: l.accountId,
      description: l.description.trim() || null,
      quantity: parseFloat(l.quantity) || 1,
      unitPrice: parseFloat(l.unitPrice) || 0,
    }));

    try {
      if (isNew) {
        await createInvoice.mutateAsync({
          supplierId,
          reference: reference.trim() || undefined,
          issueDate: finalIssueDate,
          dueDate: dueDate.trim() || undefined,
          description: description.trim() || undefined,
          quoteNumber: quoteNumber.trim() || undefined,
          orderNumber: orderNumber.trim() || undefined,
          lines: formattedLines,
        });
      } else {
        await updateInvoice.mutateAsync({
          invoiceId,
          supplierId,
          reference: reference.trim() || null,
          issueDate: finalIssueDate,
          dueDate: dueDate.trim() || null,
          description: description.trim() || null,
          quoteNumber: quoteNumber.trim() || null,
          orderNumber: orderNumber.trim() || null,
          lines: formattedLines,
        });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createInvoice.isPending || updateInvoice.isPending;
  const isInitialLoading = !isNew && isInvoiceLoading;
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
              ? "Buat Faktur Pembelian"
              : canWrite
                ? "Edit Faktur Pembelian"
                : "Detail Faktur Pembelian"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Buat faktur baru. Jurnal utang usaha dan beban akan otomatis diposting."
              : "Lihat atau perbarui faktur pembelian beserta baris itemnya."}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            Memuat data faktur...
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
                    Supplier *
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={supplierId}
                    disabled={!canWrite || isSuppliersLoading}
                    onChange={(event) => handleSupplierChange(event.target.value)}
                    required
                  >
                    <option value="">-- Pilih Supplier --</option>
                    {suppliersData?.data.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.code ? `(${c.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Reference
                  </label>
                  <Input
                    placeholder="Contoh: PI-2026-001"
                    value={reference}
                    disabled={!canWrite}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Issue Date *
                  </label>
                  <Input
                    type="date"
                    value={issueDate}
                    disabled={!canWrite}
                    onChange={(event) => handleIssueDateChange(event.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Due Date
                  </label>
                  <Input
                    type="date"
                    value={dueDate}
                    disabled={!canWrite}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Quote Number
                  </label>
                  <Input
                    placeholder="Quote reference (opsional)"
                    value={quoteNumber}
                    disabled={!canWrite}
                    onChange={(event) => setQuoteNumber(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Order Number
                  </label>
                  <Input
                    placeholder="Order reference (opsional)"
                    value={orderNumber}
                    disabled={!canWrite}
                    onChange={(event) => setOrderNumber(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Description
                  </label>
                  <Input
                    placeholder="Keterangan umum faktur (opsional)"
                    value={description}
                    disabled={!canWrite}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Baris Item Faktur
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
                        <th className="px-3 py-2 font-medium min-w-[200px]">
                          Account (Expense) *
                        </th>
                        <th className="px-3 py-2 font-medium min-w-[180px]">
                          Description
                        </th>
                        <th className="px-3 py-2 font-medium w-24">Qty *</th>
                        <th className="px-3 py-2 font-medium w-36">Unit Price *</th>
                        <th className="px-3 py-2 text-right font-medium w-36">
                          Subtotal Baris
                        </th>
                        {canWrite && (
                          <th className="px-3 py-2 text-center font-medium w-16">
                            Hapus
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((line, index) => {
                        const lineSubtotal = computeLineSubtotal(line);
                        return (
                          <tr key={line.id} className="hover:bg-gray-50">
                            <td className="p-2">
                              <select
                                className="w-full h-8 rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                value={line.accountId}
                                disabled={!canWrite || isAccountsLoading}
                                onChange={(event) =>
                                  updateLine(index, "accountId", event.target.value)
                                }
                                required
                              >
                                <option value="">-- Pilih Akun --</option>
                                {expenseAccounts.map((acc) => (
                                  <option key={acc.id} value={acc.id}>
                                    {acc.code} - {acc.name}
                                  </option>
                                ))}
                              </select>
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
                                placeholder="Deskripsi item"
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
                              {formatAmount(lineSubtotal)}
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
                    <div className="text-xs text-gray-500">Total Faktur</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatAmount(liveTotalInvoiceAmount)}
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
                    ? (isSubmitting ? "Menyimpan..." : "Simpan Faktur")
                    : (isSubmitting ? "Menyimpan..." : "Perbarui Faktur")}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
