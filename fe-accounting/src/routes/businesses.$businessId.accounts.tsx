import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { z } from "zod";
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
import { useBusinesses } from "@/hooks/use-businesses";
import {
  ACCOUNT_CATEGORIES,
  type Account,
  type AccountCategory,
  type CreateAccountInput,
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useUpdateAccount,
} from "@/hooks/use-accounts";
import { getApiErrorMessage } from "@/lib/errors";
import { zodFieldValidator } from "@/lib/form-validators";

// Guide §7.2, §7 RBAC: daftar & kelola chart of accounts (GET/POST/PATCH/DELETE
// /businesses/:businessId/accounts). Sama pola dengan halaman Members.
export const Route = createFileRoute("/businesses/$businessId/accounts")({
  component: AccountsPage,
});

function AccountsPage() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const currentRole = businesses?.find((b) => b.id === businessId)?.role;
  // ACCOUNT_WRITE (backend permissions.ts) dipegang admin & accountant, bukan viewer.
  const canWrite = currentRole === "admin" || currentRole === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<AccountCategory | "">("");

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useAccounts(businessId, page, {
    q: q || undefined,
    category: category || undefined,
  });
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Chart of Accounts</h1>
        {canWrite && <Button onClick={() => setAddOpen(true)}>Tambah Akun</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Cari kode atau nama akun..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          className="h-9 rounded-md border border-gray-300 px-3 text-sm text-gray-900"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as AccountCategory | "");
            setPage(1);
          }}
        >
          <option value="">Semua Kategori</option>
          {ACCOUNT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat akun...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada akun.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Kode</th>
                    <th className="px-6 py-3 font-medium">Nama</th>
                    <th className="px-6 py-3 font-medium">Kategori</th>
                    <th className="px-6 py-3 font-medium">Group</th>
                    <th className="px-6 py-3 font-medium">Currency</th>
                    {canWrite && <th className="px-6 py-3 font-medium">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((account) => (
                    <AccountRow
                      key={account.id}
                      businessId={businessId}
                      account={account}
                      canWrite={canWrite}
                    />
                  ))}
                </tbody>
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
            onClick={() => setPage((p) => p - 1)}
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
            onClick={() => setPage((p) => p + 1)}
          >
            Berikutnya
          </Button>
        </div>
      )}

      {canWrite && (
        <AccountFormDialog
          mode="create"
          open={addOpen}
          onOpenChange={setAddOpen}
          businessId={businessId}
        />
      )}
    </div>
  );
}

interface AccountRowProps {
  businessId: string;
  account: Account;
  canWrite: boolean;
}

function AccountRow({ businessId, account, canWrite }: AccountRowProps) {
  const deleteAccount = useDeleteAccount(businessId);
  const [editOpen, setEditOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!window.confirm(`Hapus akun "${account.code} - ${account.name}"?`)) return;
    setRowError(null);
    try {
      await deleteAccount.mutateAsync(account.id);
    } catch (err) {
      setRowError(getApiErrorMessage(err));
    }
  };

  return (
    <>
      <tr>
        <td className="px-6 py-3 font-medium text-gray-900">{account.code}</td>
        <td className="px-6 py-3 text-gray-900">{account.name}</td>
        <td className="px-6 py-3 text-gray-600">{account.category}</td>
        <td className="px-6 py-3 text-gray-600">{account.groupName ?? "-"}</td>
        <td className="px-6 py-3 text-gray-600">{account.currencyCode}</td>
        {canWrite && (
          <td className="px-6 py-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteAccount.isPending}
                onClick={() => void handleDelete()}
              >
                Hapus
              </Button>
            </div>
            {rowError && <p className="mt-1 text-xs text-red-600">{rowError}</p>}
          </td>
        )}
      </tr>

      {canWrite && (
        <AccountFormDialog
          mode="edit"
          open={editOpen}
          onOpenChange={setEditOpen}
          businessId={businessId}
          account={account}
        />
      )}
    </>
  );
}

const codeSchema = z.string().min(1, "Kode wajib diisi.").max(50, "Kode maksimal 50 karakter.");
const nameSchema = z.string().min(1, "Nama wajib diisi.").max(225, "Nama maksimal 225 karakter.");
const currencySchema = z.string().length(3, "Kode mata uang harus 3 huruf.");

interface AccountFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  account?: Account;
}

function AccountFormDialog({ mode, open, onOpenChange, businessId, account }: AccountFormDialogProps) {
  const createAccount = useCreateAccount(businessId);
  const updateAccount = useUpdateAccount(businessId);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      code: account?.code ?? "",
      name: account?.name ?? "",
      category: (account?.category ?? "Asset") as AccountCategory,
      groupName: account?.groupName ?? "",
      currencyCode: account?.currencyCode ?? "IDR",
    } satisfies CreateAccountInput,
    onSubmit: async ({ value, formApi }) => {
      setServerError(null);
      const groupName = value.groupName.trim() || undefined;
      try {
        if (mode === "create") {
          await createAccount.mutateAsync({ ...value, groupName });
        } else if (account) {
          await updateAccount.mutateAsync({
            accountId: account.id,
            ...value,
            groupName: groupName ?? null,
          });
        }
        formApi.reset();
        onOpenChange(false);
      } catch (err) {
        setServerError(getApiErrorMessage(err));
      }
    },
  });

  const close = () => {
    onOpenChange(false);
    setServerError(null);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent onClose={close}>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Tambah Akun" : "Ubah Akun"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Tambahkan akun baru ke chart of accounts bisnis ini."
              : "Perbarui data akun ini."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="code" validators={{ onChange: zodFieldValidator(codeSchema) }}>
            {(field) => (
              <div className="flex flex-col gap-1">
                <label htmlFor={field.name} className="text-sm font-medium text-gray-700">
                  Kode
                </label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-xs text-red-600">{field.state.meta.errors.join(", ")}</p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="name" validators={{ onChange: zodFieldValidator(nameSchema) }}>
            {(field) => (
              <div className="flex flex-col gap-1">
                <label htmlFor={field.name} className="text-sm font-medium text-gray-700">
                  Nama
                </label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-xs text-red-600">{field.state.meta.errors.join(", ")}</p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="category">
            {(field) => (
              <div className="flex flex-col gap-1">
                <label htmlFor={field.name} className="text-sm font-medium text-gray-700">
                  Kategori
                </label>
                <select
                  id={field.name}
                  name={field.name}
                  className="h-9 rounded-md border border-gray-300 px-3 text-sm text-gray-900"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value as AccountCategory)}
                >
                  {ACCOUNT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </form.Field>

          <form.Field name="groupName">
            {(field) => (
              <div className="flex flex-col gap-1">
                <label htmlFor={field.name} className="text-sm font-medium text-gray-700">
                  Group (opsional)
                </label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>

          <form.Field
            name="currencyCode"
            validators={{ onChange: zodFieldValidator(currencySchema) }}
          >
            {(field) => (
              <div className="flex flex-col gap-1">
                <label htmlFor={field.name} className="text-sm font-medium text-gray-700">
                  Currency
                </label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value.toUpperCase())}
                  maxLength={3}
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-xs text-red-600">{field.state.meta.errors.join(", ")}</p>
                )}
              </div>
            )}
          </form.Field>

          {serverError && (
            <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Batal
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Menyimpan..." : mode === "create" ? "Tambah" : "Simpan"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
