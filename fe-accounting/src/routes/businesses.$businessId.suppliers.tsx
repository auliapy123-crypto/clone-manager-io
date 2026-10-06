import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useBusinesses } from "@/hooks/use-businesses";
import {
  type CreateSupplierInput,
  type Supplier,
  useCreateSupplier,
  useSuppliers,
  useDeleteSupplier,
  useUpdateSupplier,
} from "@/hooks/use-suppliers";
import { getApiErrorMessage } from "@/lib/errors";
import { zodFieldValidator } from "@/lib/form-validators";
import { useFormatAmount } from "@/lib/format";

export const Route = createFileRoute("/businesses/$businessId/suppliers")({
  component: SuppliersPage,
});

function isInactive(supplier: Supplier) {
  return supplier.isInactive === true || supplier.deletedAt != null;
}

function SuppliersPage() {
  const { formatAmount } = useFormatAmount();
  const { businessId } = Route.useParams();
  const { t } = useTranslation();
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

  const { data, isPending, isError, error } = useSuppliers(businessId, page, { q: q || undefined }, 10);
  const totalAccountsPayable = useMemo(
    () => data?.data.reduce((total, supplier) => total + supplier.accountsPayable, 0) ?? 0,
    [data],
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t("suppliers.title")}</h1>
          {data && <p className="text-sm text-gray-500">{t("suppliers.subtitle", { count: data.pagination.total })}</p>}
        </div>
        {canWrite && <Button onClick={() => setAddOpen(true)}>{t("suppliers.newButton")}</Button>}
      </div>

      <Input className="max-w-xs" placeholder={t("suppliers.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />

      <Card>
        <CardContent className="p-0">
          {isPending ? <p className="p-6 text-sm text-gray-500">{t("suppliers.loading")}</p>
            : isError ? <p role="alert" className="p-6 text-sm text-red-700">{getApiErrorMessage(error)}</p>
            : data.data.length === 0 ? <p className="p-6 text-sm text-gray-500">{t("suppliers.empty")}</p>
            : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500"><tr>
                <th className="px-6 py-3 font-medium">{t("common.colName")}</th><th className="px-6 py-3 font-medium">{t("suppliers.colCode")}</th><th className="px-6 py-3 font-medium">{t("common.colEmail")}</th>
                <th className="px-6 py-3 text-right font-medium">{t("suppliers.colPayable")}</th><th className="px-6 py-3 font-medium">{t("common.colStatus")}</th>
                {canWrite && <th className="px-6 py-3 font-medium">{t("common.colActions")}</th>}
              </tr></thead>
              <tbody className="divide-y">{data.data.map((supplier) => <SupplierRow key={supplier.id} businessId={businessId} supplier={supplier} canWrite={canWrite} />)}</tbody>
              <tfoot className="border-t bg-gray-50"><tr><td colSpan={3} className="px-6 py-3 font-medium text-gray-900">{t("common.total")}</td><td className="px-6 py-3 text-right font-medium text-gray-900">{formatAmount(totalAccountsPayable)}</td><td colSpan={canWrite ? 2 : 1} /></tr></tfoot>
            </table></div>}
        </CardContent>
      </Card>

      {data && (
        <Pagination
          page={page}
          totalPages={data.pagination.totalPages}
          onPageChange={setPage}
        />
      )}

      {canWrite && <SupplierFormDialog mode="create" open={addOpen} onOpenChange={setAddOpen} businessId={businessId} />}
    </div>
  );
}

function SupplierRow({ businessId, supplier, canWrite }: { businessId: string; supplier: Supplier; canWrite: boolean }) {
  const { formatAmount } = useFormatAmount();
  const { t } = useTranslation();
  const deleteSupplier = useDeleteSupplier(businessId);
  const [editOpen, setEditOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const inactive = isInactive(supplier);
  const handleDelete = async () => {
    if (!window.confirm(t("common.deleteConfirmItem", { item: supplier.name }))) return;
    setRowError(null);
    try { await deleteSupplier.mutateAsync(supplier.id); } catch (error) { setRowError(getApiErrorMessage(error)); }
  };

  return <><tr>
    <td className="px-6 py-3 font-medium text-gray-900">{supplier.name}</td><td className="px-6 py-3 text-gray-600">{supplier.code ?? "-"}</td><td className="px-6 py-3 text-gray-600">{supplier.email ?? "-"}</td>
    <td className="px-6 py-3 text-right text-gray-900">{formatAmount(supplier.accountsPayable)}</td>
    <td className="px-6 py-3"><span className={inactive ? "rounded bg-gray-100 px-2 py-1 text-xs text-gray-600" : "rounded bg-green-100 px-2 py-1 text-xs text-green-700"}>{inactive ? t("common.inactive") : t("common.active")}</span></td>
    {canWrite && <td className="px-6 py-3"><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>{t("common.edit")}</Button><Button variant="destructive" size="sm" disabled={deleteSupplier.isPending} onClick={() => void handleDelete()}>{t("common.delete")}</Button></div>{rowError && <p className="mt-1 text-xs text-red-600">{rowError}</p>}</td>}
  </tr>{canWrite && <SupplierFormDialog mode="edit" open={editOpen} onOpenChange={setEditOpen} businessId={businessId} supplier={supplier} />}</>;
}

type SupplierFormValues = { name: string; code: string; email: string; billingAddress: string; deliveryAddress: string; purchaseInvoiceDueDateDays: string };

function SupplierFormDialog({ mode, open, onOpenChange, businessId, supplier }: { mode: "create" | "edit"; open: boolean; onOpenChange: (open: boolean) => void; businessId: string; supplier?: Supplier }) {
  const { t } = useTranslation();
  const createSupplier = useCreateSupplier(businessId);
  const updateSupplier = useUpdateSupplier(businessId);
  const [serverError, setServerError] = useState<string | null>(null);

  // Schema dibuat DI DALAM komponen karena pesan validasi butuh t().
  const nameSchema = z.string().trim().min(1, t("suppliers.validationNameRequired")).max(225, t("suppliers.validationNameMax"));
  const codeSchema = z.string().max(50, t("suppliers.validationCodeMax"));
  const emailSchema = z.string().email(t("suppliers.validationEmail")).or(z.literal(""));
  const dueDaysSchema = z.string().refine((value) => value === "" || (Number.isInteger(Number(value)) && Number(value) >= 0), t("suppliers.validationDueDays"));

  const form = useForm({
    defaultValues: { name: supplier?.name ?? "", code: supplier?.code ?? "", email: supplier?.email ?? "", billingAddress: supplier?.billingAddress ?? "", deliveryAddress: supplier?.deliveryAddress ?? "", purchaseInvoiceDueDateDays: supplier?.purchaseInvoiceDueDateDays == null ? "" : String(supplier.purchaseInvoiceDueDateDays) } satisfies SupplierFormValues,
    onSubmit: async ({ value, formApi }) => {
      setServerError(null);
      const base: CreateSupplierInput = { name: value.name.trim(), code: value.code.trim() || undefined, email: value.email.trim() || undefined, billingAddress: value.billingAddress.trim() || undefined, deliveryAddress: value.deliveryAddress.trim() || undefined, purchaseInvoiceDueDateDays: value.purchaseInvoiceDueDateDays === "" ? undefined : Number(value.purchaseInvoiceDueDateDays) };
      try {
        if (mode === "create") await createSupplier.mutateAsync(base);
        else if (supplier) await updateSupplier.mutateAsync({ supplierId: supplier.id, ...base, code: base.code ?? null, email: base.email ?? null, billingAddress: base.billingAddress ?? null, deliveryAddress: base.deliveryAddress ?? null, purchaseInvoiceDueDateDays: base.purchaseInvoiceDueDateDays ?? null });
        formApi.reset(); onOpenChange(false);
      } catch (error) { setServerError(getApiErrorMessage(error)); }
    },
  });
  const close = () => { onOpenChange(false); setServerError(null); form.reset(); };
  const textAreaClass = "min-h-20 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900";
  return <Dialog open={open} onOpenChange={close}><DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden" onClose={close}><DialogHeader className="shrink-0"><DialogTitle>{mode === "create" ? t("suppliers.dialogTitleNew") : t("suppliers.dialogTitleEdit")}</DialogTitle><DialogDescription>{mode === "create" ? t("suppliers.dialogDescriptionNew") : t("suppliers.dialogDescriptionEdit")}</DialogDescription></DialogHeader>
    <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void form.handleSubmit(); }}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <FormInput form={form} name="name" label={t("suppliers.fieldName")} validator={nameSchema} required />
      <FormInput form={form} name="code" label={t("suppliers.fieldCode")} validator={codeSchema} />
      <FormInput form={form} name="email" label={t("suppliers.fieldEmail")} validator={emailSchema} type="email" />
      <FormTextarea form={form} name="billingAddress" label={t("suppliers.fieldBillingAddress")} className={textAreaClass} />
      <FormTextarea form={form} name="deliveryAddress" label={t("suppliers.fieldDeliveryAddress")} className={textAreaClass} />
      <FormInput form={form} name="purchaseInvoiceDueDateDays" label={t("suppliers.fieldDueDays")} validator={dueDaysSchema} type="number" min="0" step="1" />
      {serverError && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
      </div>
      <DialogFooter className="shrink-0 border-t pt-3"><Button type="button" variant="outline" onClick={close}>{t("common.cancel")}</Button><form.Subscribe selector={(state) => state.isSubmitting}>{(isSubmitting) => <Button type="submit" disabled={isSubmitting}>{isSubmitting ? t("common.submitting") : mode === "create" ? t("common.add") : t("common.save")}</Button>}</form.Subscribe></DialogFooter>
    </form></DialogContent></Dialog>;
}

type FormInputProps = {
  form: ReturnType<typeof useForm<SupplierFormValues>>;
  name: keyof SupplierFormValues;
  label: string;
  validator?: z.ZodTypeAny;
  required?: boolean;
} & Omit<React.ComponentProps<typeof Input>, "form" | "name" | "value" | "onBlur" | "onChange">;

function FormInput({ form, name, label, validator, required, ...inputProps }: FormInputProps) {
  return <form.Field name={name} validators={validator ? { onChange: zodFieldValidator(validator) } : undefined}>{(field) => <div className="flex flex-col gap-1"><label htmlFor={field.name} className="text-sm font-medium text-gray-700">{label}{required && " *"}</label><Input id={field.name} name={field.name} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} {...inputProps} />{field.state.meta.errors.length > 0 && <p className="text-xs text-red-600">{field.state.meta.errors.join(", ")}</p>}</div>}</form.Field>;
}

function FormTextarea({ form, name, label, className }: { form: ReturnType<typeof useForm<SupplierFormValues>>; name: "billingAddress" | "deliveryAddress"; label: string; className: string }) {
  return <form.Field name={name}>{(field) => <div className="flex flex-col gap-1"><label htmlFor={field.name} className="text-sm font-medium text-gray-700">{label}</label><textarea id={field.name} name={field.name} className={className} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} /></div>}</form.Field>;
}
