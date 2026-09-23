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
  type Payment,
  type PaymentLineInput,
  useCreatePayment,
  useDeletePayment,
  usePayment,
  usePayments,
  useUpdatePayment,
} from "@/hooks/use-payments";
import { usePurchaseInvoices } from "@/hooks/use-purchase-invoices";
import { useSuppliers } from "@/hooks/use-suppliers";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/payments")({
  component: PaymentsPage,
});

function formatAmount(value: number) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function PaymentsPage() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = usePayments(businessId, page, {
    q: q || undefined,
  });

  const deletePayment = useDeletePayment(businessId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalAmount = useMemo(
    () => data?.data.reduce((total, p) => total + p.totalAmount, 0) ?? 0,
    [data],
  );

  const handleDelete = async (payment: Payment) => {
    const refText = payment.reference ? ` "${payment.reference}"` : "";
    if (
      !window.confirm(
        `Hapus pembayaran${refText} sebesar ${formatAmount(payment.totalAmount)} dari "${payment.bankAccountName}"? Jurnal terkait juga akan dihapus, dan alokasi ke Purchase Invoice (jika ada) akan dikembalikan.`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      await deletePayment.mutateAsync(payment.id);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Payments</h1>
          {data && (
            <p className="text-sm text-gray-500">{data.pagination.total} pembayaran</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActivePaymentId("new")}>Catat Pembayaran</Button>
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
          placeholder="Cari referensi, payee, keterangan..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat pembayaran...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada pembayaran.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Paid From</th>
                    <th className="px-6 py-3 font-medium">Payee</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 text-right font-medium">
                      Total Amount
                    </th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{payment.date}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {payment.reference || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {payment.bankAccountName}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {payment.contactName}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {payment.description || "-"}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(payment.totalAmount)}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActivePaymentId(payment.id)}
                          >
                            {canWrite ? "Edit" : "Lihat"}
                          </Button>
                          {canWrite && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deletePayment.isPending}
                              onClick={() => void handleDelete(payment)}
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

      {activePaymentId && (
        <PaymentFormDialog
          businessId={businessId}
          paymentId={activePaymentId}
          canWrite={canWrite}
          onClose={() => setActivePaymentId(null)}
        />
      )}
    </div>
  );
}

interface FormLine {
  id: string;
  accountId: string;
  purchaseInvoiceId: string;
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
    purchaseInvoiceId: "",
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

interface PaymentFormDialogProps {
  businessId: string;
  paymentId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function PaymentFormDialog({
  businessId,
  paymentId,
  canWrite,
  onClose,
}: PaymentFormDialogProps) {
  const isNew = paymentId === "new";
  const { data: existingPayment, isPending: isPaymentLoading } = usePayment(
    businessId,
    isNew ? null : paymentId,
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

  const { data: purchaseInvoicesData, isPending: isInvoicesLoading } =
    usePurchaseInvoices(businessId, 1, {}, 200);

  const createPayment = useCreatePayment(businessId);
  const updatePayment = useUpdatePayment(businessId);

  const [date, setDate] = useState(getTodayDateString());
  const [reference, setReference] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [contactId, setContactId] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<FormLine[]>([createEmptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && existingPayment) {
      setDate(existingPayment.date);
      setReference(existingPayment.reference ?? "");
      setBankAccountId(existingPayment.bankAccountId);
      setContactId(existingPayment.contactId);
      setDescription(existingPayment.description ?? "");

      if (existingPayment.lines && existingPayment.lines.length > 0) {
        setLines(
          existingPayment.lines.map((line) => ({
            id: line.id || Math.random().toString(36).substring(2, 9),
            accountId: line.accountId,
            purchaseInvoiceId: line.purchaseInvoiceId ?? "",
            description: line.description ?? "",
            amount: String(line.amount),
          })),
        );
      }
    }
  }, [isNew, existingPayment]);

  // Payee: gabungan customers + suppliers, dedupe per id (bisa bayar kontak
  // apapun, bukan cuma Supplier -- lihat Payments.md §3.1).
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

  // Akun baris: semua kategori KECUALI Revenue (uang keluar nggak masuk akal
  // dibayarkan atas nama akun pendapatan). Validasi final tetap di backend.
  const lineAccounts = useMemo(
    () => (accountsData?.data ?? []).filter((acc) => acc.category !== "Revenue"),
    [accountsData],
  );

  // Satu-satunya akun kontrol Accounts Payable bisnis ini (kalau ada) --
  // baris yang pakai akun ini memunculkan dropdown Invoice.
  const apControlAccountId = useMemo(() => {
    const apAccount = (accountsData?.data ?? []).find(
      (acc) => acc.category === "Liability" && acc.isControlAccount,
    );
    return apAccount?.id ?? null;
  }, [accountsData]);

  const allInvoicesById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof purchaseInvoicesData>["data"][number]>();
    for (const inv of purchaseInvoicesData?.data ?? []) {
      map.set(inv.id, inv);
    }
    return map;
  }, [purchaseInvoicesData]);

  // Invoice milik Payee yang dipilih dan masih ada tagihan (Unpaid/Overdue).
  const invoiceOptionsForPayee = useMemo(() => {
    if (!contactId) return [];
    return (purchaseInvoicesData?.data ?? []).filter(
      (inv) => inv.supplierId === contactId && inv.status !== "Paid",
    );
  }, [purchaseInvoicesData, contactId]);

  function invoiceOptionsForLine(line: FormLine) {
    if (line.purchaseInvoiceId && !invoiceOptionsForPayee.some((inv) => inv.id === line.purchaseInvoiceId)) {
      const current = allInvoicesById.get(line.purchaseInvoiceId);
      if (current) return [current, ...invoiceOptionsForPayee];
    }
    return invoiceOptionsForPayee;
  }

  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLine()]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateLine = (index: number, field: keyof FormLine, value: string) => {
    setLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== index) return line;
        const next = { ...line, [field]: value };
        // Ganti akun jadi bukan AP control -> invoice yang dipilih (kalau
        // ada) jadi tidak relevan lagi, kosongkan.
        if (field === "accountId" && value !== apControlAccountId) {
          next.purchaseInvoiceId = "";
        }
        return next;
      }),
    );
  };

  // Ganti Payee -> alokasi invoice lama (milik Payee sebelumnya) sudah
  // tidak valid, kosongkan semua alokasi baris.
  const handleContactChange = (value: string) => {
    setContactId(value);
    setLines((prev) => prev.map((line) => ({ ...line, purchaseInvoiceId: "" })));
  };

  const liveTotalAmount = useMemo(() => {
    return lines.reduce((sum, line) => sum + computeLineAmount(line), 0);
  }, [lines]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!bankAccountId) {
      setFormError("Paid from (rekening bank/kas) wajib dipilih.");
      return;
    }
    if (!contactId) {
      setFormError("Payee wajib dipilih.");
      return;
    }

    const finalDate = date.trim() || getTodayDateString();

    if (lines.length === 0) {
      setFormError("Pembayaran wajib memiliki minimal 1 baris item.");
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
      if (line.purchaseInvoiceId) {
        const invoice = allInvoicesById.get(line.purchaseInvoiceId);
        if (invoice && amount > invoice.balanceDue) {
          setFormError(
            `Baris #${i + 1}: Nominal (${formatAmount(amount)}) melebihi sisa tagihan invoice (${formatAmount(invoice.balanceDue)}).`,
          );
          return;
        }
      }
    }

    const formattedLines: PaymentLineInput[] = lines.map((l) => ({
      accountId: l.accountId,
      purchaseInvoiceId: l.purchaseInvoiceId || null,
      description: l.description.trim() || null,
      amount: parseFloat(l.amount) || 0,
    }));

    try {
      if (isNew) {
        await createPayment.mutateAsync({
          date: finalDate,
          reference: reference.trim() || undefined,
          bankAccountId,
          contactId,
          description: description.trim() || undefined,
          lines: formattedLines,
        });
      } else {
        await updatePayment.mutateAsync({
          paymentId,
          date: finalDate,
          reference: reference.trim() || null,
          bankAccountId,
          contactId,
          description: description.trim() || null,
          lines: formattedLines,
        });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createPayment.isPending || updatePayment.isPending;
  const isInitialLoading = !isNew && isPaymentLoading;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew
              ? "Catat Pembayaran"
              : canWrite
                ? "Edit Pembayaran"
                : "Detail Pembayaran"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Catat pembayaran baru. Jurnal kas/bank akan otomatis diposting, dan alokasi ke Purchase Invoice (kalau ada) langsung mengurangi sisa tagihannya."
              : "Lihat atau perbarui pembayaran beserta baris itemnya."}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            Memuat data pembayaran...
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
                    placeholder="Contoh: PMT-2026-001 (opsional)"
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
                    Payee *
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={contactId}
                    disabled={!canWrite || isContactsLoading}
                    onChange={(event) => handleContactChange(event.target.value)}
                    required
                  >
                    <option value="">-- Pilih Payee --</option>
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
                    placeholder="Keterangan pembayaran (opsional)"
                    value={description}
                    disabled={!canWrite}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Baris Item Pembayaran
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
                          Account (bukan Revenue) *
                        </th>
                        <th className="px-3 py-2 font-medium min-w-[220px]">
                          Invoice
                        </th>
                        <th className="px-3 py-2 font-medium min-w-[160px]">
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
                        const isApLine =
                          apControlAccountId != null && line.accountId === apControlAccountId;
                        const selectedInvoice = line.purchaseInvoiceId
                          ? allInvoicesById.get(line.purchaseInvoiceId)
                          : undefined;

                        return (
                          <tr key={line.id} className="hover:bg-gray-50">
                            <td className="p-2 align-top">
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
                            </td>
                            <td className="p-2 align-top">
                              {isApLine ? (
                                <>
                                  <select
                                    className="w-full h-8 rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                    value={line.purchaseInvoiceId}
                                    disabled={!canWrite || isInvoicesLoading || !contactId}
                                    onChange={(event) =>
                                      updateLine(index, "purchaseInvoiceId", event.target.value)
                                    }
                                  >
                                    <option value="">-- Tanpa Alokasi Invoice --</option>
                                    {invoiceOptionsForLine(line).map((inv) => (
                                      <option key={inv.id} value={inv.id}>
                                        {inv.reference || inv.issueDate} - Sisa{" "}
                                        {formatAmount(inv.balanceDue)}
                                      </option>
                                    ))}
                                  </select>
                                  {!contactId && (
                                    <p className="mt-0.5 text-[10px] text-amber-600">
                                      Pilih Payee dulu.
                                    </p>
                                  )}
                                  {contactId &&
                                    invoiceOptionsForPayee.length === 0 &&
                                    !isInvoicesLoading && (
                                      <p className="mt-0.5 text-[10px] text-amber-600">
                                        Payee ini tidak punya Purchase Invoice
                                        yang belum lunas.
                                      </p>
                                    )}
                                  {selectedInvoice && (
                                    <p className="mt-0.5 text-[10px] text-gray-500">
                                      Sisa tagihan: {formatAmount(selectedInvoice.balanceDue)}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <span className="text-[10px] text-gray-400">
                                  Hanya untuk akun kontrol Accounts Payable
                                </span>
                              )}
                            </td>
                            <td className="p-2 align-top">
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
                            <td className="p-2 align-top">
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
                              <td className="p-2 text-center align-top">
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
                    <div className="text-xs text-gray-500">Total Pembayaran</div>
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
                    ? (isSubmitting ? "Menyimpan..." : "Simpan Pembayaran")
                    : (isSubmitting ? "Menyimpan..." : "Perbarui Pembayaran")}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
