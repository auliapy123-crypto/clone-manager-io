import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/businesses/$businessId/reports")({
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
    items: [{ label: "Bank Reconciliation Statement" }, { label: "Cash Summary" }],
  },
  {
    group: "General Ledger",
    items: [
      { label: "General Ledger Summary" },
      { label: "General Ledger Transactions" },
      { label: "Journal" },
      { label: "Tax Transactions" },
    ],
  },
  {
    group: "Customers",
    items: [
      { label: "Customer Balance Summary" },
      { label: "Customer Balance Detail" },
      { label: "Aged Receivables" },
    ],
  },
  {
    group: "Suppliers",
    items: [
      { label: "Supplier Balance Summary" },
      { label: "Supplier Balance Detail" },
      { label: "Aged Payables" },
    ],
  },
  {
    group: "Sales Invoices",
    items: [{ label: "Sales Invoice Tax Summary" }, { label: "Sales Invoice Items" }],
  },
  {
    group: "Fixed Assets & Intangible Assets",
    items: [{ label: "Fixed Asset Summary" }, { label: "Intangible Asset Summary" }],
  },
  {
    group: "Billable Time & Custom Reports",
    items: [{ label: "Billable Time Summary" }, { label: "Custom Reports" }],
  },
];

function ReportsIndexPage() {
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
                    {item.label}
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
