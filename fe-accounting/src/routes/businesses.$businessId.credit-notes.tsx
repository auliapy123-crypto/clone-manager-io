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
import {
  getTodayDateString,
  type CreditNote,
  type CreditNoteLineInput,
  useCreateCreditNote,
  useDeleteCreditNote,
  useCreditNote,
  useCreditNotes,
  useUpdateCreditNote,
} from "@/hooks/use-credit-notes";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/credit-notes")({
  component: CreditNotesPage,
});

function formatAmount(value: number) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function CreditNotesPage() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useCreditNotes(businessId, page, q || undefined, 10);
  const deleteNote = useDeleteCreditNote(businessId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalAmount = useMemo(
    () => data?.data.reduce((total, note) => total + note.totalAmount, 0) ?? 0,
    [data],
  );

  const handleDelete = async (note: CreditNote) => {
    const refText = note.reference ? ` "${note.reference}"` : "";
    if (
      !window.confirm(
        `Hapus nota kredit${refText} untuk pelanggan "${note.customerName}"? Jurnal terkait juga akan dihapus.`,
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      await deleteNote.mutateAsync(note.id);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Credit Notes</h1>
          {data && (
            <p className="text-sm text-gray-500">{data.pagination.total} nota kredit</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveNoteId("new")}>Nota Kredit Baru</Button>
        )}
      </div>

      {deleteError && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      <Input
        className="max-w-xs"
        placeholder="Cari referensi, pelanggan, keterangan..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat nota kredit...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada nota kredit.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Issue Date</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Customer</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 text-right font-medium">
                      Total Amount
                    </th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((note) => (
                    <tr key={note.id} className="border-b hover:bg-gray-50">
                      <td className="px-6 py-4">{note.issueDate}</td>
                      <td className="px-6 py-4">{note.reference || "-"}</td>
                      <td className="px-6 py-4">{note.customerName}</td>
                      <td className="px-6 py-4">{note.description || "-"}</td>
                      <td className="px-6 py-4 text-right">{formatAmount(note.totalAmount)}</td>
                      <td className="px-6 py-4 text-sm">
                        {canWrite && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setActiveNoteId(note.id)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(note)}
                            >
                              Hapus
                            </Button>
                          </div>
                        )}
                        {!canWrite && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveNoteId(note.id)}
                          >
                            Detail
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-6 py-4 font-medium text-gray-900">
                      Total
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">
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

      {/* Dialog form */}
      {activeNoteId && (
        <CreditNoteFormDialog
          businessId={businessId}
          noteId={activeNoteId === "new" ? null : activeNoteId}
          onClose={() => setActiveNoteId(null)}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}

function CreditNoteFormDialog({
  businessId,
  noteId,
  onClose,
  canWrite,
}: {
  businessId: string;
  noteId: string | null;
  onClose: () => void;
  canWrite: boolean;
}) {
  const { data: note, isLoading } = useCreditNote(businessId, noteId);
  const { data: customers } = useCustomers(businessId, 1, {}, 100);
  // Filter kategori Revenue di SERVER (pola Sales Invoices/Receipts).
  // pageSize melebihi 100 selalu ditolak backend (PaginationQuerySchema
  // max 100) dengan 400 -- request pageSize 1000 membuat data akun tak
  // pernah terisi dan dropdown Account kosong.
  const { data: accounts } = useAccounts(
    businessId,
    1,
    { category: "Revenue" },
    100,
  );
  const createMutation = useCreateCreditNote(businessId);
  const updateMutation = useUpdateCreditNote(businessId);

  const [formData, setFormData] = useState({
    customerId: "",
    issueDate: getTodayDateString(),
    reference: "",
    description: "",
    lines: [{ accountId: "", description: "", quantity: 1, unitPrice: 0 }] as CreditNoteLineInput[],
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (note) {
      setFormData({
        customerId: note.customerId,
        issueDate: note.issueDate,
        reference: note.reference || "",
        description: note.description || "",
        lines: note.lines.map((l) => ({
          accountId: l.accountId,
          description: l.description || "",
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      });
    }
  }, [note]);

  const revenueAccounts = useMemo(() => accounts?.data ?? [], [accounts]);

  const totalAmount = useMemo(
    () =>
      formData.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [formData.lines],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);

    try {
      if (!formData.customerId) {
        setFormError("Pelanggan wajib dipilih.");
        return;
      }

      if (formData.lines.length === 0) {
        setFormError("Minimal 1 baris item diperlukan.");
        return;
      }

      for (const line of formData.lines) {
        if (!line.accountId) {
          setFormError("Akun di setiap baris wajib dipilih.");
          return;
        }
        if (line.quantity <= 0) {
          setFormError("Kuantitas harus lebih dari 0.");
          return;
        }
      }

      if (noteId) {
        await updateMutation.mutateAsync({
          creditNoteId: noteId,
          customerId: formData.customerId,
          issueDate: formData.issueDate,
          reference: formData.reference || undefined,
          description: formData.description || null,
          lines: formData.lines,
        });
      } else {
        await createMutation.mutateAsync({
          customerId: formData.customerId,
          issueDate: formData.issueDate,
          reference: formData.reference || undefined,
          description: formData.description || null,
          lines: formData.lines,
        });
      }

      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [
        ...formData.lines,
        { accountId: "", description: "", quantity: 1, unitPrice: 0 },
      ],
    });
  };

  const removeLine = (index: number) => {
    setFormData({
      ...formData,
      lines: formData.lines.filter((_, i) => i !== index),
    });
  };

  const updateLine = (index: number, field: string, value: unknown) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setFormData({ ...formData, lines: newLines });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{noteId ? "Edit Nota Kredit" : "Buat Nota Kredit"}</DialogTitle>
          <DialogDescription>
            {noteId ? "Ubah data nota kredit" : "Buat nota kredit baru"}
          </DialogDescription>
        </DialogHeader>

        {formError && (
          <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {formError}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-gray-500">Memuat data...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Pelanggan *
                </label>
                <select
                  disabled={!canWrite || isSaving}
                  value={formData.customerId}
                  onChange={(e) =>
                    setFormData({ ...formData, customerId: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                >
                  <option value="">-- Pilih Pelanggan --</option>
                  {customers?.data.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Issue Date *
                </label>
                <input
                  type="date"
                  disabled={!canWrite || isSaving}
                  value={formData.issueDate}
                  onChange={(e) =>
                    setFormData({ ...formData, issueDate: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  Reference
                </label>
                <input
                  type="text"
                  disabled={!canWrite || isSaving}
                  value={formData.reference}
                  onChange={(e) =>
                    setFormData({ ...formData, reference: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  disabled={!canWrite || isSaving}
                  value={formData.description || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={2}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                />
              </div>
            </div>

            {/* Lines table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  Baris Item * (minimal 1)
                </label>
                {canWrite && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLine}
                    disabled={isSaving}
                  >
                    Tambah Baris
                  </Button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="px-3 py-2">Account</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      {canWrite && <th className="px-3 py-2">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {formData.lines.map((line, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="px-3 py-2">
                                                      <Combobox
                              className="h-8 text-xs"
                              ariaLabel={`Akun baris ${idx + 1}`}
                              value={line.accountId}
                              disabled={!canWrite || isSaving}
                              onChange={(value) =>
                                updateLine(idx, "accountId", value)
                              }
                              placeholder="-- Account --"
                              options={revenueAccounts.map((a) => ({
                                value: a.id,
                                label: `${a.code} - ${a.name}`,
                              }))}
                            />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            disabled={!canWrite || isSaving}
                            value={line.description ?? ""}
                            onChange={(e) =>
                              updateLine(idx, "description", e.target.value)
                            }
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            disabled={!canWrite || isSaving}
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(idx, "quantity", parseFloat(e.target.value) || 0)
                            }
                            step="0.0001"
                            min="0"
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm disabled:bg-gray-100"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            disabled={!canWrite || isSaving}
                            value={line.unitPrice}
                            onChange={(e) =>
                              updateLine(idx, "unitPrice", parseFloat(e.target.value) || 0)
                            }
                            step="0.01"
                            min="0"
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm disabled:bg-gray-100"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatAmount(line.quantity * line.unitPrice)}
                        </td>
                        {canWrite && (
                          <td className="px-3 py-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeLine(idx)}
                              disabled={formData.lines.length === 1 || isSaving}
                            >
                              Remove
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-gray-50">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 font-medium text-gray-900">
                        Total
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {formatAmount(totalAmount)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              {canWrite && (
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Menyimpan..." : noteId ? "Update" : "Buat"}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
