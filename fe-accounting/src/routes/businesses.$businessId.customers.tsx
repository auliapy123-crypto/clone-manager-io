import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useBusinesses } from "@/hooks/use-businesses";
import {
  type CreateCustomerInput,
  type Customer,
  useCreateCustomer,
  useCustomers,
  useDeleteCustomer,
  useUpdateCustomer,
} from "@/hooks/use-customers";
import { getApiErrorMessage } from "@/lib/errors";
import { zodFieldValidator } from "@/lib/form-validators";

export const Route = createFileRoute("/businesses/$businessId/customers")({
  component: CustomersPage,
});

const nameSchema = z.string().trim().min(1, "Nama wajib diisi.").max(225, "Nama maksimal 225 karakter.");
const codeSchema = z.string().max(50, "Kode maksimal 50 karakter.");
const emailSchema = z.string().email("Email tidak valid.").or(z.literal(""));
const nonNegativeNumberSchema = z.string().refine((value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0), "Harus angka minimal 0.");
const dueDaysSchema = z.string().refine((value) => value === "" || (Number.isInteger(Number(value)) && Number(value) >= 0), "Harus bilangan bulat minimal 0.");

function formatAmount(value: number) {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function isInactive(customer: Customer) {
  return customer.isInactive === true || customer.deletedAt != null;
}

function CustomersPage() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((business) => business.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = useCustomers(businessId, page, { q: q || undefined });
  const totalAccountsReceivable = useMemo(
    () => data?.data.reduce((total, customer) => total + customer.accountsReceivable, 0) ?? 0,
    [data],
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Customers</h1>
          {data && <p className="text-sm text-gray-500">{data.pagination.total} customer</p>}
        </div>
        {canWrite && <Button onClick={() => setAddOpen(true)}>Tambah Customer</Button>}
      </div>

      <Input className="max-w-xs" placeholder="Cari kode, nama, atau email..." value={search} onChange={(event) => setSearch(event.target.value)} />

      <Card>
        <CardContent className="p-0">
          {isPending ? <p className="p-6 text-sm text-gray-500">Memuat customer...</p>
            : isError ? <p role="alert" className="p-6 text-sm text-red-700">{getApiErrorMessage(error)}</p>
            : data.data.length === 0 ? <p className="p-6 text-sm text-gray-500">Belum ada customer.</p>
            : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500"><tr>
                <th className="px-6 py-3 font-medium">Nama</th><th className="px-6 py-3 font-medium">Kode</th><th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 text-right font-medium">Accounts Receivable</th><th className="px-6 py-3 font-medium">Status</th>
                {canWrite && <th className="px-6 py-3 font-medium">Aksi</th>}
              </tr></thead>
              <tbody className="divide-y">{data.data.map((customer) => <CustomerRow key={customer.id} businessId={businessId} customer={customer} canWrite={canWrite} />)}</tbody>
              <tfoot className="border-t bg-gray-50"><tr><td colSpan={3} className="px-6 py-3 font-medium text-gray-900">Total</td><td className="px-6 py-3 text-right font-medium text-gray-900">{formatAmount(totalAccountsReceivable)}</td><td colSpan={canWrite ? 2 : 1} /></tr></tfoot>
            </table></div>}
        </CardContent>
      </Card>

      {data && data.pagination.totalPages > 1 && <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Sebelumnya</Button>
        <span className="text-sm text-gray-500">Halaman {data.pagination.currentPage} dari {data.pagination.totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Berikutnya</Button>
      </div>}

      {canWrite && <CustomerFormDialog mode="create" open={addOpen} onOpenChange={setAddOpen} businessId={businessId} />}
    </div>
  );
}

function CustomerRow({ businessId, customer, canWrite }: { businessId: string; customer: Customer; canWrite: boolean }) {
  const deleteCustomer = useDeleteCustomer(businessId);
  const [editOpen, setEditOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const inactive = isInactive(customer);
  const handleDelete = async () => {
    if (!window.confirm(`Hapus customer "${customer.name}"?`)) return;
    setRowError(null);
    try { await deleteCustomer.mutateAsync(customer.id); } catch (error) { setRowError(getApiErrorMessage(error)); }
  };

  return <><tr>
    <td className="px-6 py-3 font-medium text-gray-900">{customer.name}</td><td className="px-6 py-3 text-gray-600">{customer.code ?? "-"}</td><td className="px-6 py-3 text-gray-600">{customer.email ?? "-"}</td>
    <td className="px-6 py-3 text-right text-gray-900">{formatAmount(customer.accountsReceivable)}</td>
    <td className="px-6 py-3"><span className={inactive ? "rounded bg-gray-100 px-2 py-1 text-xs text-gray-600" : "rounded bg-green-100 px-2 py-1 text-xs text-green-700"}>{inactive ? "Inactive" : "Aktif"}</span></td>
    {canWrite && <td className="px-6 py-3"><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>Edit</Button><Button variant="destructive" size="sm" disabled={deleteCustomer.isPending} onClick={() => void handleDelete()}>Hapus</Button></div>{rowError && <p className="mt-1 text-xs text-red-600">{rowError}</p>}</td>}
  </tr>{canWrite && <CustomerFormDialog mode="edit" open={editOpen} onOpenChange={setEditOpen} businessId={businessId} customer={customer} />}</>;
}

type CustomerFormValues = { name: string; code: string; email: string; creditLimit: string; billingAddress: string; deliveryAddress: string; salesInvoiceDueDateDays: string };

function CustomerFormDialog({ mode, open, onOpenChange, businessId, customer }: { mode: "create" | "edit"; open: boolean; onOpenChange: (open: boolean) => void; businessId: string; customer?: Customer }) {
  const createCustomer = useCreateCustomer(businessId);
  const updateCustomer = useUpdateCustomer(businessId);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { name: customer?.name ?? "", code: customer?.code ?? "", email: customer?.email ?? "", creditLimit: customer ? String(customer.creditLimit) : "", billingAddress: customer?.billingAddress ?? "", deliveryAddress: customer?.deliveryAddress ?? "", salesInvoiceDueDateDays: customer?.salesInvoiceDueDateDays == null ? "" : String(customer.salesInvoiceDueDateDays) } satisfies CustomerFormValues,
    onSubmit: async ({ value, formApi }) => {
      setServerError(null);
      const base: CreateCustomerInput = { name: value.name.trim(), code: value.code.trim() || undefined, email: value.email.trim() || undefined, creditLimit: value.creditLimit === "" ? undefined : Number(value.creditLimit), billingAddress: value.billingAddress.trim() || undefined, deliveryAddress: value.deliveryAddress.trim() || undefined, salesInvoiceDueDateDays: value.salesInvoiceDueDateDays === "" ? undefined : Number(value.salesInvoiceDueDateDays) };
      try {
        if (mode === "create") await createCustomer.mutateAsync(base);
        else if (customer) await updateCustomer.mutateAsync({ customerId: customer.id, ...base, code: base.code ?? null, email: base.email ?? null, billingAddress: base.billingAddress ?? null, deliveryAddress: base.deliveryAddress ?? null, salesInvoiceDueDateDays: base.salesInvoiceDueDateDays ?? null });
        formApi.reset(); onOpenChange(false);
      } catch (error) { setServerError(getApiErrorMessage(error)); }
    },
  });
  const close = () => { onOpenChange(false); setServerError(null); form.reset(); };
  const textAreaClass = "min-h-20 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900";
  return <Dialog open={open} onOpenChange={close}><DialogContent onClose={close}><DialogHeader><DialogTitle>{mode === "create" ? "Tambah Customer" : "Ubah Customer"}</DialogTitle><DialogDescription>{mode === "create" ? "Tambahkan customer baru ke bisnis ini." : "Perbarui data customer ini."}</DialogDescription></DialogHeader>
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void form.handleSubmit(); }}>
      <FormInput form={form} name="name" label="Name" validator={nameSchema} required />
      <FormInput form={form} name="code" label="Code (opsional)" validator={codeSchema} />
      <FormInput form={form} name="email" label="Email (opsional)" validator={emailSchema} type="email" />
      <FormInput form={form} name="creditLimit" label="Credit Limit (opsional)" validator={nonNegativeNumberSchema} type="number" min="0" step="0.01" />
      <FormTextarea form={form} name="billingAddress" label="Billing Address (opsional)" className={textAreaClass} />
      <FormTextarea form={form} name="deliveryAddress" label="Delivery Address (opsional)" className={textAreaClass} />
      <FormInput form={form} name="salesInvoiceDueDateDays" label="Sales Invoice Due Date Days (opsional)" validator={dueDaysSchema} type="number" min="0" step="1" />
      {serverError && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={close}>Batal</Button><form.Subscribe selector={(state) => state.isSubmitting}>{(isSubmitting) => <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : mode === "create" ? "Tambah" : "Simpan"}</Button>}</form.Subscribe></DialogFooter>
    </form></DialogContent></Dialog>;
}

type FormInputProps = {
  form: ReturnType<typeof useForm<CustomerFormValues>>;
  name: keyof CustomerFormValues;
  label: string;
  validator?: z.ZodTypeAny;
  required?: boolean;
} & Omit<React.ComponentProps<typeof Input>, "form" | "name" | "value" | "onBlur" | "onChange">;

function FormInput({ form, name, label, validator, required, ...inputProps }: FormInputProps) {
  return <form.Field name={name} validators={validator ? { onChange: zodFieldValidator(validator) } : undefined}>{(field) => <div className="flex flex-col gap-1"><label htmlFor={field.name} className="text-sm font-medium text-gray-700">{label}{required && " *"}</label><Input id={field.name} name={field.name} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} {...inputProps} />{field.state.meta.errors.length > 0 && <p className="text-xs text-red-600">{field.state.meta.errors.join(", ")}</p>}</div>}</form.Field>;
}

function FormTextarea({ form, name, label, className }: { form: ReturnType<typeof useForm<CustomerFormValues>>; name: "billingAddress" | "deliveryAddress"; label: string; className: string }) {
  return <form.Field name={name}>{(field) => <div className="flex flex-col gap-1"><label htmlFor={field.name} className="text-sm font-medium text-gray-700">{label}</label><textarea id={field.name} name={field.name} className={className} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} /></div>}</form.Field>;
}
