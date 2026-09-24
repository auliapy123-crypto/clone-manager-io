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
import {
  getTodayDateString,
  type PurchaseOrder,
  type PurchaseOrderLineInput,
  type PurchaseOrderStatus,
  useCreatePurchaseOrder,
  useDeletePurchaseOrder,
  usePurchaseOrder,
  usePurchaseOrders,
  useUpdatePurchaseOrder,
} from "@/hooks/use-purchase-orders";
import { useSuppliers } from "@/hooks/use-suppliers";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/purchase-orders")({
  component: PurchaseOrdersPage,
});

function formatAmount(value: number) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  if (status === "Fully Invoiced/Closed") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 border border-green-200">
        Fully Invoiced/Closed
      </span>
    );
  }
  if (status === "Partially Invoiced") {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 border border-yellow-200">
        Partially Invoiced
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 border border-gray-200">
      Draft/Open
    </span>
  );
}

function PurchaseOrdersPage() {
  const { businessId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = usePurchaseOrders(businessId, page, {
    q: q || undefined,
    status: statusFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const deleteOrder = useDeletePurchaseOrder(businessId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalOrderAmount = useMemo(
    () => data?.data.reduce((total, o) => total + o.totalOrderAmount, 0) ?? 0,
    [data],
  );

  const handleDelete = async (order: PurchaseOrder) => {
    const refText = order.reference ? ` "${order.reference}"` : "";
    if (
      !window.confirm(
        `Hapus PO${refText} untuk supplier "${order.supplierName}"?`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      await deleteOrder.mutateAsync(order.id);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
    }
  };

  const handleConvert = (order: PurchaseOrder) => {
    void navigate({
      to: "/businesses/$businessId/purchase-invoices",
      params: { businessId },
      search: { convertFromPO: order.id },
    });
  };

  const resetPage = () => setPage(1);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Purchase Orders</h1>
          {data && (
            <p className="text-sm text-gray-500">{data.pagination.total} PO</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveOrderId("new")}>PO Baru</Button>
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
            setStatusFilter(event.target.value as PurchaseOrderStatus | "");
            resetPage();
          }}
        >
          <option value="">Semua Status</option>
          <option value="Draft/Open">Draft/Open</option>
          <option value="Partially Invoiced">Partially Invoiced</option>
          <option value="Fully Invoiced/Closed">Fully Invoiced/Closed</option>
        </select>
        <Input
          type="date"
          className="max-w-[170px]"
          value={dateFrom}
          onChange={(event) => {
            setDateFrom(event.target.value);
            resetPage();
          }}
          aria-label="Tanggal dari"
        />
        <span className="text-sm text-gray-500">s.d.</span>
        <Input
          type="date"
          className="max-w-[170px]"
          value={dateTo}
          onChange={(event) => {
            setDateTo(event.target.value);
            resetPage();
          }}
          aria-label="Tanggal sampai"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat PO...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada purchase order.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Supplier</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 text-right font-medium">
                      Total Amount
                    </th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{order.date}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {order.reference || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {order.supplierName}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {order.description || "-"}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(order.totalOrderAmount)}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveOrderId(order.id)}
                          >
                            {canWrite ? "Edit" : "Lihat"}
                          </Button>
                          {canWrite && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleConvert(order)}
                              >
                                Convert to Invoice
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={deleteOrder.isPending}
                                onClick={() => void handleDelete(order)}
                              >
                                Hapus
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
                      Total
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">
                      {formatAmount(totalOrderAmount)}
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

      {activeOrderId && (
        <PurchaseOrderFormDialog
          businessId={businessId}
          orderId={activeOrderId}
          canWrite={canWrite}
          onClose={() => setActiveOrderId(null)}
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

function computeLineAmount(line: FormLine): number {
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

interface PurchaseOrderFormDialogProps {
  businessId: string;
  orderId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function PurchaseOrderFormDialog({
  businessId,
  orderId,
  canWrite,
  onClose,
}: PurchaseOrderFormDialogProps) {
  const isNew = orderId === "new";
  const { data: existingOrder, isPending: isOrderLoading } = usePurchaseOrder(
    businessId,
    isNew ? null : orderId,
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

  const createOrder = useCreatePurchaseOrder(businessId);
  const updateOrder = useUpdatePurchaseOrder(businessId);

  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(getTodayDateString());
  const [billingAddress, setBillingAddress] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<FormLine[]>([createEmptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && existingOrder) {
      setSupplierId(existingOrder.supplierId);
      setReference(existingOrder.reference ?? "");
      setDate(existingOrder.date);
      setBillingAddress(existingOrder.billingAddress ?? "");
      setDescription(existingOrder.description ?? "");

      if (existingOrder.lines && existingOrder.lines.length > 0) {
        setLines(
          existingOrder.lines.map((line) => ({
            id: line.id || Math.random().toString(36).substring(2, 9),
            accountId: line.accountId,
            description: line.description ?? "",
            quantity: String(line.quantity),
            unitPrice: String(line.unitPrice),
          })),
        );
      }
    }
  }, [isNew, existingOrder]);

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

  const liveTotalOrderAmount = useMemo(() => {
    return lines.reduce((sum, line) => sum + computeLineAmount(line), 0);
  }, [lines]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!supplierId) {
      setFormError("Supplier wajib dipilih.");
      return;
    }

    const finalDate = date.trim() || getTodayDateString();

    if (lines.length === 0) {
      setFormError("PO wajib memiliki minimal 1 baris item.");
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

    const formattedLines: PurchaseOrderLineInput[] = lines.map((l) => ({
      accountId: l.accountId,
      description: l.description.trim() || null,
      quantity: parseFloat(l.quantity) || 1,
      unitPrice: parseFloat(l.unitPrice) || 0,
    }));

    try {
      if (isNew) {
        await createOrder.mutateAsync({
          supplierId,
          reference: reference.trim() || undefined,
          date: finalDate,
          billingAddress: billingAddress.trim() || undefined,
          description: description.trim() || undefined,
          lines: formattedLines,
        });
      } else {
        await updateOrder.mutateAsync({
          orderId,
          supplierId,
          reference: reference.trim() || null,
          date: finalDate,
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

  const isSubmitting = createOrder.isPending || updateOrder.isPending;
  const isInitialLoading = !isNew && isOrderLoading;
  const expenseAccounts = accountsData?.data ?? [];

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew ? "PO Baru" : canWrite ? "Edit PO" : "Detail PO"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Buat pesanan pembelian. PO tidak memposting jurnal apa pun."
              : "Lihat atau perbarui PO beserta baris itemnya."}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            Memuat data PO...
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

              {!isNew && existingOrder && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-md bg-gray-50 p-3 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Total Order</div>
                    <div className="font-semibold text-gray-900">
                      {formatAmount(existingOrder.totalOrderAmount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Invoiced</div>
                    <div className="font-semibold text-gray-900">
                      {formatAmount(existingOrder.invoicedAmount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Status</div>
                    <StatusBadge status={existingOrder.status} />
                  </div>
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
                    onChange={(event) => setSupplierId(event.target.value)}
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
                    placeholder="Contoh: PO-2026-0042"
                    value={reference}
                    disabled={!canWrite}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Date *
                  </label>
                  <Input
                    type="date"
                    value={date}
                    disabled={!canWrite}
                    onChange={(event) => setDate(event.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Billing Address
                  </label>
                  <textarea
                    className="min-h-9 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    placeholder="Alamat penagihan/pengiriman (opsional)"
                    rows={2}
                    value={billingAddress}
                    disabled={!canWrite}
                    onChange={(event) => setBillingAddress(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Description
                  </label>
                  <Input
                    placeholder="Keterangan umum PO (opsional)"
                    value={description}
                    disabled={!canWrite}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Baris Item PO
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
                          Line Amount
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
                        const lineAmount = computeLineAmount(line);
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
                              {formatAmount(lineAmount)}
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
                    <div className="text-xs text-gray-500">Total PO</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatAmount(liveTotalOrderAmount)}
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
                    ? (isSubmitting ? "Menyimpan..." : "Simpan PO")
                    : (isSubmitting ? "Menyimpan..." : "Perbarui PO")}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
