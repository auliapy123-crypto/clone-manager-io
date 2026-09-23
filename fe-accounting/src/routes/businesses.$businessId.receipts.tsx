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
import { useBankAccounts } from "@/hooks/use-bank-accounts";
import { useBusinesses } from "@/hooks/use-businesses";
import { useCustomers } from "@/hooks/use-customers";
import {
  getTodayDateString,
  type Receipt,
  type ReceiptLineInput,
  useCreateReceipt,
  useDeleteReceipt,
  useReceipt,
  useReceipts,
  useUpdateReceipt,
} from "@/hooks/use-receipts";
import { useSuppliers } from "@/hooks/use-suppliers";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/receipts")({
  component: ReceiptsPage,
});

function formatAmount(value: number) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function ReceiptsPage() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [activeReceiptId, setActiveReceiptId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useReceipts(businessId, page, {
    q: q || undefined,
  });

  const deleteReceipt = useDeleteReceipt(businessId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalAmount = useMemo(
    () => data?.data.reduce((total, r) => total + r.totalAmount, 0) ?? 0,
    [data],
  );

  const handleDelete = async (receipt: Receipt) => {
    const refText = receipt.reference ? ` "${receipt.reference}"` : "";
    if (
      !window.confirm(
        `Hapus penerimaan${refText} sebesar ${formatAmount(receipt.totalAmount)} ke "${receipt.bankAccountName}"? Jurnal terkait juga akan dihapus.`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      await deleteReceipt.mutateAsync(receipt.id);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Receipts</h1>
          {data && (
            <p className="text-sm text-gray-500">{data.pagination.total} penerimaan</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveReceiptId("new")}>Catat Penerimaan</Button>
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
          placeholder="Cari referensi, kontak, keterangan..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat penerimaan...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada penerimaan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Received In</th>
                    <th className="px-6 py-3 font-medium">Paid By</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 text-right font-medium">
                      Total Amount
                    </th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((receipt) => (
                    <tr key={receipt.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{receipt.date}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {receipt.reference || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {receipt.bankAccountName}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {receipt.contactName || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {receipt.description || "-"}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(receipt.totalAmount)}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveReceiptId(receipt.id)}
                          >
                            {canWrite ? "Edit" : "Lihat"}
                          </Button>
                          {canWrite && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteReceipt.isPending}
                              onClick={() => void handleDelete(receipt)}
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
                    <td colSpan={5} className="px-6 py-3 font-medium text-gray-900">
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

      {activeReceiptId && (
        <ReceiptFormDialog
          businessId={businessId}
          receiptId={activeReceiptId}
          canWrite={canWrite}
          onClose={() => setActiveReceiptId(null)}
        />
      )}
    </div>
  );
}

interface FormLine {
  id: string;
  accountId: string;
  description: string;
  amount: string;
}

function computeLineAmount(line: FormLine): number {
  return parseFloat(line.amount) || 0;
}

function createEmptyLine(): FormLine {
  return {
    id: Math.random().toString(36).substring(2, 9),
    accountId: "",
    description: "",
    amount: "",
  };
}

interface ContactOption {
  id: string;
  name: string;
  code: string | null;
  kinds: string[];
}

interface ReceiptFormDialogProps {
  businessId: string;
  receiptId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function ReceiptFormDialog({
  businessId,
  receiptId,
  canWrite,
  onClose,
}: ReceiptFormDialogProps) {
  const isNew = receiptId === "new";
  const { data: existingReceipt, isPending: isReceiptLoading } = useReceipt(
    businessId,
    isNew ? null : receiptId,
  );

  const { data: bankAccountsData, isPending: isBankAccountsLoading } = useBankAccounts(
    businessId,
    1,
    { status: "active" },
    100,
  );

  const { data: customersData, isPending: isCustomersLoading } = useCustomers(
    businessId,
    1,
    {},
    100,
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
    {},
    100,
  );

  const createReceipt = useCreateReceipt(businessId);
  const updateReceipt = useUpdateReceipt(businessId);

  const [date, setDate] = useState(getTodayDateString());
  const [reference, setReference] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [contactId, setContactId] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<FormLine[]>([createEmptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && existingReceipt) {
      setDate(existingReceipt.date);
      setReference(existingReceipt.reference ?? "");
      setBankAccountId(existingReceipt.bankAccountId);
      setContactId(existingReceipt.contactId ?? "");
      setDescription(existingReceipt.description ?? "");

      if (existingReceipt.lines && existingReceipt.lines.length > 0) {
        setLines(
          existingReceipt.lines.map((line) => ({
            id: line.id || Math.random().toString(36).substring(2, 9),
            accountId: line.accountId,
            description: line.description ?? "",
            amount: String(line.amount),
          })),
        );
      }
    }
  }, [isNew, existingReceipt]);

  // Paid by: gabungan customers + suppliers, dedupe per id.
  const contactOptions: ContactOption[] = useMemo(() => {
    const map = new Map<string, ContactOption>();
    for (const c of customersData?.data ?? []) {
      const entry = map.get(c.id) ?? { id: c.id, name: c.name, code: c.code, kinds: [] };
      if (!entry.kinds.includes("Customer")) entry.kinds.push("Customer");
      map.set(c.id, entry);
    }
    for (const s of suppliersData?.data ?? []) {
      const entry = map.get(s.id) ?? { id: s.id, name: s.name, code: s.code, kinds: [] };
      if (!entry.kinds.includes("Supplier")) entry.kinds.push("Supplier");
      map.set(s.id, entry);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [customersData, suppliersData]);

  const isContactsLoading = isCustomersLoading || isSuppliersLoading;

  // Akun baris: semua kategori KECUALI Asset (supaya tidak dobel-catat
  // dengan akun bank/kas). Validasi final tetap di backend.
  const lineAccounts = useMemo(
    () => (accountsData?.data ?? []).filter((acc) => acc.category !== "Asset"),
    [accountsData],
  );

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
    return lines.reduce((sum, line) => sum + computeLineAmount(line), 0);
  }, [lines]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!bankAccountId) {
      setFormError("Rekening bank/kas tujuan (Received in) wajib dipilih.");
      return;
    }

    const finalDate = date.trim() || getTodayDateString();

    if (lines.length === 0) {
      setFormError("Penerimaan wajib memiliki minimal 1 baris item.");
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.accountId) {
        setFormError(`Baris #${i + 1}: Akun wajib dipilih.`);
        return;
      }
      const amount = parseFloat(line.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setFormError(`Baris #${i + 1}: Nominal harus lebih dari 0.`);
        return;
      }
    }

    const formattedLines: ReceiptLineInput[] = lines.map((l) => ({
      accountId: l.accountId,
      description: l.description.trim() || null,
      amount: parseFloat(l.amount) || 0,
    }));

    try {
      if (isNew) {
        await createReceipt.mutateAsync({
          date: finalDate,
          reference: reference.trim() || undefined,
          bankAccountId,
          contactId: contactId || undefined,
          description: description.trim() || undefined,
          lines: formattedLines,
        });
      } else {
        await updateReceipt.mutateAsync({
          receiptId,
          date: finalDate,
          reference: reference.trim() || null,
          bankAccountId,
          contactId: contactId || null,
          description: description.trim() || null,
          lines: formattedLines,
        });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createReceipt.isPending || updateReceipt.isPending;
  const isInitialLoading = !isNew && isReceiptLoading;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew
              ? "Catat Penerimaan"
              : canWrite
                ? "Edit Penerimaan"
                : "Detail Penerimaan"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Catat penerimaan baru. Jurnal kas/bank akan otomatis diposting."
              : "Lihat atau perbarui penerimaan beserta baris itemnya."}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            Memuat data penerimaan...
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
                    placeholder="Contoh: RCV-2026-001 (opsional)"
                    value={reference}
                    disabled={!canWrite}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Received In *
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
                    Paid By (opsional)
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={contactId}
                    disabled={!canWrite || isContactsLoading}
                    onChange={(event) => setContactId(event.target.value)}
                  >
                    <option value="">-- Tanpa Kontak --</option>
                    {contactOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.kinds.join(", ")})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Description
                  </label>
                  <Input
                    placeholder="Keterangan penerimaan (opsional)"
                    value={description}
                    disabled={!canWrite}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Baris Item Penerimaan
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
                        <th className="px-3 py-2 font-medium min-w-[220px]">
                          Account (bukan Asset) *
                        </th>
                        <th className="px-3 py-2 font-medium min-w-[180px]">
                          Description
                        </th>
                        <th className="px-3 py-2 text-right font-medium w-40">
                          Amount *
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
                                {lineAccounts.map((acc) => (
                                  <option key={acc.id} value={acc.id}>
                                    {acc.code} - {acc.name}
                                  </option>
                                ))}
                              </select>
                              {lineAccounts.length === 0 &&
                                !isAccountsLoading && (
                                  <p className="mt-0.5 text-[10px] text-amber-600">
                                    Belum ada akun non-Asset
                                  </p>
                                )}
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                placeholder="Deskripsi baris"
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
                                min="0.01"
                                className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 text-right"
                                placeholder="0.00"
                                value={line.amount}
                                disabled={!canWrite}
                                onChange={(event) =>
                                  updateLine(index, "amount", event.target.value)
                                }
                                required
                              />
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
                    <div className="text-xs text-gray-500">Total Penerimaan</div>
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
                    ? (isSubmitting ? "Menyimpan..." : "Simpan Penerimaan")
                    : (isSubmitting ? "Menyimpan..." : "Perbarui Penerimaan")}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
