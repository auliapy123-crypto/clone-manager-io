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
  type LatePaymentFee,
  useCreateLatePaymentFee,
  useDeleteLatePaymentFee,
  useLatePaymentFees,
  useUpdateLatePaymentFee,
} from "@/hooks/use-late-payment-fees";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { getApiErrorMessage } from "@/lib/errors";
import { useFormatAmount } from "@/lib/format";

export const Route = createFileRoute(
  "/businesses/$businessId/late-payment-fees",
)({
  component: LatePaymentFeesPage,
});

function LatePaymentFeesPage() {
  const { formatAmount } = useFormatAmount();
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [activeFee, setActiveFee] = useState<LatePaymentFee | "new" | null>(
    null,
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useLatePaymentFees(
    businessId,
    page,
    { q: q || undefined },
    10,
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Late Payment Fees</h1>
          {data && (
            <p className="text-sm text-gray-500">{data.pagination.total} denda</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveFee("new")}>Catat Denda</Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Cari nama pelanggan..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat denda...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada denda tercatat.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Customer</th>
                    <th className="px-6 py-3 font-medium">Sales Invoice</th>
                    <th className="px-6 py-3 text-right font-medium">Amount</th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((fee) => (
                    <tr key={fee.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{fee.date}</td>
                      <td className="px-6 py-3 text-gray-900">{fee.customerName}</td>
                      <td className="px-6 py-3 text-gray-600">
                        {fee.salesInvoiceReference || "-"}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(fee.amount)}
                      </td>
                      <td className="px-6 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveFee(fee)}
                        >
                          {canWrite ? "Edit" : "Lihat"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
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

      {activeFee && (
        <LatePaymentFeeFormDialog
          businessId={businessId}
          fee={activeFee === "new" ? null : activeFee}
          canWrite={canWrite}
          onClose={() => setActiveFee(null)}
        />
      )}
    </div>
  );
}

interface LatePaymentFeeFormDialogProps {
  businessId: string;
  fee: LatePaymentFee | null; // null = create baru
  canWrite: boolean;
  onClose: () => void;
}

function LatePaymentFeeFormDialog({
  businessId,
  fee,
  canWrite,
  onClose,
}: LatePaymentFeeFormDialogProps) {
  const { formatAmount } = useFormatAmount();
  const isNew = fee === null;

  const { data: customersData, isPending: isCustomersLoading } = useCustomers(
    businessId,
    1,
    {},
    100,
  );

  const [customerId, setCustomerId] = useState(fee?.customerId ?? "");

  const { data: invoicesData, isPending: isInvoicesLoading } = useSalesInvoices(
    businessId,
    1,
    {},
    100,
  );

  const invoicesForCustomer = useMemo(
    () =>
      invoicesData?.data.filter((invoice) => invoice.customerId === customerId) ??
      [],
    [invoicesData, customerId],
  );

  const createFee = useCreateLatePaymentFee(businessId);
  const updateFee = useUpdateLatePaymentFee(businessId);
  const deleteFee = useDeleteLatePaymentFee(businessId);

  const [date, setDate] = useState(fee?.date ?? getTodayDateString());
  const [salesInvoiceId, setSalesInvoiceId] = useState(fee?.salesInvoiceId ?? "");
  const [amount, setAmount] = useState(fee ? String(fee.amount) : "");
  const [formError, setFormError] = useState<string | null>(null);

  const handleCustomerChange = (newCustomerId: string) => {
    setCustomerId(newCustomerId);
    setSalesInvoiceId("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!date) {
      setFormError("Date wajib diisi.");
      return;
    }
    if (!customerId) {
      setFormError("Pelanggan wajib dipilih.");
      return;
    }
    if (!salesInvoiceId) {
      setFormError("Sales Invoice wajib dipilih.");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError("Amount harus lebih dari 0.");
      return;
    }

    try {
      if (isNew) {
        await createFee.mutateAsync({
          date,
          customerId,
          salesInvoiceId,
          amount: parsedAmount,
        });
      } else {
        await updateFee.mutateAsync({
          feeId: fee.id,
          date,
          customerId,
          salesInvoiceId,
          amount: parsedAmount,
        });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!fee) return;
    if (
      !window.confirm(
        `Hapus denda untuk pelanggan "${fee.customerName}" (${formatAmount(fee.amount)})?`,
      )
    ) {
      return;
    }
    setFormError(null);
    try {
      await deleteFee.mutateAsync(fee.id);
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createFee.isPending || updateFee.isPending;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>
            {isNew ? "Catat Denda Keterlambatan" : canWrite ? "Edit Denda" : "Detail Denda"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Catat denda keterlambatan pembayaran. Tidak memposting jurnal apa pun."
              : "Perbarui atau hapus catatan denda ini."}
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
              Sales Invoice *
            </label>
            <select
              className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
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
                  {invoice.reference || invoice.id} — {invoice.issueDate}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
              Amount *
            </label>
            <Input
              type="number"
              step="any"
              min="0"
              placeholder="Contoh: 25000"
              value={amount}
              disabled={!canWrite}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting || deleteFee.isPending}
            >
              Batal
            </Button>
            {canWrite && !isNew && (
              <Button
                type="button"
                variant="destructive"
                disabled={isSubmitting || deleteFee.isPending}
                onClick={() => void handleDelete()}
              >
                {deleteFee.isPending ? "Menghapus..." : "Delete"}
              </Button>
            )}
            {canWrite && (
              <Button type="submit" disabled={isSubmitting || deleteFee.isPending}>
                {isNew
                  ? (isSubmitting ? "Menyimpan..." : "Simpan Denda")
                  : (isSubmitting ? "Menyimpan..." : "Update")}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
