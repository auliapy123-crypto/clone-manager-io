import type { LucideIcon } from "lucide-react";
import { ArrowLeftRight, ArrowUpFromLine, BadgePercent, BookMarked, BookOpen, Building2, ClipboardList, FileMinus, FileText, FolderKanban, History, Hourglass, Landmark, LayoutDashboard, PackageCheck, Percent, Quote, Receipt, Scale, ShoppingCart, Stamp, Timer, Truck, User, UserRound, Users, Wallet, Waypoints } from "lucide-react";

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
  { label: "Bisnis", to: "/businesses", icon: Building2 },
  { label: "Pengguna", to: "/user", icon: User },
];

/**
 * Nav BusinessSidebar & MobileNavDrawer (Guide §7, §10.2) -- single source
 * of truth supaya kedua komponen tidak duplikasi daftar menu. `to` relatif
 * terhadap "/businesses/$businessId".
 */
export const businessMenuItems: MenuItem[] = [
  { label: "Ringkasan", to: "/businesses/$businessId", icon: LayoutDashboard },
  {
    label: "Anggota",
    to: "/businesses/$businessId/members",
    icon: Users,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Bagan Akun",
    to: "/businesses/$businessId/accounts",
    icon: BookOpen,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Pelanggan",
    to: "/businesses/$businessId/customers",
    icon: User,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Pemasok",
    to: "/businesses/$businessId/suppliers",
    icon: Truck,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Akun Bank dan Kas",
    to: "/businesses/$businessId/bank-accounts",
    icon: Landmark,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Penawaran Penjualan",
    to: "/businesses/$businessId/sales-quotes",
    icon: Quote,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Pesanan Penjualan",
    to: "/businesses/$businessId/sales-orders",
    icon: ShoppingCart,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Faktur Penjualan",
    to: "/businesses/$businessId/sales-invoices",
    icon: Receipt,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Nota Kredit",
    to: "/businesses/$businessId/credit-notes",
    icon: FileText,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Nota Debet",
    to: "/businesses/$businessId/debit-notes",
    icon: FileMinus,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Denda Keterlambatan",
    to: "/businesses/$businessId/late-payment-fees",
    icon: Hourglass,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Surat Jalan",
    to: "/businesses/$businessId/delivery-notes",
    icon: PackageCheck,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Waktu yang Ditagihkan",
    to: "/businesses/$businessId/billable-time",
    icon: Timer,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Bukti Potong PPh",
    to: "/businesses/$businessId/withholding-tax-receipts",
    icon: BadgePercent,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Penawaran Pembelian",
    to: "/businesses/$businessId/purchase-quotes",
    icon: Stamp,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Pesanan Pembelian",
    to: "/businesses/$businessId/purchase-orders",
    icon: ClipboardList,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Faktur Pembelian",
    to: "/businesses/$businessId/purchase-invoices",
    icon: Receipt,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Penerimaan Kas",
    to: "/businesses/$businessId/receipts",
    icon: Wallet,
    allowedRoles: ["admin", "accountant"],
  },
  { label: "Klaim Biaya", to: "/businesses/$businessId/expense-claims", icon: UserRound, allowedRoles: ["admin", "accountant"] },
  {
    label: "Pembayaran",
    to: "/businesses/$businessId/payments",
    icon: ArrowUpFromLine,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Transfer Antar Akun",
    to: "/businesses/$businessId/inter-account-transfers",
    icon: ArrowLeftRight,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Rekonsiliasi Bank",
    to: "/businesses/$businessId/bank-reconciliations",
    icon: Scale,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Jurnal Umum",
    to: "/businesses/$businessId/journal-entries",
    icon: BookMarked,
    allowedRoles: ["admin", "accountant", "viewer"],
  },
  {
    label: "Proyek",
    to: "/businesses/$businessId/projects",
    icon: FolderKanban,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Divisi",
    to: "/businesses/$businessId/divisions",
    icon: Waypoints,
    allowedRoles: ["admin", "accountant"],
  },
  {
    label: "Kode Pajak",
    to: "/businesses/$businessId/tax-codes",
    icon: Percent,
    allowedRoles: ["admin", "accountant"],
  },
  {
    // Fitur observasi (read-only) -- satu-satunya modul yang viewer juga
    // boleh selain Jurnal Umum.
    label: "Riwayat",
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
