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
import { useCustomers } from "@/hooks/use-customers";
import {
  getTodayDateString,
  type JournalEntry,
  type JournalEntryLineInput,
  useCreateJournalEntry,
  useDeleteJournalEntry,
  useJournalEntries,
  useJournalEntry,
  useUpdateJournalEntry,
} from "@/hooks/use-journal-entries";
import { useSuppliers } from "@/hooks/use-suppliers";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/journal-entries")({
  component: JournalEntriesPage,
});

function formatAmount(value: number) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const SOURCE_MODULE_LABELS: Record<string, string> = {
  manual_journal: "Manual",
  sales_invoice: "Sales Invoice",
  purchase_invoice: "Purchase Invoice",
  receipt: "Receipt",
  payment: "Payment",
  inter_account_transfer: "Transfer",
};

function sourceLabel(sourceModule: string): string {
  return SOURCE_MODULE_LABELS[sourceModule] ?? sourceModule;
}

function SourceBadge({ sourceModule }: { sourceModule: string }) {
  const isManual = sourceModule === "manual_journal";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
        isManual
          ? "bg-blue-100 text-blue-800 border-blue-200"
          : "bg-gray-100 text-gray-700 border-gray-200"
      }`}
    >
      {sourceLabel(sourceModule)}
    </span>
  );
}

const SOURCE_FILTER_OPTIONS = [
  { value: "", label: "Semua Source" },
  { value: "manual_journal", label: "Manual" },
  { value: "sales_invoice", label: "Sales Invoice" },
  { value: "purchase_invoice", label: "Purchase Invoice" },
  { value: "receipt", label: "Receipt" },
  { value: "payment", label: "Payment" },
  { value: "inter_account_transfer", label: "Transfer" },
];

function JournalEntriesPage() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [sourceModule, setSourceModule] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [viewEntryId, setViewEntryId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useJournalEntries(businessId, page, {
    q: q || undefined,
    sourceModule: sourceModule || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const deleteEntry = useDeleteJournalEntry(businessId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalDebit = useMemo(
    () => data?.data.reduce((total, e) => total + e.totalDebit, 0) ?? 0,
    [data],
  );

  const handleDelete = async (entry: JournalEntry) => {
    const refText = entry.reference ? ` "${entry.reference}"` : "";
    if (
      !window.confirm(
        `Hapus jurnal manual${refText} tanggal ${entry.entryDate} sebesar ${formatAmount(entry.totalDebit)}?`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      await deleteEntry.mutateAsync(entry.id);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
    }
  };

  const resetPage = () => setPage(1);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Journal Entries</h1>
          {data && (
            <p className="text-sm text-gray-500">{data.pagination.total} jurnal</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveEntryId("new")}>Jurnal Manual Baru</Button>
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
          placeholder="Cari referensi, keterangan..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={sourceModule}
          onChange={(event) => {
            setSourceModule(event.target.value);
            resetPage();
          }}
        >
          {SOURCE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
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
            <p className="p-6 text-sm text-gray-500">Memuat jurnal...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada jurnal.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Entry Date</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Source</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 text-right font-medium">
                      Total Amount
                    </th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{entry.entryDate}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {entry.reference || "-"}
                      </td>
                      <td className="px-6 py-3">
                        <SourceBadge sourceModule={entry.sourceModule} />
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {entry.description || "-"}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(entry.totalDebit)}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setViewEntryId(entry.id)}
                          >
                            Lihat
                          </Button>
                          {canWrite && entry.isManual && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveEntryId(entry.id)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={deleteEntry.isPending}
                                onClick={() => void handleDelete(entry)}
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
                      {formatAmount(totalDebit)}
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

      {viewEntryId && (
        <JournalEntryDetailDialog
          businessId={businessId}
          entryId={viewEntryId}
          onClose={() => setViewEntryId(null)}
        />
      )}

      {activeEntryId && (
        <JournalEntryFormDialog
          businessId={businessId}
          entryId={activeEntryId}
          canWrite={canWrite}
          onClose={() => setActiveEntryId(null)}
        />
      )}
    </div>
  );
}

function JournalEntryDetailDialog({
  businessId,
  entryId,
  onClose,
}: {
  businessId: string;
  entryId: string;
  onClose: () => void;
}) {
  const { data: entry, isPending } = useJournalEntry(businessId, entryId);

  const totalDebit = entry?.lines.reduce((s, l) => s + l.debit, 0) ?? 0;
  const totalCredit = entry?.lines.reduce((s, l) => s + l.credit, 0) ?? 0;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            Detail Jurnal {entry ? `— ${entry.reference || entry.id.slice(0, 8)}` : ""}
          </DialogTitle>
          <DialogDescription>
            {entry ? (
              <>
                {entry.entryDate} · <SourceBadge sourceModule={entry.sourceModule} /> ·{" "}
                {entry.description || "Tanpa keterangan"}
              </>
            ) : (
              "Memuat detail jurnal..."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto pr-2 flex-1">
          {isPending || !entry ? (
            <p className="py-8 text-center text-sm text-gray-500">Memuat baris jurnal...</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-gray-50 uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 font-medium">Contact</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 text-right font-medium">Debit</th>
                    <th className="px-3 py-2 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entry.lines.map((line) => (
                    <tr key={line.id} className="hover:bg-gray-50">
                      <td className="p-2 text-gray-900">
                        {line.accountCode} - {line.accountName}
                      </td>
                      <td className="p-2 text-gray-900">{line.contactName || "-"}</td>
                      <td className="p-2 text-gray-600">{line.description || "-"}</td>
                      <td className="p-2 text-right text-gray-900">
                        {formatAmount(line.debit)}
                      </td>
                      <td className="p-2 text-right text-gray-900">
                        {formatAmount(line.credit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={3} className="p-2 font-medium text-gray-900">
                      Total
                    </td>
                    <td className="p-2 text-right font-semibold text-gray-900">
                      {formatAmount(totalDebit)}
                    </td>
                    <td className="p-2 text-right font-semibold text-gray-900">
                      {formatAmount(totalCredit)}
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

interface FormLine {
  id: string;
  accountId: string;
  contactId: string;
  debit: string;
  credit: string;
  description: string;
}

function parseAmountToCents(value: string): number {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

function createEmptyLine(): FormLine {
  return {
    id: Math.random().toString(36).substring(2, 9),
    accountId: "",
    contactId: "",
    debit: "",
    credit: "",
    description: "",
  };
}

interface ContactOption {
  id: string;
  name: string;
  kinds: string[];
}

interface JournalEntryFormDialogProps {
  businessId: string;
  entryId: string; // "new" atau UUID (selalu manual)
  canWrite: boolean;
  onClose: () => void;
}

function JournalEntryFormDialog({
  businessId,
  entryId,
  canWrite,
  onClose,
}: JournalEntryFormDialogProps) {
  const isNew = entryId === "new";
  const { data: existingEntry, isPending: isEntryLoading } = useJournalEntry(
    businessId,
    isNew ? null : entryId,
  );

  const { data: accountsData, isPending: isAccountsLoading } = useAccounts(
    businessId,
    1,
    {},
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

  const createEntry = useCreateJournalEntry(businessId);
  const updateEntry = useUpdateJournalEntry(businessId);

  const [entryDate, setEntryDate] = useState(getTodayDateString());
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<FormLine[]>([createEmptyLine(), createEmptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && existingEntry) {
      setEntryDate(existingEntry.entryDate);
      setReference(existingEntry.reference ?? "");
      setDescription(existingEntry.description ?? "");
      if (existingEntry.lines && existingEntry.lines.length > 0) {
        setLines(
          existingEntry.lines.map((line) => ({
            id: line.id || Math.random().toString(36).substring(2, 9),
            accountId: line.accountId,
            contactId: line.contactId ?? "",
            debit: line.debit > 0 ? String(line.debit) : "",
            credit: line.credit > 0 ? String(line.credit) : "",
            description: line.description ?? "",
          })),
        );
      }
    }
  }, [isNew, existingEntry]);

  const contactOptions: ContactOption[] = useMemo(() => {
    const map = new Map<string, ContactOption>();
    for (const c of customersData?.data ?? []) {
      const entry = map.get(c.id) ?? { id: c.id, name: c.name, kinds: [] };
      if (!entry.kinds.includes("Customer")) entry.kinds.push("Customer");
      map.set(c.id, entry);
    }
    for (const s of suppliersData?.data ?? []) {
      const entry = map.get(s.id) ?? { id: s.id, name: s.name, kinds: [] };
      if (!entry.kinds.includes("Supplier")) entry.kinds.push("Supplier");
      map.set(s.id, entry);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [customersData, suppliersData]);

  const isContactsLoading = isCustomersLoading || isSuppliersLoading;
  const allAccounts = accountsData?.data ?? [];

  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLine()]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateLine = (index: number, field: keyof FormLine, value: string) => {
    setLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== index) return line;
        const next = { ...line, [field]: value };
        // Satu baris cuma boleh satu sisi: isi sisi ini -> kosongkan sisi lain.
        if (field === "debit" && value.trim() !== "") next.credit = "";
        if (field === "credit" && value.trim() !== "") next.debit = "";
        return next;
      }),
    );
  };

  const totals = useMemo(() => {
    let debitCents = 0;
    let creditCents = 0;
    for (const line of lines) {
      debitCents += parseAmountToCents(line.debit);
      creditCents += parseAmountToCents(line.credit);
    }
    return { debitCents, creditCents };
  }, [lines]);

  const validationError: string | null = useMemo(() => {
    if (lines.length < 2) return "Jurnal manual wajib punya minimal 2 baris.";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.accountId) return `Baris #${i + 1}: Akun wajib dipilih.`;
      const filled =
        (parseAmountToCents(line.debit) > 0 ? 1 : 0) +
        (parseAmountToCents(line.credit) > 0 ? 1 : 0);
      if (filled !== 1)
        return `Baris #${i + 1}: isi tepat satu dari debit ATAU kredit.`;
    }
    if (totals.debitCents !== totals.creditCents)
      return "Total debit harus sama dengan total kredit.";
    if (totals.debitCents <= 0) return "Total jurnal harus lebih dari 0.";
    return null;
  }, [lines, totals]);

  const isBalanced = totals.debitCents === totals.creditCents && totals.debitCents > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    const finalDate = entryDate.trim() || getTodayDateString();
    const formattedLines: JournalEntryLineInput[] = lines.map((l) => ({
      accountId: l.accountId,
      contactId: l.contactId || null,
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
      description: l.description.trim() || null,
    }));

    try {
      if (isNew) {
        await createEntry.mutateAsync({
          entryDate: finalDate,
          reference: reference.trim() || undefined,
          description: description.trim() || undefined,
          lines: formattedLines,
        });
      } else {
        await updateEntry.mutateAsync({
          entryId,
          entryDate: finalDate,
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

  const isSubmitting = createEntry.isPending || updateEntry.isPending;
  const isInitialLoading = !isNew && isEntryLoading;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew
              ? "Jurnal Manual Baru"
              : canWrite
                ? "Edit Jurnal Manual"
                : "Detail Jurnal Manual"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Jurnal koreksi/penyesuaian. Wajib balance sebelum bisa disimpan."
              : "Lihat atau perbarui jurnal manual beserta barisnya."}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            Memuat data jurnal...
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
                    Entry Date *
                  </label>
                  <Input
                    type="date"
                    value={entryDate}
                    disabled={!canWrite}
                    onChange={(event) => setEntryDate(event.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Reference
                  </label>
                  <Input
                    placeholder="Contoh: ADJ-2026-001 (opsional)"
                    value={reference}
                    disabled={!canWrite}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Description
                  </label>
                  <Input
                    placeholder="Keterangan jurnal (opsional)"
                    value={description}
                    disabled={!canWrite}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Baris Jurnal (minimal 2)
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
                          Account *
                        </th>
                        <th className="px-3 py-2 font-medium min-w-[160px]">
                          Contact
                        </th>
                        <th className="px-3 py-2 font-medium min-w-[150px]">
                          Description
                        </th>
                        <th className="px-3 py-2 text-right font-medium w-32">
                          Debit
                        </th>
                        <th className="px-3 py-2 text-right font-medium w-32">
                          Credit
                        </th>
                        {canWrite && (
                          <th className="px-3 py-2 text-center font-medium w-16">
                            Hapus
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((line, index) => (
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
                              {allAccounts.map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.code} - {acc.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <select
                              className="w-full h-8 rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                              value={line.contactId}
                              disabled={!canWrite || isContactsLoading}
                              onChange={(event) =>
                                updateLine(index, "contactId", event.target.value)
                              }
                            >
                              <option value="">-- Tanpa Kontak --</option>
                              {contactOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name} ({c.kinds.join(", ")})
                                </option>
                              ))}
                            </select>
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
                              min="0"
                              className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 text-right"
                              placeholder="0.00"
                              value={line.debit}
                              disabled={!canWrite}
                              onChange={(event) =>
                                updateLine(index, "debit", event.target.value)
                              }
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 text-right"
                              placeholder="0.00"
                              value={line.credit}
                              disabled={!canWrite}
                              onChange={(event) =>
                                updateLine(index, "credit", event.target.value)
                              }
                            />
                          </td>
                          {canWrite && (
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                className="text-red-600 hover:text-red-800 disabled:text-gray-400"
                                disabled={lines.length <= 2}
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
                    <div className="text-xs text-gray-500">Total Debit</div>
                    <div
                      className={`text-lg font-semibold ${isBalanced ? "text-gray-900" : "text-red-600"}`}
                    >
                      {formatAmount(totals.debitCents / 100)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Total Credit</div>
                    <div
                      className={`text-lg font-semibold ${isBalanced ? "text-gray-900" : "text-red-600"}`}
                    >
                      {formatAmount(totals.creditCents / 100)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Status</div>
                    <div
                      className={`text-sm font-semibold ${isBalanced ? "text-green-700" : "text-red-600"}`}
                    >
                      {isBalanced ? "Balance ✓" : "Belum balance"}
                    </div>
                  </div>
                </div>
                {validationError && canWrite && (
                  <p className="mt-2 text-right text-xs text-red-600">{validationError}</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Batal
              </Button>
              {canWrite && (
                <Button
                  type="submit"
                  disabled={isSubmitting || validationError !== null}
                >
                  {isNew
                    ? (isSubmitting ? "Menyimpan..." : "Simpan Jurnal")
                    : (isSubmitting ? "Menyimpan..." : "Perbarui Jurnal")}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
