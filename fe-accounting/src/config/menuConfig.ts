import type { LucideIcon } from "lucide-react";
import { ArrowLeftRight, ArrowUpFromLine, BadgePercent, BookMarked, BookOpen, Building2, ClipboardList, FileMinus, FileText, FolderKanban, History, Hourglass, Landmark, LayoutDashboard, ListPlus, PackageCheck, Percent, Quote, Receipt, Scale, ShoppingCart, Stamp, Timer, Truck, User, UserRound, Users, Wallet, Waypoints } from "lucide-react";

/** Role bisnis (Guide §7 RBAC) -- harus sinkron dgn BusinessRoleSchema backend. */
export type BusinessRole = "admin" | "accountant" | "viewer";

export interface MenuItem {
  /** Key i18n (grup "menu.*") — teks via t() di renderer. */
  labelKey: string;
  to: string;
  icon: LucideIcon;
  /** Kosong = tampil untuk semua role. */
  allowedRoles?: BusinessRole[];
}

/**
 * Nav Header Global (Guide §7, §9). Selalu tampil untuk user yang login,
 * tidak terikat konteks/role bisnis tertentu -- jadi tanpa allowedRoles.
 */
export const headerMenuItems: MenuItem[] = [
  { labelKey: "menu.business", to: "/businesses", icon: Building2 },
  { labelKey: "menu.users", to: "/user", icon: User },
];

/**
 * Nav BusinessSidebar & MobileNavDrawer (Guide §7, §10.2) -- single source
 * of truth supaya kedua komponen tidak duplikasi daftar menu. `to` relatif
 * terhadap "/businesses/$businessId".
 */
export const businessMenuItems: MenuItem[] = [
  { labelKey: "menu.summary", to: "/businesses/$businessId", icon: LayoutDashboard },
  {
    labelKey: "menu.members",
    to: "/businesses/$businessId/members",
    icon: Users,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.chartOfAccounts",
    to: "/businesses/$businessId/accounts",
    icon: BookOpen,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.customers",
    to: "/businesses/$businessId/customers",
    icon: User,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.suppliers",
    to: "/businesses/$businessId/suppliers",
    icon: Truck,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.bankAccounts",
    to: "/businesses/$businessId/bank-accounts",
    icon: Landmark,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.salesQuotes",
    to: "/businesses/$businessId/sales-quotes",
    icon: Quote,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.salesOrders",
    to: "/businesses/$businessId/sales-orders",
    icon: ShoppingCart,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.salesInvoices",
    to: "/businesses/$businessId/sales-invoices",
    icon: Receipt,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.creditNotes",
    to: "/businesses/$businessId/credit-notes",
    icon: FileText,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.debitNotes",
    to: "/businesses/$businessId/debit-notes",
    icon: FileMinus,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.latePaymentFees",
    to: "/businesses/$businessId/late-payment-fees",
    icon: Hourglass,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.deliveryNotes",
    to: "/businesses/$businessId/delivery-notes",
    icon: PackageCheck,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.billableTime",
    to: "/businesses/$businessId/billable-time",
    icon: Timer,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.withholdingTaxReceipts",
    to: "/businesses/$businessId/withholding-tax-receipts",
    icon: BadgePercent,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.purchaseQuotes",
    to: "/businesses/$businessId/purchase-quotes",
    icon: Stamp,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.purchaseOrders",
    to: "/businesses/$businessId/purchase-orders",
    icon: ClipboardList,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.purchaseInvoices",
    to: "/businesses/$businessId/purchase-invoices",
    icon: Receipt,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.receipts",
    to: "/businesses/$businessId/receipts",
    icon: Wallet,
    allowedRoles: ["admin", "accountant"],
  },
  { labelKey: "menu.expenseClaims", to: "/businesses/$businessId/expense-claims", icon: UserRound, allowedRoles: ["admin", "accountant"] },
  {
    labelKey: "menu.payments",
    to: "/businesses/$businessId/payments",
    icon: ArrowUpFromLine,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.interAccountTransfers",
    to: "/businesses/$businessId/inter-account-transfers",
    icon: ArrowLeftRight,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.bankReconciliations",
    to: "/businesses/$businessId/bank-reconciliations",
    icon: Scale,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.journalEntries",
    to: "/businesses/$businessId/journal-entries",
    icon: BookMarked,
    allowedRoles: ["admin", "accountant", "viewer"],
  },
  {
    labelKey: "menu.projects",
    to: "/businesses/$businessId/projects",
    icon: FolderKanban,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.divisions",
    to: "/businesses/$businessId/divisions",
    icon: Waypoints,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.taxCodes",
    to: "/businesses/$businessId/tax-codes",
    icon: Percent,
    allowedRoles: ["admin", "accountant"],
  },
  {
    labelKey: "menu.customFields",
    to: "/businesses/$businessId/custom-fields",
    icon: ListPlus,
    allowedRoles: ["admin", "accountant"],
  },
  {
    // Fitur observasi (read-only) -- satu-satunya modul yang viewer juga
    // boleh selain Jurnal Umum.
    labelKey: "menu.history",
    to: "/businesses/$businessId/history",
    icon: History,
    allowedRoles: ["admin", "accountant", "viewer"],
  },
];

/** Guide §7 RBAC: item tanpa allowedRoles tampil untuk semua role. */
export function canAccessMenuItem(
  item: MenuItem,
  role: BusinessRole | null | undefined,
): boolean {
  if (!item.allowedRoles) return true;
  return role != null && item.allowedRoles.includes(role);
}
