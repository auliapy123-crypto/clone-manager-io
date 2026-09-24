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
import { useBankAccounts } from "@/hooks/use-bank-accounts";
import { useBusinesses } from "@/hooks/use-businesses";
import {
  getTodayDateString,
  type InterAccountTransfer,
  useCreateInterAccountTransfer,
  useDeleteInterAccountTransfer,
  useInterAccountTransfer,
  useInterAccountTransfers,
  useUpdateInterAccountTransfer,
} from "@/hooks/use-inter-account-transfers";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/inter-account-transfers")({
  component: InterAccountTransfersPage,
});

function formatAmount(value: number) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function InterAccountTransfersPage() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [activeTransferId, setActiveTransferId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useInterAccountTransfers(businessId, page, {
    q: q || undefined,
  });

  const deleteTransfer = useDeleteInterAccountTransfer(businessId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalAmount = useMemo(
    () => data?.data.reduce((total, t) => total + t.amount, 0) ?? 0,
    [data],
  );

  const handleDelete = async (transfer: InterAccountTransfer) => {
    const refText = transfer.reference ? ` "${transfer.reference}"` : "";
    if (
      !window.confirm(
        `Hapus transfer${refText} sebesar ${formatAmount(transfer.amount)} dari "${transfer.fromBankAccountName}" ke "${transfer.toBankAccountName}"? Jurnal terkait juga akan dihapus.`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      await deleteTransfer.mutateAsync(transfer.id);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Inter Account Transfers</h1>
          {data && (
            <p className="text-sm text-gray-500">{data.pagination.total} transfer</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveTransferId("new")}>Buat Transfer</Button>
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
          placeholder="Cari referensi, akun, keterangan..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat transfer...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada transfer.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Paid From</th>
                    <th className="px-6 py-3 font-medium">Received In</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 text-right font-medium">Amount</th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((transfer) => (
                    <tr key={transfer.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{transfer.date}</td>
                      <td className="px-6 py-3 text-gray-900">
                        {transfer.fromBankAccountName}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {transfer.toBankAccountName}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {transfer.description || transfer.reference || "-"}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(transfer.amount)}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveTransferId(transfer.id)}
                          >
                            {canWrite ? "Edit" : "Lihat"}
                          </Button>
                          {canWrite && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteTransfer.isPending}
                              onClick={() => void handleDelete(transfer)}
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
                    <td />
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

      {activeTransferId && (
        <InterAccountTransferFormDialog
          businessId={businessId}
          transferId={activeTransferId}
          canWrite={canWrite}
          onClose={() => setActiveTransferId(null)}
        />
      )}
    </div>
  );
}

interface InterAccountTransferFormDialogProps {
  businessId: string;
  transferId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function InterAccountTransferFormDialog({
  businessId,
  transferId,
  canWrite,
  onClose,
}: InterAccountTransferFormDialogProps) {
  const isNew = transferId === "new";
  const { data: existingTransfer, isPending: isTransferLoading } = useInterAccountTransfer(
    businessId,
    isNew ? null : transferId,
  );

  const { data: bankAccountsData, isPending: isBankAccountsLoading } = useBankAccounts(
    businessId,
    1,
    { status: "active" },
    100,
  );

  const createTransfer = useCreateInterAccountTransfer(businessId);
  const updateTransfer = useUpdateInterAccountTransfer(businessId);

  const [date, setDate] = useState(getTodayDateString());
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [fromBankAccountId, setFromBankAccountId] = useState("");
  const [toBankAccountId, setToBankAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && existingTransfer) {
      setDate(existingTransfer.date);
      setReference(existingTransfer.reference ?? "");
      setDescription(existingTransfer.description ?? "");
      setFromBankAccountId(existingTransfer.fromBankAccountId);
      setToBankAccountId(existingTransfer.toBankAccountId);
      setAmount(String(existingTransfer.amount));
    }
  }, [isNew, existingTransfer]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!fromBankAccountId) {
      setFormError("Akun sumber (Paid from) wajib dipilih.");
      return;
    }
    if (!toBankAccountId) {
      setFormError("Akun tujuan (Received in) wajib dipilih.");
      return;
    }
    if (fromBankAccountId === toBankAccountId) {
      setFormError("Akun tujuan harus berbeda dari akun sumber.");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError("Nominal transfer harus lebih dari 0.");
      return;
    }

    const finalDate = date.trim() || getTodayDateString();

    try {
      if (isNew) {
        await createTransfer.mutateAsync({
          date: finalDate,
          reference: reference.trim() || undefined,
          description: description.trim() || undefined,
          fromBankAccountId,
          toBankAccountId,
          amount: parsedAmount,
        });
      } else {
        await updateTransfer.mutateAsync({
          transferId,
          date: finalDate,
          reference: reference.trim() || null,
          description: description.trim() || null,
          fromBankAccountId,
          toBankAccountId,
          amount: parsedAmount,
        });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createTransfer.isPending || updateTransfer.isPending;
  const isInitialLoading = !isNew && isTransferLoading;
  const bankAccounts = bankAccountsData?.data ?? [];

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew
              ? "Buat Transfer"
              : canWrite
                ? "Edit Transfer"
                : "Detail Transfer"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Pindahkan saldo antar akun. Jurnal debit/kredit akan otomatis diposting."
              : "Lihat atau perbarui transfer antar akun."}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            Memuat data transfer...
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
                    Reference
                  </label>
                  <Input
                    placeholder="Contoh: TRF-2026-001 (opsional)"
                    value={reference}
                    disabled={!canWrite}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Paid From *
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={fromBankAccountId}
                    disabled={!canWrite || isBankAccountsLoading}
                    onChange={(event) => setFromBankAccountId(event.target.value)}
                    required
                  >
                    <option value="">-- Pilih Akun Sumber --</option>
                    {bankAccounts.map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.name} ({ba.accountCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Received In *
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={toBankAccountId}
                    disabled={!canWrite || isBankAccountsLoading}
                    onChange={(event) => setToBankAccountId(event.target.value)}
                    required
                  >
                    <option value="">-- Pilih Akun Tujuan --</option>
                    {bankAccounts.map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.name} ({ba.accountCode})
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
                    min="0.01"
                    placeholder="0.00"
                    value={amount}
                    disabled={!canWrite}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Description
                  </label>
                  <Input
                    placeholder="Keterangan transfer (opsional)"
                    value={description}
                    disabled={!canWrite}
                    onChange={(event) => setDescription(event.target.value)}
                  />
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
                    ? (isSubmitting ? "Menyimpan..." : "Simpan Transfer")
                    : (isSubmitting ? "Menyimpan..." : "Perbarui Transfer")}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
