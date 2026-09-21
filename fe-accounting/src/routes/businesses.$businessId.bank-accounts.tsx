import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useBusinesses } from "@/hooks/use-businesses";
import { useAccounts } from "@/hooks/use-accounts";
import {
  type BankAccount,
  useBankAccounts,
  useCreateBankAccount,
  useDeleteBankAccount,
  useUpdateBankAccount,
  useUpdateBankAccountStatus,
} from "@/hooks/use-bank-accounts";
import { getApiErrorMessage } from "@/lib/errors";
import { zodFieldValidator } from "@/lib/form-validators";

export const Route = createFileRoute("/businesses/$businessId/bank-accounts")({
  component: BankAccountsPage,
});

const nameSchema = z.string().trim().min(3, "Minimal 3 karakter.").max(100, "Maksimal 100 karakter.");
const bankNameSchema = z.string().trim().max(100, "Maksimal 100 karakter.").optional().nullable();
const accNumSchema = z.string().trim().max(50, "Maksimal 50 karakter.").optional().nullable();

function formatAmount(value: number) {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function BankAccountsPage() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [accountType, setAccountType] = useState<"bank" | "cash" | "all">("all");
  const [status, setStatus] = useState<"active" | "archived" | "all">("all");

  useEffect(() => {
    const timeout = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useBankAccounts(businessId, page, { q: q || undefined, accountType: accountType === "all" ? undefined : accountType, status: status === "all" ? undefined : status });
  const totalBalance = useMemo(() => data?.data.reduce((total, b) => total + b.currentBalance, 0) ?? 0, [data]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Bank and Cash Accounts</h1>
          {data && <p className="text-sm text-gray-500">{data.pagination.total} rekening</p>}
        </div>
        {canWrite && <Button onClick={() => setAddOpen(true)}>Tambah Akun</Button>}
      </div>

      <div className="flex gap-2">
        <Input className="max-w-xs" placeholder="Cari nama, bank, atau no. rek..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="rounded border px-2 py-1 text-sm" value={accountType} onChange={(e) => setAccountType(e.target.value as any)}>
          <option value="all">Semua Tipe</option>
          <option value="bank">Bank</option>
          <option value="cash">Kas</option>
        </select>
        <select className="rounded border px-2 py-1 text-sm" value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="all">Semua Status</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <Card><CardContent className="p-0">
        {isPending ? <p className="p-6 text-sm text-gray-500">Memuat data...</p>
          : isError ? <p className="p-6 text-sm text-red-700">{getApiErrorMessage(error)}</p>
          : data.data.length === 0 ? <p className="p-6 text-sm text-gray-500">Belum ada akun.</p>
          : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500"><tr>
                <th className="px-6 py-3">Nama/Tipe</th><th className="px-6 py-3">Bank/No. Rek</th><th className="px-6 py-3">COA</th>
                <th className="px-6 py-3 text-right">Saldo</th><th className="px-6 py-3">Status</th>{canWrite && <th className="px-6 py-3">Aksi</th>}
              </tr></thead>
              <tbody className="divide-y">{data.data.map((b) => <AccountRow key={b.id} businessId={businessId} account={b} canWrite={canWrite} />)}</tbody>
              <tfoot className="border-t bg-gray-50"><tr><td colSpan={3} className="px-6 py-3 font-medium">Total</td><td className="px-6 py-3 text-right font-medium">{formatAmount(totalBalance)}</td><td colSpan={canWrite ? 2 : 1} /></tr></tfoot>
            </table></div>}
      </CardContent></Card>
      
      {data && data.pagination.totalPages > 1 && <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
        <span className="text-sm">Halaman {data.pagination.currentPage} dari {data.pagination.totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
      </div>}

      {canWrite && <BankAccountForm mode="create" open={addOpen} onOpenChange={setAddOpen} businessId={businessId} />}
    </div>
  );
}

function AccountRow({ businessId, account, canWrite }: { businessId: string; account: BankAccount; canWrite: boolean }) {
  const deleteAccount = useDeleteBankAccount(businessId);
  const updateStatus = useUpdateBankAccountStatus(businessId);
  const [editOpen, setEditOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!window.confirm(`Hapus permanen akun "${account.name}"?`)) return;
    setRowError(null);
    try { await deleteAccount.mutateAsync(account.id); } catch (e) { setRowError(getApiErrorMessage(e)); }
  };

  const handleToggleStatus = async () => {
    setRowError(null);
    try { await updateStatus.mutateAsync({ bankAccountId: account.id, status: account.status === "active" ? "archived" : "active" }); } catch (e) { setRowError(getApiErrorMessage(e)); }
  };

  return <><tr>
    <td className="px-6 py-3"><p className="font-medium">{account.name}</p><span className={`rounded px-1.5 py-0.5 text-[10px] ${account.accountType === "bank" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>{account.accountType.toUpperCase()}</span></td>
    <td className="px-6 py-3 text-xs text-gray-500">{account.accountType === "bank" ? <>{account.bankName}<br/>{account.accountNumber}</> : "-"}</td>
    <td className="px-6 py-3 text-xs">{account.accountCode} - {account.accountName}</td>
    <td className="px-6 py-3 text-right font-mono">{formatAmount(account.currentBalance)}</td>
    <td className="px-6 py-3"><Button variant="ghost" size="sm" className={`text-xs ${account.status === "active" ? "text-green-600" : "text-gray-500"}`} onClick={() => void handleToggleStatus()}>{account.status === "active" ? "Active" : "Archived"}</Button></td>
    {canWrite && <td className="px-6 py-3"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>Edit</Button><Button variant="destructive" size="sm" onClick={() => void handleDelete()}>Hapus</Button></div>{rowError && <p className="text-[10px] text-red-600">{rowError}</p>}</td>}
  </tr>{canWrite && <BankAccountForm mode="edit" open={editOpen} onOpenChange={setEditOpen} businessId={businessId} account={account} />}</>;
}

function BankAccountForm({ mode, open, onOpenChange, businessId, account }: { mode: "create" | "edit"; open: boolean; onOpenChange: (open: boolean) => void; businessId: string; account?: BankAccount }) {
  const create = useCreateBankAccount(businessId);
  const update = useUpdateBankAccount(businessId);
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: coaData } = useAccounts(businessId, 1, { category: "Asset" }, 100);
  const availableCoas = coaData?.data ?? [];
  const form = useForm({
    defaultValues: { name: account?.name ?? "", accountType: account?.accountType ?? "bank", accountId: account?.accountId ?? "", bankName: account?.bankName ?? "", accountNumber: account?.accountNumber ?? "", description: account?.description ?? "" },
    onSubmit: async ({ value, formApi }) => {
      setServerError(null);
      const input = { name: value.name, accountId: value.accountId, accountType: value.accountType, bankName: value.accountType === "bank" ? value.bankName : null, accountNumber: value.accountType === "bank" ? value.accountNumber : null, description: value.description || null };
      try {
        if (mode === "create") await create.mutateAsync(input);
        else if (account) await update.mutateAsync({ bankAccountId: account.id, ...input });
        formApi.reset(); onOpenChange(false);
      } catch (e) { setServerError(getApiErrorMessage(e)); }
    },
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{mode === "create" ? "Tambah Akun" : "Edit Akun"}</DialogTitle></DialogHeader>
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void form.handleSubmit(); }}>
      <form.Field name="accountType">{(field) => <div className="flex gap-4"><label className="flex items-center gap-1"><Input type="radio" className="w-4" checked={field.state.value === "bank"} onChange={() => field.handleChange("bank")} />Bank</label><label className="flex items-center gap-1"><Input type="radio" className="w-4" checked={field.state.value === "cash"} onChange={() => field.handleChange("cash")} />Cash</label></div>}</form.Field>
      <form.Field name="accountId">{(field) => <div className="flex flex-col gap-1"><label className="text-sm">Akun COA (Asset)</label><select className="rounded border px-2 py-1.5" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)}><option value="">Pilih Akun</option>{availableCoas.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}</select></div>}</form.Field>
      <form.Field name="name" validators={{ onChange: zodFieldValidator(nameSchema) }}>{(field) => <div className="flex flex-col gap-1"><Input placeholder="Nama Akun" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />{field.state.meta.errors && <p className="text-xs text-red-600">{field.state.meta.errors}</p>}</div>}</form.Field>
      {form.state.values.accountType === "bank" && <form.Field name="bankName" validators={{ onChange: zodFieldValidator(bankNameSchema) }}>{(field) => <div className="flex flex-col gap-1"><Input placeholder="Nama Bank" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} /></div>}</form.Field>}
      {form.state.values.accountType === "bank" && <form.Field name="accountNumber" validators={{ onChange: zodFieldValidator(accNumSchema) }}>{(field) => <div className="flex flex-col gap-1"><Input placeholder="No. Rekening" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} /></div>}</form.Field>}
      <form.Field name="description">{(field) => <textarea placeholder="Deskripsi" className="rounded border p-2 text-sm" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />}</form.Field>
      {serverError && <p className="text-xs text-red-600">{serverError}</p>}
      <DialogFooter><Button type="submit">Simpan</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}
