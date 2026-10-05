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
import {
  useCreateTaxCode,
  useDeleteTaxCode,
  useTaxCode,
  useTaxCodes,
  useUpdateTaxCode,
} from "@/hooks/use-tax-codes";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/tax-codes")({
  component: TaxCodesPage,
});

function StatusBadge({ isActive }: { isActive: boolean }) {
  const style = isActive
    ? "bg-green-100 text-green-800 border border-green-200"
    : "bg-gray-100 text-gray-600 border border-gray-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

function TaxCodesPage() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "true" | "false">("");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const { data, isPending, isError, error } = useTaxCodes(
    businessId,
    page,
    {
      q: q || undefined,
      isActive: statusFilter === "" ? undefined : statusFilter === "true",
    },
    10,
  );

  const deleteTaxCode = useDeleteTaxCode(businessId);

  const handleDelete = async (code: { id: string; code: string; name: string }) => {
    if (!window.confirm(`Hapus kode pajak "${code.code} - ${code.name}"?`)) {
      return;
    }
    setDeleteError(null);
    try {
      await deleteTaxCode.mutateAsync(code.id);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Kode Pajak</h1>
          {data && (
            <p className="text-sm text-gray-500">
              {data.pagination.total} kode pajak
            </p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActiveId("new")}>Kode Pajak Baru</Button>
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
          placeholder="Cari kode atau nama pajak..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "" | "true" | "false")
          }
        >
          <option value="">Semua Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat kode pajak...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada kode pajak.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Code</th>
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium text-right">Rate %</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Terpakai</th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((taxCode) => (
                    <tr key={taxCode.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-mono text-xs text-gray-600">
                        {taxCode.code}
                      </td>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {taxCode.name}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums">
                        {taxCode.ratePercent}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge isActive={taxCode.isActive} />
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-gray-600">
                        {taxCode.usageCount}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveId(taxCode.id)}
                          >
                            {canWrite ? "Edit" : "Lihat"}
                          </Button>
                          {canWrite && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteTaxCode.isPending}
                              onClick={() => void handleDelete(taxCode)}
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

      {activeId && (
        <TaxCodeFormDialog
          businessId={businessId}
          taxCodeId={activeId}
          canWrite={canWrite}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>
  );
}

interface TaxCodeFormDialogProps {
  businessId: string;
  taxCodeId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function TaxCodeFormDialog({
  businessId,
  taxCodeId,
  canWrite,
  onClose,
}: TaxCodeFormDialogProps) {
  const isNew = taxCodeId === "new";
  const { data: existing, isPending: isLoading } = useTaxCode(
    businessId,
    isNew ? null : taxCodeId,
  );

  const createTaxCode = useCreateTaxCode(businessId);
  const updateTaxCode = useUpdateTaxCode(businessId);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [ratePercent, setRatePercent] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Inisialisasi form saat mode edit selesai memuat data kode pajak.
  useEffect(() => {
    if (!isNew && existing) {
      setCode(existing.code);
      setName(existing.name);
      setRatePercent(String(existing.ratePercent));
      setIsActive(existing.isActive);
      setDescription(existing.description ?? "");
    }
  }, [isNew, existing]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!code.trim()) {
      setFormError("Kode pajak wajib diisi.");
      return;
    }
    if (!name.trim()) {
      setFormError("Nama pajak wajib diisi.");
      return;
    }
    const rate = parseFloat(ratePercent);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setFormError("Tarif pajak harus antara 0 dan 100.");
      return;
    }

    try {
      if (isNew) {
        await createTaxCode.mutateAsync({
          code: code.trim(),
          name: name.trim(),
          ratePercent: rate,
          isActive,
          description: description.trim() || null,
        });
      } else {
        await updateTaxCode.mutateAsync({
          id: taxCodeId,
          code: code.trim(),
          name: name.trim(),
          ratePercent: rate,
          isActive,
          description: description.trim() || null,
        });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createTaxCode.isPending || updateTaxCode.isPending;
  const isInitialLoading = !isNew && isLoading;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isNew ? "Kode Pajak Baru" : canWrite ? "Edit Kode Pajak" : "Detail Kode Pajak"}
          </DialogTitle>
          <DialogDescription>
            Referensi tarif pajak yang bisa dipilih di baris faktur penjualan.
            Rate di-snapshot ke tiap baris — mengubah tarif di sini tidak
            mengubah faktur lama.
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-8 text-center text-sm text-gray-500">
            Memuat data kode pajak...
          </div>
        ) : (
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
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                Code *
              </label>
              <Input
                placeholder="Contoh: PPN11"
                value={code}
                disabled={!canWrite}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                Name *
              </label>
              <Input
                placeholder="Contoh: PPN 11%"
                value={name}
                disabled={!canWrite}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                Rate % *
              </label>
              <Input
                type="number"
                step="any"
                min="0"
                max="100"
                placeholder="Contoh: 11"
                value={ratePercent}
                disabled={!canWrite}
                onChange={(event) => setRatePercent(event.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                Status
              </label>
              <select
                className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-100"
                value={isActive ? "active" : "inactive"}
                disabled={!canWrite}
                onChange={(event) => setIsActive(event.target.value === "active")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              {!isNew && existing && existing.usageCount > 0 && (
                <p className="text-xs text-amber-600">
                  Masih dipakai {existing.usageCount} baris faktur —
                  nonaktifkan/hapus akan ditolak.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                Description
              </label>
              <textarea
                className="min-h-[64px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:bg-gray-100"
                placeholder="Catatan opsional"
                value={description}
                disabled={!canWrite}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            </div>

            <DialogFooter className="shrink-0 border-t pt-3">
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Batal
              </Button>
              {canWrite && (
                <Button type="submit" disabled={isSubmitting}>
                  {isNew
                    ? isSubmitting
                      ? "Menyimpan..."
                      : "Simpan Kode Pajak"
                    : isSubmitting
                      ? "Menyimpan..."
                      : "Perbarui Kode Pajak"}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
