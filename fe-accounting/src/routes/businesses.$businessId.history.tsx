import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  type HistoryAction,
  useHistoryEntries,
  useHistoryEntry,
} from "@/hooks/use-history";
import { useMembers } from "@/hooks/use-members";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/history")({
  component: HistoryPage,
});

/** entity_type (nama tabel) -> label modul yang dibaca manusia. */
const ENTITY_LABELS: Record<string, string> = {
  payments: "Payments",
  receipts: "Receipts",
  sales_invoices: "Sales Invoices",
  purchase_invoices: "Purchase Invoices",
  sales_orders: "Sales Orders",
  sales_quotes: "Sales Quotes",
  purchase_orders: "Purchase Orders",
  purchase_quotes: "Purchase Quotes",
  credit_notes: "Credit Notes",
  debit_notes: "Debit Notes",
  expense_claims: "Expense Claims",
  contacts: "Customers/Suppliers",
  bank_accounts: "Bank and Cash Accounts",
  projects: "Projects",
  user_business_roles: "Members",
  withholding_tax_receipts: "Withholding Tax Receipts",
  billable_time_entries: "Billable Time",
  attachments: "Attachments",
  inter_account_transfers: "Inter Account Transfers",
  late_payment_fees: "Late Payment Fees",
  delivery_notes: "Delivery Notes",
  journal_entries: "Journal Entries",
};

function entityLabel(entityType: string): string {
  return (
    ENTITY_LABELS[entityType] ??
    entityType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

const ACTION_STYLES: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800 border border-green-200",
  UPDATE: "bg-yellow-100 text-yellow-800 border border-yellow-200",
  DELETE: "bg-red-100 text-red-800 border border-red-200",
};

function formatWaktu(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function ringkasId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

const selectClass =
  "h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500";

function HistoryPage() {
  const { businessId } = Route.useParams();

  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [entityType, setEntityType] = useState("");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState<"" | HistoryAction>("");
  const [activeId, setActiveId] = useState<string | null>(null);

  // Ganti filter apa pun -> kembali ke halaman 1.
  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, entityType, userId, action]);

  const { data, isPending, isError, error } = useHistoryEntries(
    businessId,
    page,
    {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      entityType: entityType || undefined,
      userId: userId || undefined,
      action: (action || undefined) as HistoryAction | undefined,
    },
    10,
  );

  // Dropdown user dari anggota bisnis (useMembers; hanya butuh nama+id).
  const { data: members } = useMembers(businessId, 1, 100);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Riwayat</h1>
        {data && (
          <p className="text-sm text-gray-500">
            {data.pagination.total} jejak perubahan data
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
            Dari Tanggal
          </label>
          <Input
            type="date"
            className="w-40"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
            s.d.
          </label>
          <Input
            type="date"
            className="w-40"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
            Modul
          </label>
          <select
            className={selectClass}
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
          >
            <option value="">Semua Modul</option>
            {Object.entries(ENTITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
            User
          </label>
          <select
            className={selectClass}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">Semua User</option>
            {members?.data.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
            Aksi
          </label>
          <select
            className={selectClass}
            value={action}
            onChange={(e) => setAction(e.target.value as "" | HistoryAction)}
          >
            <option value="">Semua Aksi</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
          </select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat riwayat...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">
              Tidak ada jejak perubahan yang cocok dengan filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Waktu</th>
                    <th className="px-6 py-3 font-medium">User</th>
                    <th className="px-6 py-3 font-medium">Aksi</th>
                    <th className="px-6 py-3 font-medium">Modul</th>
                    <th className="px-6 py-3 font-medium">Entity ID</th>
                    <th className="px-6 py-3 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-3 text-gray-600">
                        {formatWaktu(entry.createdAt)}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {entry.userName ?? "(user terhapus)"}
                        {entry.userEmail && (
                          <span className="block text-xs text-gray-500">
                            {entry.userEmail}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            ACTION_STYLES[entry.action] ?? ""
                          }`}
                        >
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {entityLabel(entry.entityType)}
                      </td>
                      <td
                        className="px-6 py-3 font-mono text-xs text-gray-600"
                        title={entry.entityId}
                      >
                        {ringkasId(entry.entityId)}
                      </td>
                      <td className="px-6 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveId(entry.id)}
                        >
                          Lihat Detail
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

      {activeId && (
        <HistoryDetailDialog
          businessId={businessId}
          entryId={activeId}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>
  );
}

function HistoryDetailDialog({
  businessId,
  entryId,
  onClose,
}: {
  businessId: string;
  entryId: string;
  onClose: () => void;
}) {
  const { data: entry, isPending, isError, error } = useHistoryEntry(
    businessId,
    entryId,
  );

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detail Perubahan</DialogTitle>
          <DialogDescription>
            Jejak audit bersifat append-only dan tidak bisa diubah.
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <p className="py-8 text-center text-sm text-gray-500">Memuat...</p>
        ) : isError ? (
          <p role="alert" className="text-sm text-red-700">
            {getApiErrorMessage(error)}
          </p>
        ) : entry ? (
          <HistoryDetailBody entry={entry} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function HistoryDetailBody({
  entry,
  onClose,
}: {
  entry: NonNullable<ReturnType<typeof useHistoryEntry>["data"]>;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-gray-500">Waktu</dt>
        <dd className="font-medium text-gray-900">
          {formatWaktu(entry.createdAt)}
        </dd>
        <dt className="text-gray-500">User</dt>
        <dd className="font-medium text-gray-900">
          {entry.userName ?? "(user terhapus)"}
          {entry.userEmail && (
            <span className="block text-xs text-gray-500">{entry.userEmail}</span>
          )}
        </dd>
        <dt className="text-gray-500">Aksi</dt>
        <dd>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              ACTION_STYLES[entry.action] ?? ""
            }`}
          >
            {entry.action}
          </span>
        </dd>
        <dt className="text-gray-500">Modul</dt>
        <dd className="font-medium text-gray-900">
          {entityLabel(entry.entityType)}
        </dd>
        <dt className="text-gray-500">Entity ID</dt>
        <dd className="break-all font-mono text-xs text-gray-600">
          {entry.entityId}
        </dd>
      </dl>

      <div className="flex flex-col gap-1">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
          Nilai Lama (old_values){entry.oldValues ? "" : " — tidak ada"}
        </h4>
        {entry.oldValues && (
          <pre className="max-h-56 overflow-auto rounded-md bg-gray-50 p-3 text-xs text-gray-800">
            {JSON.stringify(entry.oldValues, null, 2)}
          </pre>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
          Nilai Baru (new_values){entry.newValues ? "" : " — tidak ada"}
        </h4>
        {entry.newValues && (
          <pre className="max-h-56 overflow-auto rounded-md bg-gray-50 p-3 text-xs text-gray-800">
            {JSON.stringify(entry.newValues, null, 2)}
          </pre>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </div>
  );
}
