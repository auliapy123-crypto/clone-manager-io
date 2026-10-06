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
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAccounts } from "@/hooks/use-accounts";
import { useBusinesses } from "@/hooks/use-businesses";
import { useCustomers } from "@/hooks/use-customers";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import {
  getTodayDateString,
  useCopyWithholdingTaxReceipt,
  useCreateWithholdingTaxReceipt,
  useDeleteWithholdingTaxReceipt,
  useUpdateWithholdingTaxReceipt,
  useWithholdingTaxReceipts,
  type WithholdingTaxReceipt,
} from "@/hooks/use-withholding-tax-receipts";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/errors";
import { useFormatAmount } from "@/lib/format";

export const Route = createFileRoute(
  "/businesses/$businessId/withholding-tax-receipts",
)({
  component: WithholdingTaxReceiptsPage,
});

function WithholdingTaxReceiptsPage() {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);

  const [activeReceipt, setActiveReceipt] = useState<
    WithholdingTaxReceipt | "new" | null
  >(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useWithholdingTaxReceipts(
    businessId,
    page,
    { q: q || undefined },
    10,
  );

  const copyReceipt = useCopyWithholdingTaxReceipt(businessId);
  const deleteReceipt = useDeleteWithholdingTaxReceipt(businessId);

  // Total dihitung dalam sen supaya tidak ada drift float.
  const totalAmount = useMemo(
    () =>
      (data?.data.reduce((sum, r) => sum + Math.round(r.amount * 100), 0) ?? 0) /
      100,
    [data],
  );

  const handleCopy = async (receipt: WithholdingTaxReceipt) => {
    setPageError(null);
    try {
      await copyReceipt.mutateAsync(receipt.id);
    } catch (err) {
      setPageError(getApiErrorMessage(err));
    }
  };

  const handleDelete = async (receipt: WithholdingTaxReceipt) => {
    if (
      !window.confirm(
        t("withholdingTaxReceipts.deleteConfirm", {
          reference: receipt.reference || "",
          customer: receipt.customerName,
          amount: formatAmount(receipt.amount),
        }),
      )
    ) {
      return;
    }
    setPageError(null);
    try {
      await deleteReceipt.mutateAsync(receipt.id);
    } catch (err) {
      setPageError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            {t("withholdingTaxReceipts.title")}
          </h1>
          {data && (
            <p className="text-sm text-gray-500">
              {t("withholdingTaxReceipts.subtitle", { count: data.pagination.total })}
            </p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveReceipt("new")}>{t("withholdingTaxReceipts.newButton")}</Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder={t("withholdingTaxReceipts.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {pageError && (
        <div
          role="alert"
          className="rounded bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {pageError}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">{t("withholdingTaxReceipts.loading")}</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">
              {t("withholdingTaxReceipts.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t("withholdingTaxReceipts.colDate")}</th>
                    <th className="px-6 py-3 font-medium">{t("withholdingTaxReceipts.colReference")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.customer")}</th>
                    <th className="px-6 py-3 font-medium">{t("withholdingTaxReceipts.colSalesInvoice")}</th>
                    <th className="px-6 py-3 font-medium">{t("withholdingTaxReceipts.colTaxAccount")}</th>
                    <th className="px-6 py-3 text-right font-medium">{t("withholdingTaxReceipts.colAmount")}</th>
                    <th className="px-6 py-3 font-medium">{t("common.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((receipt) => (
                    <tr key={receipt.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{receipt.date}</td>
                      <td className="px-6 py-3 text-gray-600">
                        {receipt.reference || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {receipt.customerName}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {receipt.salesInvoiceReference || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {receipt.withholdingTaxAccountCode} —{" "}
                        {receipt.withholdingTaxAccountName}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(receipt.amount)}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveReceipt(receipt)}
                          >
                            {canWrite ? t("common.edit") : t("common.view")}
                          </Button>
                          {canWrite && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={copyReceipt.isPending}
                                onClick={() => void handleCopy(receipt)}
                              >
                                Duplikat
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={deleteReceipt.isPending}
                                onClick={() => void handleDelete(receipt)}
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
                    <td
                      colSpan={5}
                      className="px-6 py-3 text-right text-xs font-semibold uppercase text-gray-500"
                    >
                      Total{data.pagination.totalPages > 1 ? " (halaman ini)" : ""}
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

      {activeReceipt && (
        <WithholdingTaxReceiptFormDialog
          businessId={businessId}
          receipt={activeReceipt === "new" ? null : activeReceipt}
          canWrite={canWrite}
          onClose={() => setActiveReceipt(null)}
        />
      )}
    </div>
  );
}

interface FormDialogProps {
  businessId: string;
  receipt: WithholdingTaxReceipt | null; // null = create baru
  canWrite: boolean;
  onClose: () => void;
}

const selectClass =
  "h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100";
const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-gray-700";

function WithholdingTaxReceiptFormDialog({
  businessId,
  receipt,
  canWrite,
  onClose,
}: FormDialogProps) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const isNew = receipt === null;

  const { data: customersData, isPending: isCustomersLoading } = useCustomers(
    businessId,
    1,
    {},
    100,
  );
  const { data: invoicesData, isPending: isInvoicesLoading } = useSalesInvoices(
    businessId,
    1,
    {},
    100,
  );
  const { data: accountsData, isPending: isAccountsLoading } = useAccounts(
    businessId,
    1,
    { category: "Asset" },
    100,
  );

  const createReceipt = useCreateWithholdingTaxReceipt(businessId);
  const updateReceipt = useUpdateWithholdingTaxReceipt(businessId);
  const deleteReceipt = useDeleteWithholdingTaxReceipt(businessId);

  const [date, setDate] = useState(receipt?.date ?? getTodayDateString());
  const [customerId, setCustomerId] = useState(receipt?.customerId ?? "");
  const [salesInvoiceId, setSalesInvoiceId] = useState(
    receipt?.salesInvoiceId ?? "",
  );
  const [accountId, setAccountId] = useState(
    receipt?.withholdingTaxAccountId ?? "",
  );
  const [amount, setAmount] = useState(receipt ? String(receipt.amount) : "");
  const [reference, setReference] = useState(receipt?.reference ?? "");
  const [description, setDescription] = useState(receipt?.description ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  // balanceDue dari list sudah dikurangi SEMUA bukti potong aktif, termasuk
  // milik record ini sendiri — saat edit, tambahkan lagi nominal lamanya.
  const ownAllocation = (invoiceId: string) =>
    receipt && receipt.salesInvoiceId === invoiceId ? receipt.amount : 0;

  const invoicesForCustomer = useMemo(
    () =>
      (invoicesData?.data ?? []).filter(
        (invoice) =>
          invoice.customerId === customerId &&
          (invoice.balanceDue > 0 || invoice.id === receipt?.salesInvoiceId),
      ),
    [invoicesData, customerId, receipt],
  );

  const selectedInvoice = invoicesForCustomer.find(
    (invoice) => invoice.id === salesInvoiceId,
  );
  const maxAmount = selectedInvoice
    ? Math.round(
        (selectedInvoice.balanceDue + ownAllocation(selectedInvoice.id)) * 100,
      ) / 100
    : null;

  const handleCustomerChange = (newCustomerId: string) => {
    setCustomerId(newCustomerId);
    setSalesInvoiceId("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!date) return setFormError(t("withholdingTaxReceipts.dateRequired"));
    if (!customerId) return setFormError(t("withholdingTaxReceipts.customerRequired"));
    if (!salesInvoiceId) return setFormError(t("withholdingTaxReceipts.invoiceRequired"));
    if (!accountId) return setFormError(t("withholdingTaxReceipts.accountRequired"));
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return setFormError(t("withholdingTaxReceipts.amountPositive"));
    }
    if (
      maxAmount !== null &&
      Math.round(parsedAmount * 100) > Math.round(maxAmount * 100)
    ) {
      return setFormError(
        t("withholdingTaxReceipts.amountMax", { max: formatAmount(maxAmount) }),
      );
    }

    const payload = {
      date,
      customerId,
      salesInvoiceId,
      withholdingTaxAccountId: accountId,
      amount: parsedAmount,
      reference: reference.trim() || null,
      description: description.trim() || null,
    };

    try {
      if (isNew) {
        await createReceipt.mutateAsync(payload);
      } else {
        await updateReceipt.mutateAsync({ receiptId: receipt.id, ...payload });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!receipt) return;
    if (
      !window.confirm(
        `Hapus bukti potong untuk "${receipt.customerName}" (${formatAmount(receipt.amount)})?`,
      )
    ) {
      return;
    }
    setFormError(null);
    try {
      await deleteReceipt.mutateAsync(receipt.id);
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createReceipt.isPending || updateReceipt.isPending;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isNew
              ? t("withholdingTaxReceipts.dialogTitleNew")
              : canWrite
                ? t("withholdingTaxReceipts.dialogTitleEdit")
                : t("withholdingTaxReceipts.dialogTitleDetail")}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? t("withholdingTaxReceipts.dialogDescNew")
              : t("withholdingTaxReceipts.dialogDescEdit")}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {formError && (
            <div
              role="alert"
              className="rounded bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {formError}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className={labelClass}>{t("withholdingTaxReceipts.fieldDate")} *</label>
            <Input
              type="date"
              value={date}
              disabled={!canWrite}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>{t("withholdingTaxReceipts.fieldCustomer")} *</label>
            <select
              className={selectClass}
              value={customerId}
              disabled={!canWrite || isCustomersLoading}
              onChange={(event) => handleCustomerChange(event.target.value)}
              required
            >
              <option value="">-- Pilih Customer --</option>
              {customersData?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.code ? `(${c.code})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>{t("withholdingTaxReceipts.fieldSalesInvoice")} *</label>
            <select
              className={selectClass}
              value={salesInvoiceId}
              disabled={!canWrite || !customerId || isInvoicesLoading}
              onChange={(event) => setSalesInvoiceId(event.target.value)}
              required
            >
              <option value="">
                {customerId ? t("withholdingTaxReceipts.invoicePlaceholder") : t("withholdingTaxReceipts.pickCustomerFirst")}
              </option>
              {invoicesForCustomer.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.reference || invoice.id} — {invoice.issueDate} — sisa{" "}
                  {formatAmount(invoice.balanceDue + ownAllocation(invoice.id))}
                </option>
              ))}
            </select>
            {maxAmount !== null && (
              <p className="text-xs text-gray-500">
                Sisa tagihan invoice: {formatAmount(maxAmount)}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>{t("withholdingTaxReceipts.fieldTaxAccount")} *</label>
                        <Combobox
              ariaLabel={t("withholdingTaxReceipts.taxAccountAria")}
              value={accountId}
              disabled={!canWrite || isAccountsLoading}
              onChange={(value) => setAccountId(value)}
              placeholder={t("withholdingTaxReceipts.taxAccountPlaceholder")}
              options={(accountsData?.data ?? [])
                .filter((a) => !a.isControlAccount)
                .map((a) => ({
                  value: a.id,
                  label: `${a.code} — ${a.name}`,
                }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>{t("withholdingTaxReceipts.fieldAmount")} *</label>
            <Input
              type="number"
              step="any"
              min="0"
              max={maxAmount ?? undefined}
              placeholder={t("withholdingTaxReceipts.placeholderAmount")}
              value={amount}
              disabled={!canWrite}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>{t("withholdingTaxReceipts.fieldReference")}</label>
            <Input
              maxLength={50}
              placeholder={t("withholdingTaxReceipts.placeholderReference")}
              value={reference}
              disabled={!canWrite}
              onChange={(event) => setReference(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>{t("withholdingTaxReceipts.fieldDescription")}</label>
            <Input
              value={description}
              disabled={!canWrite}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          </div>

          <DialogFooter className="shrink-0 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting || deleteReceipt.isPending}
            >
              {t("common.cancel")}
            </Button>
            {canWrite && !isNew && (
              <Button
                type="button"
                variant="destructive"
                disabled={isSubmitting || deleteReceipt.isPending}
                onClick={() => void handleDelete()}
              >
                {deleteReceipt.isPending ? t("common.deleting") : t("withholdingTaxReceipts.deleteButton")}
              </Button>
            )}
            {canWrite && (
              <Button
                type="submit"
                disabled={isSubmitting || deleteReceipt.isPending}
              >
                {isSubmitting
                  ? t("common.submitting")
                  : isNew
                    ? t("withholdingTaxReceipts.submitNew")
                    : t("withholdingTaxReceipts.submitEdit")}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
