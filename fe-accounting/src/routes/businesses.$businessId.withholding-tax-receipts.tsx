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
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute(
  "/businesses/$businessId/withholding-tax-receipts",
)({
  component: WithholdingTaxReceiptsPage,
});

function formatAmount(value: number) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function WithholdingTaxReceiptsPage() {
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
        `Hapus bukti potong ${receipt.reference || ""} untuk "${receipt.customerName}" (${formatAmount(receipt.amount)})?`,
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
            Withholding Tax Receipts
          </h1>
          {data && (
            <p className="text-sm text-gray-500">
              {data.pagination.total} bukti potong
            </p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveReceipt("new")}>Bukti Potong Baru</Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Cari reference atau nama customer..."
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
            <p className="p-6 text-sm text-gray-500">Memuat bukti potong...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">
              Belum ada bukti potong tercatat.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Customer</th>
                    <th className="px-6 py-3 font-medium">Sales Invoice</th>
                    <th className="px-6 py-3 font-medium">Withholding Tax Account</th>
                    <th className="px-6 py-3 text-right font-medium">Amount</th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
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
                            {canWrite ? "Edit" : "Lihat"}
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

    if (!date) return setFormError("Date wajib diisi.");
    if (!customerId) return setFormError("Customer wajib dipilih.");
    if (!salesInvoiceId) return setFormError("Sales Invoice wajib dipilih.");
    if (!accountId) return setFormError("Withholding Tax Account wajib dipilih.");
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return setFormError("Amount harus lebih dari 0.");
    }
    if (
      maxAmount !== null &&
      Math.round(parsedAmount * 100) > Math.round(maxAmount * 100)
    ) {
      return setFormError(
        `Amount tidak boleh melebihi sisa tagihan invoice (${formatAmount(maxAmount)}).`,
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
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>
            {isNew
              ? "Bukti Potong Baru"
              : canWrite
                ? "Edit Bukti Potong"
                : "Detail Bukti Potong"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Catat pajak yang dipotong pelanggan. Memposting jurnal (Debit akun pajak, Kredit Piutang Usaha) dan mengurangi sisa tagihan invoice."
              : "Perbarui atau hapus bukti potong ini. Jurnal akan disusun ulang."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-4"
        >
          {formError && (
            <div
              role="alert"
              className="rounded bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {formError}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className={labelClass}>Date *</label>
            <Input
              type="date"
              value={date}
              disabled={!canWrite}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>Customer *</label>
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
            <label className={labelClass}>Sales Invoice *</label>
            <select
              className={selectClass}
              value={salesInvoiceId}
              disabled={!canWrite || !customerId || isInvoicesLoading}
              onChange={(event) => setSalesInvoiceId(event.target.value)}
              required
            >
              <option value="">
                {customerId ? "-- Pilih Sales Invoice --" : "Pilih Customer dulu"}
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
            <label className={labelClass}>Withholding Tax Account *</label>
                        <Combobox
              ariaLabel="Withholding Tax Account"
              value={accountId}
              disabled={!canWrite || isAccountsLoading}
              onChange={(value) => setAccountId(value)}
              placeholder="-- Pilih Akun (Asset) --"
              options={(accountsData?.data ?? [])
                .filter((a) => !a.isControlAccount)
                .map((a) => ({
                  value: a.id,
                  label: `${a.code} — ${a.name}`,
                }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>Amount *</label>
            <Input
              type="number"
              step="any"
              min="0"
              max={maxAmount ?? undefined}
              placeholder="Contoh: 300000"
              value={amount}
              disabled={!canWrite}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>Reference</label>
            <Input
              maxLength={50}
              placeholder="Nomor bukti potong resmi"
              value={reference}
              disabled={!canWrite}
              onChange={(event) => setReference(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>Description</label>
            <Input
              value={description}
              disabled={!canWrite}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting || deleteReceipt.isPending}
            >
              Batal
            </Button>
            {canWrite && !isNew && (
              <Button
                type="button"
                variant="destructive"
                disabled={isSubmitting || deleteReceipt.isPending}
                onClick={() => void handleDelete()}
              >
                {deleteReceipt.isPending ? "Menghapus..." : "Delete"}
              </Button>
            )}
            {canWrite && (
              <Button
                type="submit"
                disabled={isSubmitting || deleteReceipt.isPending}
              >
                {isSubmitting
                  ? "Menyimpan..."
                  : isNew
                    ? "Simpan Bukti Potong"
                    : "Update"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
