import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useBankAccounts } from "@/hooks/use-bank-accounts";
import { useBusinesses } from "@/hooks/use-businesses";
import { useContacts } from "@/hooks/use-contacts";
import { useExpenseClaimOptions } from "@/hooks/use-expense-claims";
import { useProjectOptions } from "@/hooks/use-projects";
import { useDivisionOptions } from "@/hooks/use-divisions";
import {
  getTodayDateString,
  type Payment,
  type PaymentLineInput,
  useCreatePayment,
  useDeletePayment,
  usePayment,
  usePayments,
  useUpdatePayment,
} from "@/hooks/use-payments";
import { usePurchaseInvoices } from "@/hooks/use-purchase-invoices";
import { getApiErrorMessage } from "@/lib/errors";
import { useFormatAmount } from "@/lib/format";

export const Route = createFileRoute("/businesses/$businessId/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const role = businesses?.find((b) => b.id === businessId)?.role;
  const canWrite = role === "admin" || role === "accountant";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isPending, isError, error } = usePayments(businessId, page, {
    q: q || undefined,
  }, 10);

  const deletePayment = useDeletePayment(businessId);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalAmount = useMemo(
    () => data?.data.reduce((total, p) => total + p.totalAmount, 0) ?? 0,
    [data],
  );

  const handleDelete = async (payment: Payment) => {
    if (
      !window.confirm(
        payment.reference
          ? t("payments.deleteConfirmWithRef", {
              reference: payment.reference,
              amount: formatAmount(payment.totalAmount),
              bankAccount: payment.bankAccountName,
            })
          : t("payments.deleteConfirm", {
              amount: formatAmount(payment.totalAmount),
              bankAccount: payment.bankAccountName,
            }),
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      await deletePayment.mutateAsync(payment.id);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t("payments.title")}</h1>
          {data && (
            <p className="text-sm text-gray-500">{t("payments.subtitle", { count: data.pagination.total })}</p>
          )}
        </div>
        {canWrite && (
          <Button onClick={() => setActivePaymentId("new")}>{t("payments.newButton")}</Button>
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
          placeholder={t("payments.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">{t("payments.loading")}</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">{t("payments.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t("payments.colDate")}</th>
                    <th className="px-6 py-3 font-medium">{t("payments.colReference")}</th>
                    <th className="px-6 py-3 font-medium">{t("payments.colPaidFrom")}</th>
                    <th className="px-6 py-3 font-medium">{t("payments.colPayee")}</th>
                    <th className="px-6 py-3 font-medium">{t("payments.colDescription")}</th>
                    <th className="px-6 py-3 text-right font-medium">
                      {t("payments.colTotalAmount")}
                    </th>
                    <th className="px-6 py-3 font-medium">{t("common.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-600">{payment.date}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {payment.reference || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {payment.bankAccountName}
                      </td>
                      <td className="px-6 py-3 text-gray-900">
                        {payment.contactName}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {payment.description || "-"}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatAmount(payment.totalAmount)}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActivePaymentId(payment.id)}
                          >
                            {canWrite ? t("common.edit") : t("common.view")}
                          </Button>
                          {canWrite && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deletePayment.isPending}
                              onClick={() => void handleDelete(payment)}
                            >
                              {t("common.delete")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={5} className="px-6 py-3 font-medium text-gray-900">
                      {t("common.total")}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">
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

      {activePaymentId && (
        <PaymentFormDialog
          businessId={businessId}
          paymentId={activePaymentId}
          canWrite={canWrite}
          onClose={() => setActivePaymentId(null)}
        />
      )}
    </div>
  );
}

interface FormLine {
  id: string;
  accountId: string;
  purchaseInvoiceId: string;
  expenseClaimId: string;
  description: string;
  amount: string;
}

function computeLineAmount(line: FormLine): number {
  return parseFloat(line.amount) || 0;
}

function createEmptyLine(): FormLine {
  return {
    id: Math.random().toString(36).substring(2, 9),
    accountId: "",
    purchaseInvoiceId: "",
    expenseClaimId: "",
    description: "",
    amount: "",
  };
}

interface PaymentFormDialogProps {
  businessId: string;
  paymentId: string; // "new" atau UUID
  canWrite: boolean;
  onClose: () => void;
}

function PaymentFormDialog({
  businessId,
  paymentId,
  canWrite,
  onClose,
}: PaymentFormDialogProps) {
  const { t } = useTranslation();
  const { formatAmount } = useFormatAmount();
  const isNew = paymentId === "new";
  const { data: existingPayment, isPending: isPaymentLoading } = usePayment(
    businessId,
    isNew ? null : paymentId,
  );

  const { data: bankAccountsData, isPending: isBankAccountsLoading } = useBankAccounts(
    businessId,
    1,
    { status: "active" },
    100,
  );

  const { data: contactsData, isPending: isContactsLoading } = useContacts(businessId);

  const { data: accountsData, isPending: isAccountsLoading } = useAccounts(
    businessId,
    1,
    {},
    100,
  );

  const { data: purchaseInvoicesData, isPending: isInvoicesLoading } =
    usePurchaseInvoices(businessId, 1, {}, 100);

  const createPayment = useCreatePayment(businessId);
  const updatePayment = useUpdatePayment(businessId);

  const [date, setDate] = useState(getTodayDateString());
  const [reference, setReference] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [contactId, setContactId] = useState("");
  const { data: claimOptions = [], isPending: isClaimsLoading, error: claimsError } = useExpenseClaimOptions(businessId, contactId);
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [lines, setLines] = useState<FormLine[]>([createEmptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);

  const { options: divisionOptions } = useDivisionOptions(
    businessId,
    existingPayment?.divisionId,
  );

  const { options: projectOptions } = useProjectOptions(
    businessId,
    existingPayment?.projectId,
  );

  useEffect(() => {
    if (!isNew && existingPayment) {
      setDate(existingPayment.date);
      setReference(existingPayment.reference ?? "");
      setBankAccountId(existingPayment.bankAccountId);
      setContactId(existingPayment.contactId);
      setDescription(existingPayment.description ?? "");
      setProjectId(existingPayment.projectId ?? "");
      setDivisionId(existingPayment.divisionId ?? "");

      if (existingPayment.lines && existingPayment.lines.length > 0) {
        setLines(
          existingPayment.lines.map((line) => ({
            id: line.id || Math.random().toString(36).substring(2, 9),
            accountId: line.accountId,
            purchaseInvoiceId: line.purchaseInvoiceId ?? "",
            expenseClaimId: line.expenseClaimId ?? "",
            description: line.description ?? "",
            amount: String(line.amount),
          })),
        );
      }
    }
  }, [isNew, existingPayment]);

  const contactOptions = contactsData ?? [];

  // Akun baris: semua kategori KECUALI Revenue (uang keluar nggak masuk akal
  // dibayarkan atas nama akun pendapatan). Validasi final tetap di backend.
  const lineAccounts = useMemo(
    () => (accountsData?.data ?? []).filter((acc) => acc.category !== "Revenue"),
    [accountsData],
  );

  // Satu-satunya akun kontrol Accounts Payable bisnis ini (kalau ada) --
  // baris yang pakai akun ini memunculkan dropdown Invoice.
  const apControlAccountId = useMemo(() => {
    const apAccount = (accountsData?.data ?? []).find(
      (acc) => acc.category === "Liability" && acc.isControlAccount,
    );
    return apAccount?.id ?? null;
  }, [accountsData]);

  const expenseControlAccountId = (accountsData?.data ?? []).find(a => a.category === "Liability" && a.isExpenseClaimsControlAccount)?.id;
  const claimBalance = (id: string, balanceDue: number) =>
    (Math.round(balanceDue * 100) + (existingPayment?.lines ?? []).filter(l => l.expenseClaimId === id).reduce((sum, l) => sum + Math.round(l.amount * 100), 0)) / 100;

  const allInvoicesById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof purchaseInvoicesData>["data"][number]>();
    for (const inv of purchaseInvoicesData?.data ?? []) {
      const oldAllocation = (existingPayment?.lines ?? []).filter(l => l.purchaseInvoiceId === inv.id).reduce((sum, l) => sum + Math.round(l.amount * 100), 0);
      map.set(inv.id, { ...inv, balanceDue: (Math.round(inv.balanceDue * 100) + oldAllocation) / 100 });
    }
    return map;
  }, [purchaseInvoicesData, existingPayment]);

  // Invoice milik Payee yang dipilih dan masih ada tagihan (Unpaid/Overdue).
  const invoiceOptionsForPayee = useMemo(() => {
    if (!contactId) return [];
    return [...allInvoicesById.values()].filter(
      (inv) => inv.supplierId === contactId && inv.balanceDue > 0,
    );
  }, [allInvoicesById, contactId]);

  function invoiceOptionsForLine(line: FormLine) {
    if (line.purchaseInvoiceId && !invoiceOptionsForPayee.some((inv) => inv.id === line.purchaseInvoiceId)) {
      const current = allInvoicesById.get(line.purchaseInvoiceId);
      if (current) return [current, ...invoiceOptionsForPayee];
    }
    return invoiceOptionsForPayee;
  }

  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLine()]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateLine = (index: number, field: keyof FormLine, value: string) => {
    setLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== index) return line;
        const next = { ...line, [field]: value };
        // Ganti akun jadi bukan AP control -> invoice yang dipilih (kalau
        // ada) jadi tidak relevan lagi, kosongkan.
        if (field === "accountId" && value !== apControlAccountId) {
          next.purchaseInvoiceId = "";
        }
        if (field === "accountId" && value !== expenseControlAccountId) next.expenseClaimId = "";
        return next;
      }),
    );
  };

  // Ganti Payee -> alokasi invoice lama (milik Payee sebelumnya) sudah
  // tidak valid, kosongkan semua alokasi baris.
  const handleContactChange = (value: string) => {
    setContactId(value);
    setLines((prev) => prev.map((line) => ({ ...line, purchaseInvoiceId: "", expenseClaimId: "" })));
  };

  const liveTotalAmount = useMemo(() => {
    return lines.reduce((sum, line) => sum + computeLineAmount(line), 0);
  }, [lines]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!bankAccountId) {
      setFormError(t("payments.validationBankRequired"));
      return;
    }
    if (!contactId) {
      setFormError(t("payments.validationPayeeRequired"));
      return;
    }

    const finalDate = date.trim() || getTodayDateString();

    if (lines.length === 0) {
      setFormError(t("payments.validationMinLines"));
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.accountId) {
        setFormError(t("payments.validationLineAccount", { index: i + 1 }));
        return;
      }
      const amount = parseFloat(line.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setFormError(t("payments.validationLineAmount", { index: i + 1 }));
        return;
      }
      if (line.expenseClaimId) {
        const claim = claimOptions.find(c => c.id === line.expenseClaimId);
        const allocated = lines.filter(l => l.expenseClaimId === line.expenseClaimId).reduce((sum, l) => sum + Math.round(Number(l.amount) * 100), 0);
        if (claim && allocated > Math.round(claimBalance(claim.id, claim.balanceDue) * 100)) {
          setFormError(t("payments.validationClaimOverallocation"));
          return;
        }
      }
      if (line.purchaseInvoiceId) {
        const invoice = allInvoicesById.get(line.purchaseInvoiceId);
        if (invoice && amount > invoice.balanceDue) {
          setFormError(
            t("payments.validationInvoiceOverAllocation", {
              index: i + 1,
              amount: formatAmount(amount),
              balance: formatAmount(invoice.balanceDue),
            }),
          );
          return;
        }
      }
    }

    const formattedLines: PaymentLineInput[] = lines.map((l) => ({
      accountId: l.accountId,
      purchaseInvoiceId: l.purchaseInvoiceId || null,
      expenseClaimId: l.expenseClaimId || null,
      description: l.description.trim() || null,
      amount: parseFloat(l.amount) || 0,
    }));

    try {
      if (isNew) {
        await createPayment.mutateAsync({
          date: finalDate,
          reference: reference.trim() || undefined,
          bankAccountId,
          contactId,
          description: description.trim() || undefined,
          projectId: projectId || null,
          divisionId: divisionId || null,
          lines: formattedLines,
        });
      } else {
        await updatePayment.mutateAsync({
          paymentId,
          date: finalDate,
          reference: reference.trim() || null,
          bankAccountId,
          contactId,
          description: description.trim() || null,
          projectId: projectId || null,
          divisionId: divisionId || null,
          lines: formattedLines,
        });
      }
      onClose();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const isSubmitting = createPayment.isPending || updatePayment.isPending;
  const isInitialLoading = !isNew && isPaymentLoading;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClose={onClose}
      >
        <DialogHeader>
          <DialogTitle>
            {isNew
              ? t("payments.newButton")
              : canWrite
                ? t("payments.dialogTitleEdit")
                : t("payments.dialogTitleDetail")}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? t("payments.dialogDescriptionNew")
              : t("payments.dialogDescriptionEdit")}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            {t("payments.loadingDetail")}
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
                    {t("payments.fieldDate")} *
                  </label>
                  <Input
                    type="date"
                    value={date}
                    disabled={!canWrite}
                    onChange={(event) => setDate(event.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("payments.fieldReference")}
                  </label>
                  <Input
                    placeholder={t("payments.placeholderReference")}
                    value={reference}
                    disabled={!canWrite}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("payments.fieldPaidFrom")} *
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={bankAccountId}
                    disabled={!canWrite || isBankAccountsLoading}
                    onChange={(event) => setBankAccountId(event.target.value)}
                    required
                  >
                    <option value="">{t("payments.selectAccount")}</option>
                    {bankAccountsData?.data.map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.name} ({ba.accountCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("payments.fieldPayee")} *
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={contactId}
                    disabled={!canWrite || isContactsLoading}
                    onChange={(event) => handleContactChange(event.target.value)}
                    required
                  >
                    <option value="">{t("payments.selectPayee")}</option>
                    {contactOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("payments.fieldDescription")}
                  </label>
                  <Input
                    placeholder={t("payments.placeholderDescription")}
                    value={description}
                    disabled={!canWrite}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("payments.fieldProject")}
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={projectId}
                    disabled={!canWrite}
                    onChange={(event) => setProjectId(event.target.value)}
                  >
                    <option value="">{t("payments.noProject")}</option>
                    {projectOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.code ? `(${p.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {t("payments.fieldDivision")}
                  </label>
                  <select
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                    value={divisionId}
                    disabled={!canWrite}
                    onChange={(event) => setDivisionId(event.target.value)}
                  >
                    <option value="">{t("payments.noDivision")}</option>
                    {divisionOptions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.code ? `(${d.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {t("payments.linesTitle")}
                  </h3>
                  {canWrite && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addLine}
                    >
                      {t("payments.addLine")}
                    </Button>
                  )}
                </div>

                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-gray-50 uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2 font-medium min-w-[220px]">
                          {t("payments.lineColAccount")} *
                        </th>
                        <th className="px-3 py-2 font-medium min-w-[220px]">
                          {t("payments.lineColAllocation")}
                        </th>
                        <th className="px-3 py-2 font-medium min-w-[160px]">
                          {t("payments.lineColDescription")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium w-40">
                          {t("payments.lineColAmount")} *
                        </th>
                        {canWrite && (
                          <th className="px-3 py-2 text-center font-medium w-16">
                            {t("payments.lineColRemove")}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((line, index) => {
                        const isApLine =
                          apControlAccountId != null && line.accountId === apControlAccountId;
                        const selectedInvoice = line.purchaseInvoiceId
                          ? allInvoicesById.get(line.purchaseInvoiceId)
                          : undefined;

                        return (
                          <tr key={line.id} className="hover:bg-gray-50">
                            <td className="p-2 align-top">
                              <Combobox
                                className="h-8 text-xs"
                                ariaLabel={`Akun baris ${index + 1}`}
                                value={line.accountId}
                                disabled={!canWrite || isAccountsLoading}
                                onChange={(value) =>
                                  updateLine(index, "accountId", value)
                                }
                                placeholder={t("payments.selectLineAccount")}
                                options={lineAccounts.map((acc) => ({
                                  value: acc.id,
                                  label: `${acc.code} - ${acc.name}`,
                                }))}
                              />
                            </td>
                            <td className="p-2 align-top">
                              {isApLine ? (
                                <>
                                  <select
                                    className="w-full h-8 rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                    value={line.purchaseInvoiceId}
                                    disabled={!canWrite || isInvoicesLoading || !contactId}
                                    onChange={(event) =>
                                      updateLine(index, "purchaseInvoiceId", event.target.value)
                                    }
                                  >
                                    <option value="">{t("payments.noInvoiceAllocation")}</option>
                                    {invoiceOptionsForLine(line).map((inv) => (
                                      <option key={inv.id} value={inv.id}>
                                        {t("payments.invoiceOption", {
                                          reference: inv.reference || inv.issueDate,
                                          balance: formatAmount(inv.balanceDue),
                                        })}
                                      </option>
                                    ))}
                                  </select>
                                  {!contactId && (
                                    <p className="mt-0.5 text-[10px] text-amber-600">
                                      {t("payments.selectPayeeFirst")}
                                    </p>
                                  )}
                                  {contactId &&
                                    invoiceOptionsForPayee.length === 0 &&
                                    !isInvoicesLoading && (
                                      <p className="mt-0.5 text-[10px] text-amber-600">
                                        {t("payments.noUnpaidInvoices")}
                                      </p>
                                    )}
                                  {selectedInvoice && (
                                    <p className="mt-0.5 text-[10px] text-gray-500">
                                      {t("payments.remainingBalance", {
                                        balance: formatAmount(selectedInvoice.balanceDue),
                                      })}
                                    </p>
                                  )}
                                </>
                              ) : line.accountId === expenseControlAccountId ? (
                                <>
                                  <select aria-label={`Expense Claim baris ${index + 1}`} className="w-full h-8 rounded border border-gray-300 bg-white px-2 text-xs"
                                    value={line.expenseClaimId} disabled={!canWrite || isClaimsLoading || !contactId}
                                    onChange={event => updateLine(index, "expenseClaimId", event.target.value)}>
                                    <option value="">{t("payments.noClaimAllocation")}</option>
                                    {claimOptions.filter(c => c.status === "Unpaid" || c.id === line.expenseClaimId || (existingPayment?.lines ?? []).some(l => l.expenseClaimId === c.id)).map(c => (
                                      <option key={c.id} value={c.id}>{t("payments.claimOption", { reference: c.reference || c.date, balance: formatAmount(claimBalance(c.id, c.balanceDue)) })}</option>
                                    ))}
                                    {line.expenseClaimId && !claimOptions.some(c => c.id === line.expenseClaimId) && <option value={line.expenseClaimId}>{t("payments.claimUnavailable")}</option>}
                                  </select>
                                  {!contactId && <p className="text-xs text-amber-600">{t("payments.selectPayeeFirst")}</p>}
                                  {claimsError && <p role="alert" className="text-xs text-red-600">{getApiErrorMessage(claimsError)}</p>}
                                </>
                              ) : (
                                <span className="text-[10px] text-gray-400">
                                  {t("payments.selectControlHint")}
                                </span>
                              )}
                            </td>
                            <td className="p-2 align-top">
                              <input
                                type="text"
                                className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                placeholder={t("payments.lineDescriptionPlaceholder")}
                                value={line.description}
                                disabled={!canWrite}
                                onChange={(event) =>
                                  updateLine(index, "description", event.target.value)
                                }
                              />
                            </td>
                            <td className="p-2 align-top">
                              <input
                                type="number"
                                step="any"
                                min="0.01"
                                className="w-full h-8 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="0.00"
                                value={line.amount}
                                disabled={!canWrite}
                                onChange={(event) =>
                                  updateLine(index, "amount", event.target.value)
                                }
                                required
                              />
                            </td>
                            {canWrite && (
                              <td className="p-2 text-center align-top">
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-end gap-6">
                  <div className="text-right">
                    <div className="text-xs text-gray-500">{t("payments.totalLabel")}</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatAmount(liveTotalAmount)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                {t("common.cancel")}
              </Button>
              {canWrite && (
                <Button type="submit" disabled={isSubmitting}>
                  {isNew
                    ? (isSubmitting ? t("common.submitting") : t("payments.submitNew"))
                    : (isSubmitting ? t("common.submitting") : t("payments.submitEdit"))}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
