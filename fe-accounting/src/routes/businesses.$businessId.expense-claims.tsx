import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/hooks/use-accounts";
import { useBusinesses } from "@/hooks/use-businesses";
import { useContacts } from "@/hooks/use-contacts";
import { getTodayDateString, useExpenseClaims, useExpenseClaim, useCreateExpenseClaim, useUpdateExpenseClaim, useDeleteExpenseClaim, type ExpenseClaim } from "@/hooks/use-expense-claims";
import { getApiErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/businesses/$businessId/expense-claims")({ component: ExpenseClaimsPage });
const formatAmount = (value: number) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const selectClass = "h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm disabled:bg-gray-100";
function Status({ status }: { status: "Paid" | "Unpaid" }) {
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${status === "Paid" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>{status}</span>;
}
function ExpenseClaimsPage() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find(b => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"Paid" | "Unpaid" | "">("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => { const timer = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  const { data, isPending, error } = useExpenseClaims(businessId, page, { q: q || undefined, status: status || undefined });
  const remove = useDeleteExpenseClaim(businessId);
  async function handleDelete(claim: ExpenseClaim) {
    if (!window.confirm(`Hapus klaim ${claim.reference || claim.date} sebesar ${formatAmount(claim.claimAmount)}? Jurnal terkait juga akan dihapus.`)) return;
    setActionError(null);
    try { await remove.mutateAsync(claim.id); } catch (e) { setActionError(getApiErrorMessage(e)); }
  }
  return <div className="flex flex-col gap-4">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Expense Claims</h1>{canWrite && <Button onClick={() => setActiveId("new")}>Klaim Baru</Button>}</div>
    <div className="flex gap-3"><Input aria-label="Cari klaim" placeholder="Cari referensi, payer, payee, atau deskripsi..." value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="Filter status" className={`${selectClass} max-w-40`} value={status} onChange={e => { setStatus(e.target.value as typeof status); setPage(1); }}><option value="">Semua status</option><option>Unpaid</option><option>Paid</option></select></div>
    {(error || actionError) && <p role="alert" className="text-sm text-red-700">{actionError || getApiErrorMessage(error)}</p>}
    <Card><CardContent className="p-0 overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{["Date", "Reference", "Payer", "Payee", "Description", "Amount", "Status", "Aksi"].map(h => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
      <tbody className="divide-y">{isPending ? <tr><td colSpan={8} className="p-8 text-center">Memuat klaim...</td></tr> : !data?.data.length ? <tr><td colSpan={8} className="p-8 text-center text-gray-500">Belum ada klaim biaya.</td></tr> : data.data.map(c => <tr key={c.id} className="hover:bg-gray-50">
        <td className="px-4 py-3 whitespace-nowrap">{c.date}</td><td className="px-4 py-3">{c.reference || "—"}</td><td className="px-4 py-3">{c.payerName}</td><td className="px-4 py-3">{c.payee || "—"}</td><td className="px-4 py-3">{c.description || "—"}</td><td className="px-4 py-3 text-right whitespace-nowrap">{formatAmount(c.claimAmount)}</td><td className="px-4 py-3"><Status status={c.status} /></td>
        <td className="px-4 py-3"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setActiveId(c.id)}>{canWrite ? "Edit" : "Detail"}</Button>{canWrite && <Button variant="outline" size="sm" disabled={remove.isPending} onClick={() => void handleDelete(c)}>Hapus</Button>}</div></td>
      </tr>)}</tbody>
      <tfoot className="border-t bg-gray-50 font-semibold"><tr><td colSpan={5} className="px-4 py-3">Total halaman ini</td><td className="px-4 py-3 text-right">{formatAmount((data?.data.reduce((sum, c) => sum + Math.round(c.claimAmount * 100), 0) ?? 0) / 100)}</td><td colSpan={2} /></tr></tfoot>
    </table></CardContent></Card>
    <div className="flex items-center justify-between text-sm"><span>Halaman {page} / {Math.max(1, data?.pagination.totalPages ?? 1)} · {data?.pagination.total ?? 0} klaim</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Sebelumnya</Button><Button variant="outline" disabled={page >= (data?.pagination.totalPages ?? 1)} onClick={() => setPage(p => p + 1)}>Berikutnya</Button></div></div>
    {activeId && <ClaimForm key={activeId} businessId={businessId} id={activeId} canWrite={canWrite} onClose={() => setActiveId(null)} />}
  </div>;
}
interface FormLine { id: string; accountId: string; description: string; amount: string }
const emptyLine = (): FormLine => ({ id: crypto.randomUUID(), accountId: "", description: "", amount: "" });
function ClaimForm({ businessId, id, canWrite, onClose }: { businessId: string; id: string; canWrite: boolean; onClose: () => void }) {
  const isNew = id === "new";
  const { data: existing, isPending, error: detailError } = useExpenseClaim(businessId, isNew ? null : id);
  const { data: contacts = [], error: contactsError } = useContacts(businessId);
  const { data: accounts, error: accountsError } = useAccounts(businessId, 1, {}, 100);
  const create = useCreateExpenseClaim(businessId);
  const update = useUpdateExpenseClaim(businessId);
  const [date, setDate] = useState(getTodayDateString());
  const [reference, setReference] = useState("");
  const [payerContactId, setPayer] = useState("");
  const [payee, setPayee] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => { if (existing) {
    setDate(existing.date); setReference(existing.reference ?? ""); setPayer(existing.payerContactId); setPayee(existing.payee ?? ""); setDescription(existing.description ?? "");
    setLines(existing.lines.map(l => ({ id: l.id, accountId: l.accountId, description: l.description ?? "", amount: String(l.amount) })));
  } }, [existing]);
  const busy = create.isPending || update.isPending;
  const accountOptions = (accounts?.data ?? []).filter(a => a.category === "Expense" || a.category === "Asset");
  function editLine(index: number, field: keyof FormLine, value: string) { setLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l)); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setFormError(null);
    if (!payerContactId || !lines.length || lines.some(l => !l.accountId || !Number.isFinite(Number(l.amount)) || Number(l.amount) <= 0)) { setFormError("Payer, akun, dan nominal positif tiap baris wajib diisi."); return; }
    const body = { date, payerContactId, reference: reference.trim() || null, payee: payee.trim() || null, description: description.trim() || null, lines: lines.map(l => ({ accountId: l.accountId, description: l.description.trim() || null, amount: Number(l.amount) })) };
    try {
      if (isNew) await create.mutateAsync({ ...body, reference: body.reference ?? undefined });
      else await update.mutateAsync({ ...body, expenseClaimId: id });
      onClose();
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  }
  const loadError = detailError || contactsError || accountsError;
  return <Dialog open onOpenChange={open => !open && !busy && onClose()}><DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" onClose={onClose}>
    <DialogHeader><DialogTitle>{isNew ? "Klaim Baru" : canWrite ? "Edit Klaim Biaya" : "Detail Klaim Biaya"}</DialogTitle><DialogDescription>Catat pengeluaran yang dibayar pribadi. Reimbursement dicatat melalui Payments.</DialogDescription></DialogHeader>
    {loadError && <p role="alert" className="text-red-700">{getApiErrorMessage(loadError)}</p>}
    {!isNew && isPending ? <p>Memuat klaim...</p> : <form onSubmit={event => void submit(event)} className="flex flex-col gap-4">
      {formError && <p role="alert" className="text-red-700">{formError}</p>}
      {existing && <div className="flex gap-4 items-center text-sm"><Status status={existing.status} /><span>Sisa reimbursement: {formatAmount(existing.balanceDue)}</span></div>}
      <fieldset disabled={!canWrite || busy || Boolean(loadError)} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">Date *<Input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="text-sm">Payer *<select className={selectClass} required value={payerContactId} onChange={e => setPayer(e.target.value)}><option value="">-- Pilih Payer --</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-sm">Reference<Input maxLength={50} value={reference} onChange={e => setReference(e.target.value)} /></label>
          <label className="text-sm">Payee<Input maxLength={255} placeholder="Nama toko / penerima" value={payee} onChange={e => setPayee(e.target.value)} /></label>
          <label className="text-sm md:col-span-2">Description<Input maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></label>
        </div>
        <div className="flex items-center justify-between"><h3 className="font-semibold">Baris Item</h3>{canWrite && <Button type="button" variant="outline" size="sm" onClick={() => setLines(prev => [...prev, emptyLine()])}>+ Tambah Baris</Button>}</div>
        <div className="overflow-x-auto border rounded-md"><table className="w-full text-sm"><thead className="bg-gray-50 text-left"><tr><th className="p-2 min-w-56">Account (Expense/Asset) *</th><th className="p-2 min-w-44">Description</th><th className="p-2 min-w-36">Amount *</th>{canWrite && <th className="p-2">Hapus</th>}</tr></thead><tbody>{lines.map((l, i) => <tr key={l.id}>
          <td className="p-2"><select aria-label={`Account baris ${i + 1}`} className={selectClass} required value={l.accountId} onChange={e => editLine(i, "accountId", e.target.value)}><option value="">-- Pilih Akun --</option>{accountOptions.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></td>
          <td className="p-2"><Input aria-label={`Description baris ${i + 1}`} maxLength={255} value={l.description} onChange={e => editLine(i, "description", e.target.value)} /></td>
          <td className="p-2"><Input aria-label={`Amount baris ${i + 1}`} type="number" min="0.01" step="0.01" required value={l.amount} onChange={e => editLine(i, "amount", e.target.value)} /></td>
          {canWrite && <td className="p-2"><Button aria-label={`Hapus baris ${i + 1}`} type="button" variant="outline" size="sm" disabled={lines.length <= 1} onClick={() => setLines(prev => prev.filter((_, j) => i !== j))}>✕</Button></td>}
        </tr>)}</tbody></table></div>
      </fieldset>
      <p className="text-right text-lg font-semibold">Total: {formatAmount(lines.reduce((sum, l) => sum + Math.round((Number(l.amount) || 0) * 100), 0) / 100)}</p>
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Tutup</Button>{canWrite && <Button type="submit" disabled={busy || Boolean(loadError)}>{busy ? "Menyimpan..." : "Simpan Klaim"}</Button>}</DialogFooter>
    </form>}
  </DialogContent></Dialog>;
}
