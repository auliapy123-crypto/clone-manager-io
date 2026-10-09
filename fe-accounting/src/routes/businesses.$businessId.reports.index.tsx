import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { isParameterOnlyReport, type ReportType } from "@/hooks/use-reports";

export const Route = createFileRoute("/businesses/$businessId/reports/")({
  component: ReportsIndexPage,
});

// 8 grup laporan seperti indeks Manager.io. Item aktif Tahap 1 -> klik ke
// daftar definisi; sisanya abu-abu non-klik "Segera".
const GROUPS: Array<{
  group: string;
  items: Array<{ type?: string; label: string; enabled?: boolean }>;
}> = [
  {
    group: "Financial Statements",
    items: [
      { type: "trial_balance", label: "Trial Balance", enabled: true },
      { type: "profit_and_loss", label: "Profit and Loss Statement", enabled: true },
      { type: "balance_sheet", label: "Balance Sheet", enabled: true },
      { label: "Cash Flow Statement" },
      { label: "Statement of Changes in Equity" },
      { label: "Actual vs Budget" },
    ],
  },
  {
    group: "Cash & cash equivalents",
    items: [
      { type: "receipts_payments_summary", label: "Receipts & Payments Summary", enabled: true },
    ],
  },
  {
    group: "General Ledger",
    items: [
      { type: "general_ledger_summary", label: "General Ledger Summary", enabled: true },
      { type: "general_ledger_transactions", label: "General Ledger Transactions", enabled: true },
      { label: "Tax Transactions" },
    ],
  },
  {
    group: "Customers",
    items: [
      { type: "customer_summary", label: "Customer Summary", enabled: true },
      { label: "Customer Statements" },
      { type: "aged_receivables", label: "Aged Receivables", enabled: true },
    ],
  },
  {
    group: "Suppliers",
    items: [
      { type: "supplier_summary", label: "Supplier Summary", enabled: true },
      { label: "Supplier Statements" },
      { type: "aged_payables", label: "Aged Payables", enabled: true },
    ],
  },
  {
    group: "Sales Invoices",
    items: [
      { type: "sales_invoice_totals_by_customer", label: "Sales Invoice Totals by Customer", enabled: true },
      { label: "Sales Invoice Totals by Item" },
      { label: "Sales Invoice Totals by Custom Field" },
    ],
  },
  {
    group: "Fixed Assets & Intangible Assets",
    items: [{ label: "Fixed Asset Summary" }, { label: "Intangible Asset Summary" }],
  },
  {
    group: "Billable Time & Custom Reports",
    items: [
      { type: "billable_time_summary", label: "Billable Time Summary", enabled: true },
      { label: "Custom Reports" },
    ],
  },
];

function ReportsIndexPage() {
  const { t } = useTranslation();
  const { businessId } = Route.useParams();
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-gray-900">Reports</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GROUPS.map((group) => (
          <Card key={group.group}>
            <CardHeader>
              <CardTitle className="text-sm">{group.group}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {group.items.map((item) =>
                item.enabled && item.type ? (
                  <Link
                    key={item.label}
                    to="/businesses/$businessId/reports/$type"
                    params={{ businessId, type: item.type }}
                    className="text-sm font-medium text-blue-700 hover:underline"
                  >
                    {isParameterOnlyReport(item.type as ReportType) ? t(`reports.${item.type}`) : item.label}
                  </Link>
                ) : (
                  <span key={item.label} className="text-sm text-gray-400">
                    {item.label}
                    <span className="ml-2 text-xs text-gray-300">Segera</span>
                  </span>
                ),
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
