import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  type DeliveryNote,
  type DeliveryNoteLineInput,
  useCreateDeliveryNote,
  useDeleteDeliveryNote,
  useDeliveryNote,
  useDeliveryNotes,
  useUpdateDeliveryNote,
} from "@/hooks/use-delivery-notes";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useSalesOrders } from "@/hooks/use-sales-orders";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/delivery-notes")({
  component: DeliveryNotesPage,
});

function DeliveryNotesPage() {
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

  const { data, isPending, isError, error } = useDeliveryNotes(
    businessId,
    page,
    { q: q || undefined },
    10,
  );

  const deleteNote = useDeleteDeliveryNote(businessId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (note: DeliveryNote) => {
    const refText = note.reference ? ` "${note.reference}"` : "";
    if (
      !window.confirm(
        `Hapus surat jalan${refText} untuk pelanggan "${note.customerName}"?`,
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
          <h1 className="text-lg font-semibold text-gray-900">Delivery Notes</h1>
          {data && (
            <p className="text-sm text-gray-500">
              {data.pagination.total} surat jalan
            </p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveNoteId("new")}>Surat Jalan Baru</Button>
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
          placeholder="Cari referensi, pelanggan, keterangan..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">
              Memuat surat jalan...
            </p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">
              Belum ada surat jalan.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Delivery Date</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Customer</th>
                    <th className="px-6 py-3 font-medium">Order Number</th>
                    <th className="px-6 py-3 font-medium">Invoice Number</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((note) => (
                    <tr key={note.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">
                        {note.deliveryDate}
                      </td>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {note.reference || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {note.customerName}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {note.salesOrderReference || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {note.salesInvoiceReference || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {note.description || "-"}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveNoteId(note.id)}
                          >
                            {canWrite ? "Edit" : "Lihat"}
                          </Button>
                          {canWrite && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteNote.isPending}
                              onClick={() => void handleDelete(note)}
                            >
                              Hapus
                            </Button>
                          )}
                        </div>
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

      {activeNoteId && (
        <DeliveryNoteFormDialog
          businessId={businessId}
          noteId={activeNoteId}
          canWrite={canWrite}
          onClose={() => setActiveNoteId(null)}
        />
      )}
    </div>
  );
}

interface FormLine {
  id: string;
  description: string;
  quantity: string;
}

function createEmptyLine(): FormLine {
  return {
    id: Math.random().toString(36).substring(2, 9),
    description: "",
    quantity: "1",
  };
}

interface DeliveryNoteFormDialogProps {
  businessId: string;
  noteId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function DeliveryNoteFormDialog({
  businessId,
  noteId,
  canWrite,
  onClose,
}: DeliveryNoteFormDialogProps) {
  const isNew = noteId === "new";
  const { data: existingNote, isPending: isNoteLoading } = useDeliveryNote(
    businessId,
    isNew ? null : noteId,
  );

  const { data: customersData, isPending: isCustomersLoading } = useCustomers(
    businessId,
    1,
    {},
    100,
  );

  // Dropdown Order/Invoice Number diambil sekali (pageSize besar) lalu
  // DIFILTER di klien ke milik Customer yang lagi dipilih (pola dropdown
  // "Invoice" di Payments yang difilter per Payee).
  const { data: salesOrdersData } = useSalesOrders(businessId, 1, {}, 100);
  const { data: salesInvoicesData } = useSalesInvoices(businessId, 1, {}, 100);

  const createNote = useCreateDeliveryNote(businessId);
  const updateNote = useUpdateDeliveryNote(businessId);

  const [customerId, setCustomerId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(getTodayDateString());
  const [reference, setReference] = useState("");
  const [salesOrderId, setSalesOrderId] = useState("");
  const [salesInvoiceId, setSalesInvoiceId] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<FormLine[]>([createEmptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);

  // Inisialisasi form saat mode edit selesai memuat data surat jalan
  useEffect(() => {
    if (!isNew && existingNote) {
      setCustomerId(existingNote.customerId);
      setDeliveryDate(existingNote.deliveryDate);
      setReference(existingNote.reference ?? "");
      setSalesOrderId(existingNote.salesOrderId ?? "");
      setSalesInvoiceId(existingNote.salesInvoiceId ?? "");
      setDeliveryAddress(existingNote.deliveryAddress ?? "");
      setDescription(existingNote.description ?? "");

      if (existingNote.lines && existingNote.lines.length > 0) {
        setLines(
          existingNote.lines.map((line) => ({
            id: line.id || Math.random().toString(36).substring(2, 9),
            description: line.description ?? "",
            quantity: String(line.quantity),
          })),
        );
      }
    }
  }, [isNew, existingNote]);

  // Perubahan customer: auto-fill deliveryAddress (pola sama dgn modul
  // lain) + RESET pilihan Order/Invoice Number (milik customer lain).
  const handleCustomerChange = (newCustomerId: string) => {
    setCustomerId(newCustomerId);
    setSalesOrderId("");
    setSalesInvoiceId("");
    const selectedCust = customersData?.data.find((c) => c.id === newCustomerId);
    if (selectedCust && (!deliveryAddress || isNew)) {
      setDeliveryAddress(selectedCust.deliveryAddress ?? "");
    }
  };

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!customerId) {
      setFormError("Pelanggan wajib dipilih.");
      return;
    }

    if (!deliveryDate) {
      setFormError("Delivery Date wajib diisi.");
      return;
    }

    if (lines.length === 0) {
      setFormError("Surat jalan wajib memiliki minimal 1 baris item.");
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.description.trim()) {
        setFormError(`Baris #${i + 1}: Deskripsi item wajib diisi.`);
        return;
      }
      const qty = parseFloat(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        setFormError(`Baris #${i + 1}: Kuantitas harus lebih dari 0.`);
        return;
      }
    }

    const formattedLines: DeliveryNoteLineInput[] = lines.map((l) => ({
      description: l.description.trim(),
      quantity: parseFloat(l.quantity) || 1,
    }));

    try {
      if (isNew) {
        // Create: deliveryAddress kosong dikirim undefined supaya backend
        // auto-isi dari alamat Customer.
        await createNote.mutateAsync({
          customerId,
          deliveryDate,
          salesOrderId: salesOrderId || undefined,
          salesInvoiceId: salesInvoiceId || undefined,
          reference: reference.trim() || undefined,
          deliveryAddress: deliveryAddress.trim() || undefined,
          description: description.trim() || undefined,
          lines: formattedLines,
        });
      } else {
        await updateNote.mutateAsync({
          noteId,
          customerId,
          deliveryDate,
          salesOrderId: salesOrderId || null,
          salesInvoiceId: salesInvoiceId || null,
          reference: reference.trim() || null,
          deliveryAddress: deliveryAddress.trim() || null,
          description: description.trim() || null,
          lines: formattedLines,
        });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createNote.isPending || updateNote.isPending;
  const isInitialLoading = !isNew && isNoteLoading;

  const customerOrders = (salesOrdersData?.data ?? []).filter(
    (o) => o.customerId === customerId,
  );
  const customerInvoices = (salesInvoicesData?.data ?? []).filter(
    (inv) => inv.customerId === customerId,
  );

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew
              ? "Surat Jalan Baru"
              : canWrite
                ? "Edit Surat Jalan"
                : "Detail Surat Jalan"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Buat surat jalan. Dokumen administratif — tanpa jurnal dan tanpa nilai uang."
              : "Lihat atau perbarui surat jalan beserta baris itemnya."}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            Memuat data surat jalan...
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
                    Delivery Date *
                  </label>
                  <Input
                    type="date"
                    value={deliveryDate}
                    disabled={!canWrite}
                    onChange={(event) => setDeliveryDate(event.target.value)}
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
                    Reference
                  </label>
                  <Input
                    placeholder="Nomor referensi (opsional)"
                    value={reference}
                    disabled={!canWrite}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Order Number
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={salesOrderId}
                    disabled={!canWrite || !customerId}
                    onChange={(event) => setSalesOrderId(event.target.value)}
                  >
                    <option value="">
                      {customerId
                        ? "-- Pilih Sales Order (opsional) --"
                        : "-- Pilih Customer dulu --"}
                    </option>
                    {customerOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.reference || "(tanpa referensi)"} — {o.issueDate}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Invoice Number
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={salesInvoiceId}
                    disabled={!canWrite || !customerId}
                    onChange={(event) => setSalesInvoiceId(event.target.value)}
                  >
                    <option value="">
                      {customerId
                        ? "-- Pilih Sales Invoice (opsional) --"
                        : "-- Pilih Customer dulu --"}
                    </option>
                    {customerInvoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.reference || "(tanpa referensi)"} — {inv.issueDate}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Description
                  </label>
                  <Input
                    placeholder="Keterangan umum (opsional)"
                    value={description}
                    disabled={!canWrite}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1 md:col-span-3">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Delivery Address
                  </label>
                  <textarea
                    className="min-h-9 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    placeholder="Otomatis dari alamat pelanggan (bisa diedit)"
                    rows={2}
                    value={deliveryAddress}
                    disabled={!canWrite}
                    onChange={(event) => setDeliveryAddress(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Barang yang Dikirim
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
                        <th className="px-3 py-2 font-medium min-w-[320px]">
                          Description *
                        </th>
                        <th className="px-3 py-2 font-medium w-28">Qty *</th>
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
                            <input
                              type="text"
                              className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                              placeholder="Nama barang yang dikirim"
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
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Batal
              </Button>
              {canWrite && (
                <Button type="submit" disabled={isSubmitting}>
                  {isNew
                    ? (isSubmitting ? "Menyimpan..." : "Simpan Surat Jalan")
                    : (isSubmitting ? "Menyimpan..." : "Perbarui Surat Jalan")}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
