import type { LucideIcon } from "lucide-react";
import { ArrowLeftRight, ArrowUpFromLine, BookOpen, Building2, Landmark, LayoutDashboard, Receipt, Truck, User, Users, Wallet } from "lucide-react";

/** Role bisnis (Guide §7 RBAC) -- harus sinkron dgn BusinessRoleSchema backend. */
export type BusinessRole = "admin" | "accountant" | "viewer";

export interface MenuItem {
  label: string;
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
  { label: "Businesses", to: "/businesses", icon: Building2 },
  { label: "Users", to: "/user", icon: User },
];

/**
 * Nav BusinessSidebar & MobileNavDrawer (Guide §7, §10.2) -- single source
 * of truth supaya kedua komponen tidak duplikasi daftar menu. `to` relatif
 * terhadap "/businesses/$businessId".
 */
export const businessMenuItems: MenuItem[] = [
  { label: "Overview", to: "/businesses/$businessId", icon: LayoutDashboard },
  {
    label: "Members",
    to: "/businesses/$businessId/members",
    icon: Users,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Chart of Accounts",
    to: "/businesses/$businessId/accounts",
    icon: BookOpen,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Customers",
    to: "/businesses/$businessId/customers",
    icon: User,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Suppliers",
    to: "/businesses/$businessId/suppliers",
    icon: Truck,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Bank and Cash Accounts",
    to: "/businesses/$businessId/bank-accounts",
    icon: Landmark,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Sales Invoices",
    to: "/businesses/$businessId/sales-invoices",
    icon: Receipt,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Purchase Invoices",
    to: "/businesses/$businessId/purchase-invoices",
    icon: Receipt,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Receipts",
    to: "/businesses/$businessId/receipts",
    icon: Wallet,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Payments",
    to: "/businesses/$businessId/payments",
    icon: ArrowUpFromLine,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Inter Account Transfers",
    to: "/businesses/$businessId/inter-account-transfers",
    icon: ArrowLeftRight,
    allowedRoles: ["admin", "accountant"],
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
