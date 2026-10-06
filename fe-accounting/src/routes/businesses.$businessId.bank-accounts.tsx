import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
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
import { useFormatAmount } from "@/lib/format";

export const Route = createFileRoute("/businesses/$businessId/bank-accounts")({
  component: BankAccountsPage,
});

function BankAccountsPage() {
  const { t } = useTranslation();
  const { businessId } = Route.useParams();
  const { formatAmount } = useFormatAmount();
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

  const { data, isPending, isError, error } = useBankAccounts(businessId, page, { q: q || undefined, accountType: accountType === "all" ? undefined : accountType, status: status === "all" ? undefined : status }, 10);
  const totalBalance = useMemo(() => data?.data.reduce((total, b) => total + b.currentBalance, 0) ?? 0, [data]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t("bankAccounts.title")}</h1>
          {data && <p className="text-sm text-gray-500">{t("bankAccounts.subtitle", { count: data.pagination.total })}</p>}
        </div>
        {canWrite && <Button onClick={() => setAddOpen(true)}>{t("bankAccounts.newButton")}</Button>}
      </div>

      <div className="flex gap-2">
        <Input className="max-w-xs" placeholder={t("bankAccounts.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="rounded border px-2 py-1 text-sm" value={accountType} onChange={(e) => setAccountType(e.target.value as any)}>
          <option value="all">{t("bankAccounts.filterAllTypes")}</option>
          <option value="bank">{t("bankAccounts.filterBank")}</option>
          <option value="cash">{t("bankAccounts.filterCash")}</option>
        </select>
        <select className="rounded border px-2 py-1 text-sm" value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="all">{t("bankAccounts.filterAllStatuses")}</option>
          <option value="active">{t("bankAccounts.statusActive")}</option>
          <option value="archived">{t("bankAccounts.statusArchived")}</option>
        </select>
      </div>

      <Card><CardContent className="p-0">
        {isPending ? <p className="p-6 text-sm text-gray-500">{t("bankAccounts.loading")}</p>
          : isError ? <p className="p-6 text-sm text-red-700">{getApiErrorMessage(error)}</p>
          : data.data.length === 0 ? <p className="p-6 text-sm text-gray-500">{t("bankAccounts.empty")}</p>
          : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500"><tr>
                <th className="px-6 py-3">{t("bankAccounts.colNameType")}</th><th className="px-6 py-3">{t("bankAccounts.colBank")}</th><th className="px-6 py-3">{t("bankAccounts.colCoa")}</th>
                <th className="px-6 py-3 text-right">{t("bankAccounts.colBalance")}</th><th className="px-6 py-3">{t("common.colStatus")}</th>{canWrite && <th className="px-6 py-3">{t("common.colActions")}</th>}
              </tr></thead>
              <tbody className="divide-y">{data.data.map((b) => <AccountRow key={b.id} businessId={businessId} account={b} canWrite={canWrite} />)}</tbody>
              <tfoot className="border-t bg-gray-50"><tr><td colSpan={3} className="px-6 py-3 font-medium">{t("common.total")}</td><td className="px-6 py-3 text-right font-medium">{formatAmount(totalBalance)}</td><td colSpan={canWrite ? 2 : 1} /></tr></tfoot>
            </table></div>}
      </CardContent></Card>
      
            {data && (
        <Pagination
          page={page}
          totalPages={data.pagination.totalPages}
          onPageChange={setPage}
        />
      )}

      {canWrite && <BankAccountForm mode="create" open={addOpen} onOpenChange={setAddOpen} businessId={businessId} />}
    </div>
  );
}

function AccountRow({ businessId, account, canWrite }: { businessId: string; account: BankAccount; canWrite: boolean }) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const deleteAccount = useDeleteBankAccount(businessId);
  const updateStatus = useUpdateBankAccountStatus(businessId);
  const [editOpen, setEditOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!window.confirm(t("bankAccounts.deleteConfirm", { name: account.name }))) return;
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
    <td className="px-6 py-3"><Button variant="ghost" size="sm" className={`text-xs ${account.status === "active" ? "text-green-600" : "text-gray-500"}`} onClick={() => void handleToggleStatus()}>{account.status === "active" ? t("bankAccounts.statusActive") : t("bankAccounts.statusArchived")}</Button></td>
    {canWrite && <td className="px-6 py-3"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>{t("common.edit")}</Button><Button variant="destructive" size="sm" onClick={() => void handleDelete()}>{t("common.delete")}</Button></div>{rowError && <p className="text-[10px] text-red-600">{rowError}</p>}</td>}
  </tr>{canWrite && <BankAccountForm mode="edit" open={editOpen} onOpenChange={setEditOpen} businessId={businessId} account={account} />}</>;
}

function BankAccountForm({ mode, open, onOpenChange, businessId, account }: { mode: "create" | "edit"; open: boolean; onOpenChange: (open: boolean) => void; businessId: string; account?: BankAccount }) {
  const { t } = useTranslation();
  const create = useCreateBankAccount(businessId);
  const update = useUpdateBankAccount(businessId);
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: coaData } = useAccounts(businessId, 1, { category: "Asset" }, 100);
  const availableCoas = coaData?.data ?? [];
  // Schema dibuat DI DALAM komponen karena pesan validasi butuh t().
  const nameSchema = z.string().trim().min(3, t("bankAccounts.validationNameMin")).max(100, t("bankAccounts.validationNameMax"));
  const bankNameSchema = z.string().trim().max(100, t("bankAccounts.validationFieldMax")).optional().nullable();
  const accNumSchema = z.string().trim().max(50, t("bankAccounts.validationAccNumMax")).optional().nullable();
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
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] flex flex-col overflow-hidden"><DialogHeader className="shrink-0"><DialogTitle>{mode === "create" ? t("bankAccounts.newButton") : t("bankAccounts.dialogTitleEdit")}</DialogTitle></DialogHeader>
    <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={(e) => { e.preventDefault(); void form.handleSubmit(); }}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <form.Field name="accountType">{(field) => <div className="flex gap-4"><label className="flex items-center gap-1"><Input type="radio" className="w-4" checked={field.state.value === "bank"} onChange={() => field.handleChange("bank")} />{t("bankAccounts.typeBank")}</label><label className="flex items-center gap-1"><Input type="radio" className="w-4" checked={field.state.value === "cash"} onChange={() => field.handleChange("cash")} />{t("bankAccounts.typeCash")}</label></div>}</form.Field>
      <form.Field name="accountId">{(field) => <div className="flex flex-col gap-1"><label className="text-sm">{t("bankAccounts.fieldCoa")}</label><Combobox value={field.state.value} onChange={(value) => field.handleChange(value)} placeholder={t("bankAccounts.placeholderCoa")} ariaLabel="Akun COA" options={availableCoas.map((c) => ({ value: c.id, label: `${c.code} - ${c.name}` }))} /></div>}</form.Field>
      <form.Field name="name" validators={{ onChange: zodFieldValidator(nameSchema) }}>{(field) => <div className="flex flex-col gap-1"><Input placeholder={t("bankAccounts.placeholderName")} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />{field.state.meta.errors && <p className="text-xs text-red-600">{field.state.meta.errors}</p>}</div>}</form.Field>}
      {form.state.values.accountType === "bank" && <form.Field name="bankName" validators={{ onChange: zodFieldValidator(bankNameSchema) }}>{(field) => <div className="flex flex-col gap-1"><Input placeholder={t("bankAccounts.placeholderBank")} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} /></div>}</form.Field>}
      {form.state.values.accountType === "bank" && <form.Field name="accountNumber" validators={{ onChange: zodFieldValidator(accNumSchema) }}>{(field) => <div className="flex flex-col gap-1"><Input placeholder={t("bankAccounts.placeholderAccountNumber")} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} /></div>}</form.Field>}
      <form.Field name="description">{(field) => <textarea placeholder={t("bankAccounts.placeholderDescription")} className="rounded border p-2 text-sm" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />}</form.Field>}
      {serverError && <p className="text-xs text-red-600">{serverError}</p>}
      </div>
      <DialogFooter className="shrink-0 border-t pt-3"><Button type="submit">{t("common.save")}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}
