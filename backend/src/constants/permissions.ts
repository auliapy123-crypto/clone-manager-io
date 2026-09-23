/**
 * Daftar permission string (Guide §3.1 — constants/permissions.ts).
 *
 * CATATAN PENYESUAIAN DOMAIN:
 * Guide menyebut `requirePermissions(...)` dengan bypass untuk user SSO
 * internal (tipe ais/SuperAdmin). Project ini belum punya SSO maupun tabel
 * permission — yang ada hanya `user_business_roles.role`. Jadi permission
 * di sini diturunkan dari role lewat ROLE_PERMISSIONS di bawah, dan
 * TIDAK ADA jalur bypass. Begitu tabel permission/SSO masuk, cukup ganti
 * sumber ROLE_PERMISSIONS tanpa mengubah pemanggilan di route.
 */
import type { BusinessRole } from "../db/schema.js";

export const Permission = {
  // Bisnis itu sendiri (profil, bukan keanggotaan)
  BUSINESS_READ: "business:read",
  BUSINESS_UPDATE: "business:update",

  // Users & keanggotaan bisnis
  USER_READ: "user:read",
  USER_CREATE: "user:create",
  USER_ASSIGN: "user:assign",
  USER_UPDATE_ROLE: "user:update_role",
  USER_REMOVE: "user:remove",

  // Chart of accounts
  ACCOUNT_READ: "account:read",
  ACCOUNT_WRITE: "account:write",

  // Kontak (customer/supplier)
  CONTACT_READ: "contact:read",
  CONTACT_WRITE: "contact:write",

  // Jurnal
  JOURNAL_READ: "journal:read",
  JOURNAL_WRITE: "journal:write",

   // Rekening bank
   BANK_ACCOUNT_READ: "bank_account:read",
   BANK_ACCOUNT_WRITE: "bank_account:write",
   BANK_ACCOUNT_DELETE: "bank_account:delete",

    // Faktur penjualan
    SALES_INVOICE_READ: "sales_invoice:read",
    SALES_INVOICE_WRITE: "sales_invoice:write",
    SALES_INVOICE_DELETE: "sales_invoice:delete",

    // Faktur pembelian
    PURCHASE_INVOICE_READ: "purchase_invoice:read",
    PURCHASE_INVOICE_WRITE: "purchase_invoice:write",
    PURCHASE_INVOICE_DELETE: "purchase_invoice:delete",

    // Penerimaan kas/bank
    RECEIPT_READ: "receipt:read",
    RECEIPT_WRITE: "receipt:write",
    RECEIPT_DELETE: "receipt:delete",

    // Pengeluaran kas/bank
    PAYMENT_READ: "payment:read",
    PAYMENT_WRITE: "payment:write",
    PAYMENT_DELETE: "payment:delete",

    // Audit
    AUDIT_READ: "audit:read",
} as const;

export type PermissionValue = (typeof Permission)[keyof typeof Permission];

const READ_ONLY: PermissionValue[] = [
  Permission.BUSINESS_READ,
  Permission.USER_READ,
  Permission.ACCOUNT_READ,
  Permission.CONTACT_READ,
  Permission.JOURNAL_READ,
  Permission.BANK_ACCOUNT_READ,
  Permission.SALES_INVOICE_READ,
  Permission.PURCHASE_INVOICE_READ,
  Permission.RECEIPT_READ,
  Permission.PAYMENT_READ,
];

export const ROLE_PERMISSIONS: Record<BusinessRole, readonly PermissionValue[]> =
  {
    admin: Object.values(Permission),
    accountant: [
      ...READ_ONLY,
      Permission.ACCOUNT_WRITE,
      Permission.CONTACT_WRITE,
      Permission.JOURNAL_WRITE,
      Permission.BANK_ACCOUNT_WRITE,
      Permission.SALES_INVOICE_WRITE,
      Permission.SALES_INVOICE_DELETE,
      Permission.PURCHASE_INVOICE_WRITE,
      Permission.PURCHASE_INVOICE_DELETE,
      Permission.RECEIPT_WRITE,
      Permission.RECEIPT_DELETE,
      Permission.PAYMENT_WRITE,
      Permission.PAYMENT_DELETE,
    ],
    viewer: READ_ONLY,
  };

export function permissionsForRole(
  role: BusinessRole,
): readonly PermissionValue[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
