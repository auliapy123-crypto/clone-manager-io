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
  type SalesOrder,
  type SalesOrderLineInput,
  useCreateSalesOrder,
  useDeleteSalesOrder,
  useSalesOrder,
  useSalesOrders,
  useUpdateSalesOrder,
} from "@/hooks/use-sales-orders";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/errors";
import { useFormatAmount } from "@/lib/format";

export const Route = createFileRoute("/businesses/$businessId/sales-orders")({
  component: SalesOrdersPage,
});

function SalesOrdersPage() {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useSalesOrders(businessId, page, {
    q: q || undefined,
  }, 10);

  const deleteOrder = useDeleteSalesOrder(businessId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalAmount = useMemo(
    () => data?.data.reduce((total, order) => total + order.totalAmount, 0) ?? 0,
    [data],
  );

  const handleDelete = async (order: SalesOrder) => {
    const refText = order.reference ? ` "${order.reference}"` : "";
    if (
      !window.confirm(
        t("salesOrders.deleteConfirm", { ref: refText, customer: order.customerName }),
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

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t("salesOrders.title")}</h1>
          {data && (
            <p className="text-sm text-gray-500">{t("salesOrders.subtitle", { count: data.pagination.total })}</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveOrderId("new")}>{t("salesOrders.newButton")}</Button>
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
          placeholder={t("salesOrders.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">{t("salesOrders.loading")}</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">{t("salesOrders.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t("salesOrders.colIssueDate")}</th>
                    <th className="px-6 py-3 font-medium">{t("salesOrders.colReference")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.customer")}</th>
                    <th className="px-6 py-3 font-medium">{t("salesOrders.colDescription")}</th>
                    <th className="px-6 py-3 text-right font-medium">
                      {t("salesOrders.colTotalAmount")}
                    </th>
                    <th className="px-6 py-3 font-medium">{t("common.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{order.issueDate}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {order.reference || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {order.customerName}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {order.description || "-"}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(order.totalAmount)}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveOrderId(order.id)}
                          >
                            {canWrite ? t("common.edit") : t("common.view")}
                          </Button>
                          {canWrite && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteOrder.isPending}
                              onClick={() => void handleDelete(order)}
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

      {activeOrderId && (
        <SalesOrderFormDialog
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

interface SalesOrderFormDialogProps {
  businessId: string;
  orderId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function SalesOrderFormDialog({
  businessId,
  orderId,
  canWrite,
  onClose,
}: SalesOrderFormDialogProps) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const isNew = orderId === "new";
  const { data: existingOrder, isPending: isOrderLoading } = useSalesOrder(
    businessId,
    isNew ? null : orderId,
  );

  const { data: customersData, isPending: isCustomersLoading } = useCustomers(
    businessId,
    1,
    {},
    100,
  );

  const createOrder = useCreateSalesOrder(businessId);
  const updateOrder = useUpdateSalesOrder(businessId);

  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(getTodayDateString());
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<FormLine[]>([createEmptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);

  // Inisialisasi form saat mode edit selesai memuat data pesanan
  useEffect(() => {
    if (!isNew && existingOrder) {
      setCustomerId(existingOrder.customerId);
      setIssueDate(existingOrder.issueDate);
      setReference(existingOrder.reference ?? "");
      setDescription(existingOrder.description ?? "");

      if (existingOrder.lines && existingOrder.lines.length > 0) {
        setLines(
          existingOrder.lines.map((line) => ({
            id: line.id || Math.random().toString(36).substring(2, 9),
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

  const liveTotalAmount = useMemo(
    () => lines.reduce((sum, line) => sum + computeLineTotal(line), 0),
    [lines],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!customerId) {
      setFormError(t("common.customerRequired"));
      return;
    }

    if (!issueDate) {
      setFormError(t("common.issueDateRequired"));
      return;
    }

    if (lines.length === 0) {
      setFormError(t("salesOrders.validationMinLines"));
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.description.trim()) {
        setFormError(t("salesOrders.validationDescriptionLine", { index: i + 1 }));
        return;
      }
      const qty = parseFloat(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        setFormError(t("salesOrders.validationQtyLine", { index: i + 1 }));
        return;
      }
      const price = parseFloat(line.unitPrice);
      if (!Number.isFinite(price) || price < 0) {
        setFormError(t("salesOrders.validationPriceLine", { index: i + 1 }));
        return;
      }
    }

    const formattedLines: SalesOrderLineInput[] = lines.map((l) => ({
      description: l.description.trim(),
      quantity: parseFloat(l.quantity) || 1,
      unitPrice: parseFloat(l.unitPrice) || 0,
    }));

    try {
      if (isNew) {
        await createOrder.mutateAsync({
          customerId,
          issueDate,
          reference: reference.trim() || undefined,
          description: description.trim() || undefined,
          lines: formattedLines,
        });
      } else {
        await updateOrder.mutateAsync({
          orderId,
          customerId,
          issueDate,
          reference: reference.trim() || null,
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

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew ? t("salesOrders.dialogTitleNew") : canWrite ? t("salesOrders.dialogTitleEdit") : t("salesOrders.dialogTitleDetail")}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? t("salesOrders.dialogDescNew")
              : t("salesOrders.dialogDescEdit")}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            Memuat data pesanan...
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
                    {t("salesOrders.fieldIssueDate")} *
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
                    {t("salesOrders.fieldCustomer")} *
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={customerId}
                    disabled={!canWrite || isCustomersLoading}
                    onChange={(event) => setCustomerId(event.target.value)}
                    required
                  >
                    <option value="">{t("salesOrders.customerPlaceholder")}</option>
                    {customersData?.data.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.code ? `(${c.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("salesOrders.fieldReference")}
                  </label>
                  <Input
                    placeholder="Contoh: 1"
                    value={reference}
                    disabled={!canWrite}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1 md:col-span-3">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Description
                  </label>
                  <Input
                    placeholder="Keterangan umum pesanan (opsional)"
                    value={description}
                    disabled={!canWrite}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {t("salesOrders.linesTitle")}
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
                          {t("salesOrders.colDescriptionHeader")} *
                        </th>
                        <th className="px-3 py-2 font-medium w-28">{t("common.qty")} *</th>
                        <th className="px-3 py-2 font-medium w-40">{t("purchaseQuotes.colUnitPrice")} *</th>
                        <th className="px-3 py-2 text-right font-medium w-40">
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
                      {lines.map((line, index) => (
                        <tr key={line.id} className="hover:bg-gray-50">
                          <td className="p-2">
                            <input
                              type="text"
                              className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                              placeholder={t("salesOrders.lineItemPlaceholder")}
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
                    <div className="text-xs text-gray-500">Total Pesanan</div>
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
                    ? (isSubmitting ? t("common.submitting") : t("salesOrders.submitNew"))
                    : (isSubmitting ? t("common.submitting") : t("salesOrders.submitEdit"))}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
