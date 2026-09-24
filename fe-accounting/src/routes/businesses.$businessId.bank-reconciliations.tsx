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
import {
  getTodayDateString,
  type BankReconciliation,
  type BankReconciliationStatus,
  useBankReconciliation,
  useBankReconciliations,
  useCreateBankReconciliation,
  useDeleteBankReconciliation,
  useUpdateBankReconciliation,
} from "@/hooks/use-bank-reconciliations";
import { useBusinesses } from "@/hooks/use-businesses";
import { useInterAccountTransfers } from "@/hooks/use-inter-account-transfers";
import { usePayments } from "@/hooks/use-payments";
import { useReceipts } from "@/hooks/use-receipts";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/bank-reconciliations")({
  component: BankReconciliationsPage,
});

function formatAmount(value: number) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function StatusBadge({ status }: { status: BankReconciliationStatus }) {
  if (status === "Reconciled") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 border border-green-200">
        Reconciled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 border border-red-200">
      Not Reconciled
    </span>
  );
}

function BankReconciliationsPage() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [activeReconciliationId, setActiveReconciliationId] = useState<string | null>(null);
  const [drillReconciliation, setDrillReconciliation] = useState<BankReconciliation | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useBankReconciliations(businessId, page, {
    q: q || undefined,
  });

  const deleteReconciliation = useDeleteBankReconciliation(businessId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalStatement = useMemo(
    () => data?.data.reduce((total, r) => total + r.statementBalance, 0) ?? 0,
    [data],
  );
  const totalDiscrepancy = useMemo(
    () => data?.data.reduce((total, r) => total + r.discrepancy, 0) ?? 0,
    [data],
  );

  const handleDelete = async (reconciliation: BankReconciliation) => {
    if (
      !window.confirm(
        `Hapus lembar rekonsiliasi "${reconciliation.bankAccountName}" tanggal ${reconciliation.date}? Ini cuma catatan pengecekan, jurnal tidak ikut terhapus.`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      await deleteReconciliation.mutateAsync(reconciliation.id);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Bank Reconciliations</h1>
          {data && (
            <p className="text-sm text-gray-500">{data.pagination.total} lembar rekonsiliasi</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveReconciliationId("new")}>Rekonsiliasi Baru</Button>
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
          placeholder="Cari bank, keterangan..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat rekonsiliasi...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada lembar rekonsiliasi.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Bank Account</th>
                    <th className="px-6 py-3 text-right font-medium">
                      Statement Balance
                    </th>
                    <th className="px-6 py-3 text-right font-medium">Discrepancy</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((reconciliation) => (
                    <tr key={reconciliation.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{reconciliation.date}</td>
                      <td className="px-6 py-3 text-gray-900">
                        {reconciliation.bankAccountName}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(reconciliation.statementBalance)}
                      </td>
                      <td className="px-6 py-3 text-right font-medium">
                        <button
                          type="button"
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                          title="Lihat transaksi penyusun saldo buku"
                          onClick={() => setDrillReconciliation(reconciliation)}
                        >
                          {formatAmount(reconciliation.discrepancy)}
                        </button>
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={reconciliation.status} />
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveReconciliationId(reconciliation.id)}
                          >
                            {canWrite ? "Edit" : "Lihat"}
                          </Button>
                          {canWrite && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteReconciliation.isPending}
                              onClick={() => void handleDelete(reconciliation)}
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
                    <td colSpan={2} className="px-6 py-3 font-medium text-gray-900">
                      Total
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">
                      {formatAmount(totalStatement)}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">
                      {formatAmount(totalDiscrepancy)}
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

      {activeReconciliationId && (
        <BankReconciliationFormDialog
          businessId={businessId}
          reconciliationId={activeReconciliationId}
          canWrite={canWrite}
          onClose={() => setActiveReconciliationId(null)}
        />
      )}

      {drillReconciliation && (
        <DiscrepancyDrillDialog
          businessId={businessId}
          reconciliation={drillReconciliation}
          onClose={() => setDrillReconciliation(null)}
        />
      )}
    </div>
  );
}

interface BankReconciliationFormDialogProps {
  businessId: string;
  reconciliationId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function BankReconciliationFormDialog({
  businessId,
  reconciliationId,
  canWrite,
  onClose,
}: BankReconciliationFormDialogProps) {
  const isNew = reconciliationId === "new";
  const { data: existingReconciliation, isPending: isReconciliationLoading } =
    useBankReconciliation(businessId, isNew ? null : reconciliationId);

  const { data: bankAccountsData, isPending: isBankAccountsLoading } = useBankAccounts(
    businessId,
    1,
    { status: "active" },
    100,
  );

  const createReconciliation = useCreateBankReconciliation(businessId);
  const updateReconciliation = useUpdateBankReconciliation(businessId);

  const [date, setDate] = useState(getTodayDateString());
  const [bankAccountId, setBankAccountId] = useState("");
  const [statementBalance, setStatementBalance] = useState("0");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && existingReconciliation) {
      setDate(existingReconciliation.date);
      setBankAccountId(existingReconciliation.bankAccountId);
      setStatementBalance(String(existingReconciliation.statementBalance));
      setDescription(existingReconciliation.description ?? "");
    }
  }, [isNew, existingReconciliation]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!bankAccountId) {
      setFormError("Rekening bank/kas wajib dipilih.");
      return;
    }

    const parsedBalance = parseFloat(statementBalance);
    if (statementBalance.trim() === "" || !Number.isFinite(parsedBalance)) {
      setFormError("Statement balance wajib diisi angka yang valid (boleh 0).");
      return;
    }

    const finalDate = date.trim() || getTodayDateString();

    try {
      if (isNew) {
        await createReconciliation.mutateAsync({
          date: finalDate,
          bankAccountId,
          statementBalance: parsedBalance,
          description: description.trim() || undefined,
        });
      } else {
        await updateReconciliation.mutateAsync({
          reconciliationId,
          date: finalDate,
          bankAccountId,
          statementBalance: parsedBalance,
          description: description.trim() || null,
        });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createReconciliation.isPending || updateReconciliation.isPending;
  const isInitialLoading = !isNew && isReconciliationLoading;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew
              ? "Rekonsiliasi Baru"
              : canWrite
                ? "Edit Rekonsiliasi"
                : "Detail Rekonsiliasi"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Lembar pengecekan saldo — tidak memposting jurnal apa pun."
              : "Lihat atau perbarui lembar rekonsiliasi."}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            Memuat data rekonsiliasi...
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

              {!isNew && existingReconciliation && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-md bg-gray-50 p-3 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Book Balance</div>
                    <div className="font-semibold text-gray-900">
                      {formatAmount(existingReconciliation.bookBalance)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Discrepancy</div>
                    <div className="font-semibold text-gray-900">
                      {formatAmount(existingReconciliation.discrepancy)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Status</div>
                    <StatusBadge status={existingReconciliation.status} />
                  </div>
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
                    Bank Account *
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={bankAccountId}
                    disabled={!canWrite || isBankAccountsLoading}
                    onChange={(event) => setBankAccountId(event.target.value)}
                    required
                  >
                    <option value="">-- Pilih Rekening --</option>
                    {bankAccountsData?.data.map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.name} ({ba.accountCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Statement Balance *
                  </label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={statementBalance}
                    disabled={!canWrite}
                    onChange={(event) => setStatementBalance(event.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Description
                  </label>
                  <Input
                    placeholder="Catatan (opsional)"
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
                    ? (isSubmitting ? "Menyimpan..." : "Simpan Rekonsiliasi")
                    : (isSubmitting ? "Menyimpan..." : "Perbarui Rekonsiliasi")}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface DrillRow {
  key: string;
  date: string;
  kind: string;
  reference: string | null;
  description: string | null;
  signedAmount: number;
}

function DiscrepancyDrillDialog({
  businessId,
  reconciliation,
  onClose,
}: {
  businessId: string;
  reconciliation: BankReconciliation;
  onClose: () => void;
}) {
  const cutoff = reconciliation.date;
  const accountId = reconciliation.bankAccountId;

  const { data: receiptsData, isPending: isReceiptsLoading } = useReceipts(businessId, 1, {}, 100);
  const { data: paymentsData, isPending: isPaymentsLoading } = usePayments(businessId, 1, {}, 100);
  const { data: transfersData, isPending: isTransfersLoading } = useInterAccountTransfers(businessId, 1, {}, 100);

  const rows: DrillRow[] = useMemo(() => {
    const out: DrillRow[] = [];
    for (const r of receiptsData?.data ?? []) {
      if (r.bankAccountId === accountId && r.date <= cutoff) {
        out.push({
          key: `receipt-${r.id}`,
          date: r.date,
          kind: "Receipt",
          reference: r.reference,
          description: r.description ?? r.contactName,
          signedAmount: r.totalAmount,
        });
      }
    }
    for (const p of paymentsData?.data ?? []) {
      if (p.bankAccountId === accountId && p.date <= cutoff) {
        out.push({
          key: `payment-${p.id}`,
          date: p.date,
          kind: "Payment",
          reference: p.reference,
          description: p.description ?? p.contactName,
          signedAmount: -p.totalAmount,
        });
      }
    }
    for (const t of transfersData?.data ?? []) {
      if (t.date > cutoff) continue;
      if (t.toBankAccountId === accountId) {
        out.push({
          key: `transfer-in-${t.id}`,
          date: t.date,
          kind: "Transfer In",
          reference: t.reference,
          description: t.description,
          signedAmount: t.amount,
        });
      }
      if (t.fromBankAccountId === accountId) {
        out.push({
          key: `transfer-out-${t.id}`,
          date: t.date,
          kind: "Transfer Out",
          reference: t.reference,
          description: t.description,
          signedAmount: -t.amount,
        });
      }
    }
    return out.sort((a, b) =>
      a.date === b.date ? a.kind.localeCompare(b.kind) : a.date < b.date ? -1 : 1,
    );
  }, [receiptsData, paymentsData, transfersData, accountId, cutoff]);

  const rowsTotal = useMemo(
    () => rows.reduce((sum, r) => sum + r.signedAmount, 0),
    [rows],
  );

  const isLoading = isReceiptsLoading || isPaymentsLoading || isTransfersLoading;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            Transaksi {reconciliation.bankAccountName} s.d. {cutoff}
          </DialogTitle>
          <DialogDescription>
            Semua Receipts, Payments, dan Transfers akun ini sampai tanggal cutoff —
            penyusun Book Balance {formatAmount(reconciliation.bookBalance)}.
            Statement {formatAmount(reconciliation.statementBalance)} −
            Book {formatAmount(reconciliation.bookBalance)} = Discrepancy{" "}
            {formatAmount(reconciliation.discrepancy)}.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto pr-2 flex-1">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-gray-500">Memuat transaksi...</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Tidak ada transaksi akun ini sampai tanggal cutoff.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-gray-50 uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Jenis</th>
                    <th className="px-3 py-2 font-medium">Reference</th>
                    <th className="px-3 py-2 font-medium">Keterangan</th>
                    <th className="px-3 py-2 text-right font-medium">Nominal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.key} className="hover:bg-gray-50">
                      <td className="p-2 text-gray-600">{row.date}</td>
                      <td className="p-2 text-gray-900">{row.kind}</td>
                      <td className="p-2 text-gray-900">{row.reference || "-"}</td>
                      <td className="p-2 text-gray-600">{row.description || "-"}</td>
                      <td
                        className={`p-2 text-right font-medium ${row.signedAmount < 0 ? "text-red-700" : "text-green-700"}`}
                      >
                        {formatAmount(row.signedAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={4} className="p-2 font-medium text-gray-900">
                      Total (= Book Balance)
                    </td>
                    <td className="p-2 text-right font-semibold text-gray-900">
                      {formatAmount(rowsTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
