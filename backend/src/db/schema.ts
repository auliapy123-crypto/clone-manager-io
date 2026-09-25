/**
 * Skema database (Drizzle ORM) — cerminan 1:1 dari Schema.sql.
 *
 * Catatan penamaan: drizzle.config.ts memakai `casing: "snake_case"` dan
 * `drizzle()` di src/db/index.ts juga, jadi properti camelCase di sini
 * otomatis dipetakan ke kolom snake_case di Postgres
 * (mis. `passwordHash` -> `password_hash`). Jangan tulis nama kolom manual.
 *
 * SOFT-DELETE (Guide §5.2): kolom `deletedAt` ada di entitas tenant —
 * businesses, users, chart_of_accounts, contacts, journal_entries,
 * bank_accounts, sales_invoices, purchase_invoices, receipts, payments,
 * inter_account_transfers, bank_reconciliations.
 * SETIAP query list WAJIB memfilter `isNull(x.deletedAt)`.
 *
 * Beberapa tabel sengaja TIDAK punya deletedAt:
 * - user_business_roles : pivot keanggotaan; mencabut akses harus benar-benar
 *                         menghapus baris, bukan menyembunyikannya.
 * - journal_entry_lines : anak dari journal_entries, ikut lewat header-nya.
 * - sales_invoice_lines : anak dari sales_invoices, ikut lewat header-nya.
 * - purchase_invoice_lines / receipt_lines / payment_lines : anak header,
 *                         ikut lewat parent.
 * - audit_logs          : append-only; jejak audit tidak boleh dihapus.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------
// Enum-like constants (disimpan sebagai VARCHAR + CHECK, sesuai Schema.sql)
// ---------------------------------------------------------------------
export const BUSINESS_ROLES = ["admin", "accountant", "viewer"] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export const ACCOUNT_CATEGORIES = [
  "Asset",
  "Liability",
  "Equity",
  "Revenue",
  "Expense",
] as const;
export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

export const AUDIT_ACTIONS = ["CREATE", "UPDATE", "DELETE"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// =====================================================================
// 1. BUSINESSES
// =====================================================================
export const businesses = pgTable("businesses", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 225 }).notNull(),
  baseCurrencyCode: varchar({ length: 3 }).notNull().default("IDR"),
  createdAt: timestamp().notNull().defaultNow(),
  deletedAt: timestamp(),
});

// =====================================================================
// 2. USERS
// =====================================================================
export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 225 }).notNull(),
  email: varchar({ length: 225 }).notNull().unique(),
  passwordHash: varchar({ length: 225 }).notNull(),
  createdAt: timestamp().notNull().defaultNow(),
  deletedAt: timestamp(),
});

// =====================================================================
// 3. USER_BUSINESS_ROLES  (tabel pivot multi-tenant)
// =====================================================================
export const userBusinessRoles = pgTable(
  "user_business_roles",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    role: varchar({ length: 50 }).$type<BusinessRole>().notNull(),
  },
  (t) => [
    unique("user_business_roles_user_id_business_id_key").on(
      t.userId,
      t.businessId,
    ),
    index("idx_ubr_business").on(t.businessId),
    index("idx_ubr_user").on(t.userId),
    check(
      "user_business_roles_role_check",
      sql`${t.role} IN ('admin', 'accountant', 'viewer')`,
    ),
  ],
);

// =====================================================================
// 4. CHART_OF_ACCOUNTS
// =====================================================================
export const chartOfAccounts = pgTable(
  "chart_of_accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    code: varchar({ length: 50 }).notNull(),
    name: varchar({ length: 225 }).notNull(),
    category: varchar({ length: 50 }).$type<AccountCategory>().notNull(),
    groupName: varchar({ length: 100 }),
    currencyCode: varchar({ length: 3 }).notNull().default("IDR"),
    isControlAccount: boolean().notNull().default(false),
    isExpenseClaimsControlAccount: boolean().notNull().default(false),
    deletedAt: timestamp(),
  },
  (t) => [
    unique("chart_of_accounts_business_id_code_key").on(t.businessId, t.code),
    index("idx_coa_business").on(t.businessId),
    check(
      "chart_of_accounts_category_check",
      sql`${t.category} IN ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense')`,
    ),
  ],
);

// =====================================================================
// 5. CONTACTS  (Customer & Supplier digabung dalam satu tabel)
// =====================================================================
export const contacts = pgTable(
  "contacts",
  {
    id: uuid().primaryKey().defaultRandom(),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    code: varchar({ length: 50 }),
    name: varchar({ length: 225 }).notNull(),
    email: varchar({ length: 225 }),
    billingAddress: text(),
    deliveryAddress: text(),
    isCustomer: boolean().notNull().default(false),
    isSupplier: boolean().notNull().default(false),
    creditLimit: numeric({ precision: 18, scale: 2 }).notNull().default("0.00"),
    salesInvoiceDueDateDays: integer(),
    purchaseInvoiceDueDateDays: integer(),
    deletedAt: timestamp(),
  },
  (t) => [
    index("idx_contacts_business").on(t.businessId),
    index("idx_contacts_is_customer").on(t.businessId, t.isCustomer),
    index("idx_contacts_is_supplier").on(t.businessId, t.isSupplier),
  ],
);

// =====================================================================
// 6. JOURNAL_ENTRIES  (header double-entry ledger)
// =====================================================================
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    entryDate: date().notNull(),
    reference: varchar({ length: 100 }),
    sourceModule: varchar({ length: 50 }).notNull().default("manual_journal"),
    sourceId: uuid(),
    description: text(),
    deletedAt: timestamp(),
  },
  (t) => [
    index("idx_je_business").on(t.businessId),
    index("idx_je_source").on(t.sourceModule, t.sourceId),
  ],
);

// =====================================================================
// 7. JOURNAL_ENTRY_LINES  (baris debit/kredit)
//
// PENTING (lihat catatan di Schema.sql):
// - "total debit = total kredit per journal_entry" TIDAK dipaksakan database.
//   WAJIB divalidasi di backend sebelum commit transaksi.
// - debit/credit = amount_foreign x exchange_rate juga dihitung backend.
// =====================================================================
export const journalEntryLines = pgTable(
  "journal_entry_lines",
  {
    id: uuid().primaryKey().defaultRandom(),
    journalEntryId: uuid()
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => chartOfAccounts.id),
    contactId: uuid().references(() => contacts.id),
    currencyCode: varchar({ length: 3 }).notNull().default("IDR"),
    exchangeRate: numeric({ precision: 12, scale: 6 })
      .notNull()
      .default("1.000000"),
    amountForeign: numeric({ precision: 18, scale: 2 })
      .notNull()
      .default("0.00"),
    debit: numeric({ precision: 18, scale: 2 }).notNull().default("0.00"),
    credit: numeric({ precision: 18, scale: 2 }).notNull().default("0.00"),
    description: text(),
  },
  (t) => [
    index("idx_jel_entry").on(t.journalEntryId),
    index("idx_jel_account").on(t.accountId),
    index("idx_jel_contact").on(t.contactId),
    check(
      "chk_jel_debit_credit",
      sql`(${t.debit} >= 0 AND ${t.credit} >= 0) AND NOT (${t.debit} > 0 AND ${t.credit} > 0)`,
    ),
  ],
);

// =====================================================================
// 8. BANK_ACCOUNTS
// =====================================================================
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    name: varchar({ length: 100 }).notNull(),
    accountType: varchar({ length: 20 }).notNull().default("bank"),
    bankName: varchar({ length: 100 }),
    accountNumber: varchar({ length: 50 }),
    currencyCode: varchar({ length: 3 }).notNull().default("IDR"),
    description: text(),
    status: varchar({ length: 20 }).notNull().default("active"),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
    deletedAt: timestamp(),
  },
  (t) => [
    unique("bank_accounts_business_id_account_id_key").on(t.businessId, t.accountId),
    index("idx_bank_accounts_business_status").on(t.businessId, t.status),
    index("idx_bank_accounts_business_name").on(t.businessId, t.name),
    check(
      "bank_accounts_type_check",
      sql`${t.accountType} IN ('bank', 'cash')`,
    ),
    check(
      "bank_accounts_status_check",
      sql`${t.status} IN ('active', 'archived')`,
    ),
  ],
);

// =====================================================================
// 9. SALES_INVOICES  (header faktur penjualan — revisi dokumen §3.1)
//
// - TANPA kolom status dan TANPA kolom total: status (Paid/Unpaid/Overdue)
//   dan balanceDue DIHITUNG real-time saat GET, bukan disimpan.
// - Jurnal dilacak via journal_entries(source_module='sales_invoice',
//   source_id=invoice id), BUKAN kolom journal_entry_id.
// - reference/due_date/billing_address/description semuanya opsional.
// =====================================================================
export const salesInvoices = pgTable("sales_invoices", {
  id: uuid().primaryKey().defaultRandom(),
  businessId: uuid()
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  customerId: uuid()
    .notNull()
    .references(() => contacts.id),
  reference: varchar({ length: 50 }),
  issueDate: date().notNull(),
  dueDate: date(),
  billingAddress: text(),
  description: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
  deletedAt: timestamp(),
}, (t) => [
  index("idx_sales_invoices_business").on(t.businessId),
  index("idx_sales_invoices_customer").on(t.customerId),
]);

// =====================================================================
// 10. SALES_INVOICE_LINES  (baris item faktur — revisi dokumen §3.2)
//
// Anak dari sales_invoices (ON DELETE CASCADE), ikut lewat header-nya —
// sengaja TANPA deletedAt seperti journal_entry_lines.
// subtotal/tax_amount/line_total SEMUA dihitung backend, bukan input.
// Pajak per baris via tax_rate_percent (bukan tabel kode pajak terpisah).
// =====================================================================
export const salesInvoiceLines = pgTable("sales_invoice_lines", {
  id: uuid().primaryKey().defaultRandom(),
  salesInvoiceId: uuid()
    .notNull()
    .references(() => salesInvoices.id, { onDelete: "cascade" }),
  accountId: uuid()
    .notNull()
    .references(() => chartOfAccounts.id),
  description: varchar({ length: 255 }),
  quantity: numeric({ precision: 18, scale: 4 }).notNull().default("1.0000"),
  unitPrice: numeric({ precision: 18, scale: 2 }).notNull(),
  subtotal: numeric({ precision: 18, scale: 2 }).notNull(),
  taxRatePercent: numeric({ precision: 5, scale: 2 }).notNull().default("0.00"),
  taxAmount: numeric({ precision: 18, scale: 2 }).notNull().default("0.00"),
  lineTotal: numeric({ precision: 18, scale: 2 }).notNull(),
  sortOrder: integer().notNull().default(0),
}, (t) => [
  index("idx_sales_invoice_lines_invoice").on(t.salesInvoiceId),
  index("idx_sales_invoice_lines_account").on(t.accountId),
]);

// =====================================================================
// 11. PURCHASE_INVOICES  (header faktur pembelian)
//
// - Cerminan Sales Invoices dengan arah jurnal berlawanan.
// - TANPA kolom status dan total: status (Paid/Unpaid/Overdue) dan
//   balanceDue DIHITUNG real-time saat GET.
// - Terhubung ke Supplier (contacts.is_supplier=true).
// - Jurnal dilacak via journal_entries(source_module='purchase_invoice',
//   source_id=invoice id).
// =====================================================================
export const purchaseInvoices = pgTable("purchase_invoices", {
  id: uuid().primaryKey().defaultRandom(),
  businessId: uuid()
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  supplierId: uuid()
    .notNull()
    .references(() => contacts.id),
  reference: varchar({ length: 50 }),
  issueDate: date().notNull(),
  dueDate: date(),
  description: text(),
  quoteNumber: varchar({ length: 50 }),
  orderNumber: varchar({ length: 50 }),
  purchaseOrderId: uuid().references(() => purchaseOrders.id),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
  deletedAt: timestamp(),
}, (t) => [
  index("idx_purchase_invoices_business").on(t.businessId),
  index("idx_purchase_invoices_supplier").on(t.supplierId),
  index("idx_purchase_invoices_purchase_order").on(t.purchaseOrderId),
]);

// =====================================================================
// 12. PURCHASE_INVOICE_LINES  (baris item faktur pembelian)
//
// Anak dari purchase_invoices (ON DELETE CASCADE), ikut lewat header-nya.
// TANPA pajak per baris (MVP scope).
// subtotal = quantity × unit_price, dihitung backend.
// =====================================================================
export const purchaseInvoiceLines = pgTable("purchase_invoice_lines", {
  id: uuid().primaryKey().defaultRandom(),
  purchaseInvoiceId: uuid()
    .notNull()
    .references(() => purchaseInvoices.id, { onDelete: "cascade" }),
  accountId: uuid()
    .notNull()
    .references(() => chartOfAccounts.id),
  description: varchar({ length: 255 }),
  quantity: numeric({ precision: 18, scale: 4 }).notNull().default("1.0000"),
  unitPrice: numeric({ precision: 18, scale: 2 }).notNull(),
  subtotal: numeric({ precision: 18, scale: 2 }).notNull(),
  sortOrder: integer().notNull().default(0),
}, (t) => [
  index("idx_purchase_invoice_lines_invoice").on(t.purchaseInvoiceId),
  index("idx_purchase_invoice_lines_account").on(t.accountId),
]);

// =====================================================================
// 13. RECEIPTS  (header penerimaan kas/bank)
//
// - TANPA status/balanceDue: receipt yang tersimpan langsung selesai.
// - Jurnal: DEBIT COA rekening bank/kas, KREDIT tiap baris item.
// - Dilacak via journal_entries(source_module='receipt', source_id=receipt id).
// =====================================================================
export const receipts = pgTable(
  "receipts",
  {
    id: uuid().primaryKey().defaultRandom(),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    date: date().notNull(),
    reference: varchar({ length: 50 }),
    bankAccountId: uuid()
      .notNull()
      .references(() => bankAccounts.id),
    contactId: uuid().references(() => contacts.id),
    description: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
    deletedAt: timestamp(),
  },
  (t) => [
    index("idx_receipts_business").on(t.businessId),
    index("idx_receipts_bank_account").on(t.bankAccountId),
    index("idx_receipts_contact").on(t.contactId),
  ],
);

// =====================================================================
// 14. RECEIPT_LINES  (baris item penerimaan)
//
// Anak dari receipts (ON DELETE CASCADE). amount > 0.
// =====================================================================
export const receiptLines = pgTable(
  "receipt_lines",
  {
    id: uuid().primaryKey().defaultRandom(),
    receiptId: uuid()
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => chartOfAccounts.id),
    description: varchar({ length: 255 }),
    amount: numeric({ precision: 18, scale: 2 }).notNull(),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [
    index("idx_receipt_lines_receipt").on(t.receiptId),
    index("idx_receipt_lines_account").on(t.accountId),
    check("chk_receipt_lines_amount_positive", sql`${t.amount} > 0`),
  ],
);

// =====================================================================
// 15. PAYMENTS  (header pengeluaran kas/bank)
//
// - TANPA status: payment yang tersimpan langsung final ("Cleared").
// - Jurnal: DEBIT tiap baris item, KREDIT COA rekening bank/kas.
// - Dilacak via journal_entries(source_module='payment', source_id=payment id).
// =====================================================================
export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    date: date().notNull(),
    reference: varchar({ length: 50 }),
    bankAccountId: uuid()
      .notNull()
      .references(() => bankAccounts.id),
    contactId: uuid()
      .notNull()
      .references(() => contacts.id),
    description: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
    deletedAt: timestamp(),
  },
  (t) => [
    index("idx_payments_business").on(t.businessId),
    index("idx_payments_bank_account").on(t.bankAccountId),
    index("idx_payments_contact").on(t.contactId),
  ],
);

// =====================================================================
// 16. PAYMENT_LINES  (baris item pembayaran)
//
// Anak dari payments (ON DELETE CASCADE). amount > 0.
// purchaseInvoiceId nullable — diisi kalau baris ini mengalokasikan
// pelunasan ke Purchase Invoice tertentu (mengurangi balanceDue-nya).
// =====================================================================
export const expenseClaims = pgTable("expense_claims", {
  id: uuid().primaryKey().defaultRandom(),
  businessId: uuid().notNull().references(() => businesses.id, { onDelete: "cascade" }),
  date: date().notNull().default(sql`CURRENT_DATE`),
  reference: varchar({ length: 50 }),
  payerContactId: uuid().notNull().references(() => contacts.id),
  payee: varchar({ length: 255 }), description: text(), deletedAt: timestamp(),
  createdAt: timestamp().notNull().defaultNow(), updatedAt: timestamp().notNull().defaultNow(),
}, (t) => [index("idx_expense_claims_business").on(t.businessId), index("idx_expense_claims_payer").on(t.payerContactId)]);

export const expenseClaimLines = pgTable("expense_claim_lines", {
  id: uuid().primaryKey().defaultRandom(),
  expenseClaimId: uuid().notNull().references(() => expenseClaims.id, { onDelete: "cascade" }),
  accountId: uuid().notNull().references(() => chartOfAccounts.id),
  description: varchar({ length: 255 }), amount: numeric({ precision: 18, scale: 2 }).notNull(),
  sortOrder: integer().notNull().default(0),
}, (t) => [index("idx_expense_claim_lines_claim").on(t.expenseClaimId), check("expense_claim_lines_amount_check", sql`${t.amount} > 0`)]);

export const paymentLines = pgTable(
  "payment_lines",
  {
    id: uuid().primaryKey().defaultRandom(),
    paymentId: uuid()
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => chartOfAccounts.id),
    purchaseInvoiceId: uuid().references(() => purchaseInvoices.id),
    expenseClaimId: uuid().references(() => expenseClaims.id),
    description: varchar({ length: 255 }),
    amount: numeric({ precision: 18, scale: 2 }).notNull(),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [
    index("idx_payment_lines_payment").on(t.paymentId),
    index("idx_payment_lines_account").on(t.accountId),
    index("idx_payment_lines_purchase_invoice").on(t.purchaseInvoiceId),
    index("idx_payment_lines_expense_claim").on(t.expenseClaimId),
    check("chk_payment_allocation_target", sql`${t.purchaseInvoiceId} IS NULL OR ${t.expenseClaimId} IS NULL`),
    check("chk_payment_lines_amount_positive", sql`${t.amount} > 0`),
  ],
);

// =====================================================================
// 17. INTER_ACCOUNT_TRANSFERS  (transfer antar akun bank/kas)
//
// - TANPA tabel baris item: cuma 2 akun + 1 nominal.
// - Jurnal: DEBIT COA akun tujuan (to), KREDIT COA akun sumber (from),
//   dua-duanya sebesar amount yang sama.
// - Dilacak via journal_entries(source_module='inter_account_transfer',
//   source_id=transfer id).
// =====================================================================
export const interAccountTransfers = pgTable(
  "inter_account_transfers",
  {
    id: uuid().primaryKey().defaultRandom(),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    date: date().notNull(),
    reference: varchar({ length: 50 }),
    description: text(),
    fromBankAccountId: uuid()
      .notNull()
      .references(() => bankAccounts.id),
    toBankAccountId: uuid()
      .notNull()
      .references(() => bankAccounts.id),
    amount: numeric({ precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
    deletedAt: timestamp(),
  },
  (t) => [
    index("idx_inter_account_transfers_business").on(t.businessId),
    index("idx_inter_account_transfers_from").on(t.fromBankAccountId),
    index("idx_inter_account_transfers_to").on(t.toBankAccountId),
    check(
      "chk_inter_account_transfers_amount_positive",
      sql`${t.amount} > 0`,
    ),
  ],
);

// =====================================================================
// 19. BANK_RECONCILIATIONS  (lembar verifikasi saldo vs rekening koran)
//
// - MURNI baca-saja: TIDAK ADA posting jurnal dari modul ini.
// - bookBalance/discrepancy/status DIHITUNG real-time saat GET, bukan
//   disimpan (bookBalance = SUM jurnal s.d. tanggal cutoff).
// - Dilacak audit via audit_logs seperti modul lain; jurnal TIDAK tersentuh.
// =====================================================================
export const bankReconciliations = pgTable(
  "bank_reconciliations",
  {
    id: uuid().primaryKey().defaultRandom(),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    date: date().notNull(),
    bankAccountId: uuid()
      .notNull()
      .references(() => bankAccounts.id),
    statementBalance: numeric({ precision: 18, scale: 2 }).notNull().default("0.00"),
    description: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
    deletedAt: timestamp(),
  },
  (t) => [
    index("idx_bank_reconciliations_business").on(t.businessId),
    index("idx_bank_reconciliations_bank_account").on(t.bankAccountId),
  ],
);

// =====================================================================
// 20. PURCHASE_ORDERS  (header pesanan pembelian — NON-POSTING)
//
// - TIDAK ADA jurnal dari modul ini.
// - purchase_invoices.purchase_order_id menunjuk ke sini (nullable).
// =====================================================================
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    supplierId: uuid()
      .notNull()
      .references(() => contacts.id),
    reference: varchar({ length: 50 }),
    date: date().notNull(),
    billingAddress: text(),
    description: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
    deletedAt: timestamp(),
  },
  (t) => [
    index("idx_purchase_orders_business").on(t.businessId),
    index("idx_purchase_orders_supplier").on(t.supplierId),
  ],
);

// =====================================================================
// 21. PURCHASE_ORDER_LINES  (baris item pesanan pembelian)
//
// Anak dari purchase_orders (ON DELETE CASCADE), ikut lewat header-nya.
// line_amount = quantity × unit_price, dihitung backend.
// =====================================================================
export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid().primaryKey().defaultRandom(),
    purchaseOrderId: uuid()
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => chartOfAccounts.id),
    description: varchar({ length: 255 }),
    quantity: numeric({ precision: 18, scale: 4 }).notNull().default("1.0000"),
    unitPrice: numeric({ precision: 18, scale: 2 }).notNull(),
    lineAmount: numeric({ precision: 18, scale: 2 }).notNull(),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [
    index("idx_purchase_order_lines_order").on(t.purchaseOrderId),
    index("idx_purchase_order_lines_account").on(t.accountId),
  ],
);

// =====================================================================
// 22. AUDIT_LOGS
// =====================================================================
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    businessId: uuid().references(() => businesses.id, {
      onDelete: "cascade",
    }),
    userId: uuid().references(() => users.id),
    action: varchar({ length: 20 }).$type<AuditAction>().notNull(),
    entityType: varchar({ length: 100 }).notNull(),
    entityId: uuid().notNull(),
    oldValues: jsonb().$type<Record<string, unknown> | null>(),
    newValues: jsonb().$type<Record<string, unknown> | null>(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    index("idx_audit_logs_business").on(t.businessId),
    index("idx_audit_logs_entity").on(t.entityType, t.entityId),
    check(
      "audit_logs_action_check",
      sql`${t.action} IN ('CREATE', 'UPDATE', 'DELETE')`,
    ),
  ],
);

// =====================================================================
// RELATIONS (dipakai oleh db.query.*)
// =====================================================================
export const businessesRelations = relations(businesses, ({ many }) => ({
  userRoles: many(userBusinessRoles),
  accounts: many(chartOfAccounts),
  contacts: many(contacts),
  journalEntries: many(journalEntries),
  bankAccounts: many(bankAccounts),
  salesInvoices: many(salesInvoices),
  purchaseInvoices: many(purchaseInvoices),
  receipts: many(receipts),
  payments: many(payments),
  interAccountTransfers: many(interAccountTransfers),
  bankReconciliations: many(bankReconciliations),
  purchaseOrders: many(purchaseOrders),
  auditLogs: many(auditLogs),
}));

export const usersRelations = relations(users, ({ many }) => ({
  businessRoles: many(userBusinessRoles),
  auditLogs: many(auditLogs),
}));

export const userBusinessRolesRelations = relations(
  userBusinessRoles,
  ({ one }) => ({
    user: one(users, {
      fields: [userBusinessRoles.userId],
      references: [users.id],
    }),
    business: one(businesses, {
      fields: [userBusinessRoles.businessId],
      references: [businesses.id],
    }),
  }),
);

export const chartOfAccountsRelations = relations(
  chartOfAccounts,
  ({ one, many }) => ({
    business: one(businesses, {
      fields: [chartOfAccounts.businessId],
      references: [businesses.id],
    }),
    journalLines: many(journalEntryLines),
    bankAccounts: many(bankAccounts),
    receiptLines: many(receiptLines),
  }),
);

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  business: one(businesses, {
    fields: [contacts.businessId],
    references: [businesses.id],
  }),
  journalLines: many(journalEntryLines),
  salesInvoices: many(salesInvoices),
  purchaseInvoices: many(purchaseInvoices),
  receipts: many(receipts),
  payments: many(payments),
  purchaseOrders: many(purchaseOrders),
}));

export const journalEntriesRelations = relations(
  journalEntries,
  ({ one, many }) => ({
    business: one(businesses, {
      fields: [journalEntries.businessId],
      references: [businesses.id],
    }),
    lines: many(journalEntryLines),
  }),
);

export const journalEntryLinesRelations = relations(
  journalEntryLines,
  ({ one }) => ({
    entry: one(journalEntries, {
      fields: [journalEntryLines.journalEntryId],
      references: [journalEntries.id],
    }),
    account: one(chartOfAccounts, {
      fields: [journalEntryLines.accountId],
      references: [chartOfAccounts.id],
    }),
    contact: one(contacts, {
      fields: [journalEntryLines.contactId],
      references: [contacts.id],
    }),
  }),
);

export const bankAccountsRelations = relations(bankAccounts, ({ one, many }) => ({
  business: one(businesses, {
    fields: [bankAccounts.businessId],
    references: [businesses.id],
  }),
  account: one(chartOfAccounts, {
    fields: [bankAccounts.accountId],
    references: [chartOfAccounts.id],
  }),
  receipts: many(receipts),
  payments: many(payments),
  transfersFrom: many(interAccountTransfers, { relationName: "transferFrom" }),
  transfersTo: many(interAccountTransfers, { relationName: "transferTo" }),
  reconciliations: many(bankReconciliations),
}));

export const salesInvoicesRelations = relations(
  salesInvoices,
  ({ one, many }) => ({
    business: one(businesses, {
      fields: [salesInvoices.businessId],
      references: [businesses.id],
    }),
    customer: one(contacts, {
      fields: [salesInvoices.customerId],
      references: [contacts.id],
    }),
    lines: many(salesInvoiceLines),
  }),
);

export const salesInvoiceLinesRelations = relations(
  salesInvoiceLines,
  ({ one }) => ({
    invoice: one(salesInvoices, {
      fields: [salesInvoiceLines.salesInvoiceId],
      references: [salesInvoices.id],
    }),
    account: one(chartOfAccounts, {
      fields: [salesInvoiceLines.accountId],
      references: [chartOfAccounts.id],
    }),
  }),
);

export const purchaseInvoicesRelations = relations(
  purchaseInvoices,
  ({ one, many }) => ({
    business: one(businesses, {
      fields: [purchaseInvoices.businessId],
      references: [businesses.id],
    }),
    supplier: one(contacts, {
      fields: [purchaseInvoices.supplierId],
      references: [contacts.id],
    }),
    purchaseOrder: one(purchaseOrders, {
      fields: [purchaseInvoices.purchaseOrderId],
      references: [purchaseOrders.id],
    }),
    lines: many(purchaseInvoiceLines),
    paymentLines: many(paymentLines),
  }),
);

export const purchaseInvoiceLinesRelations = relations(
  purchaseInvoiceLines,
  ({ one }) => ({
    invoice: one(purchaseInvoices, {
      fields: [purchaseInvoiceLines.purchaseInvoiceId],
      references: [purchaseInvoices.id],
    }),
    account: one(chartOfAccounts, {
      fields: [purchaseInvoiceLines.accountId],
      references: [chartOfAccounts.id],
    }),
  }),
);

export const purchaseOrdersRelations = relations(
  purchaseOrders,
  ({ one, many }) => ({
    business: one(businesses, {
      fields: [purchaseOrders.businessId],
      references: [businesses.id],
    }),
    supplier: one(contacts, {
      fields: [purchaseOrders.supplierId],
      references: [contacts.id],
    }),
    lines: many(purchaseOrderLines),
    invoices: many(purchaseInvoices),
  }),
);

export const purchaseOrderLinesRelations = relations(
  purchaseOrderLines,
  ({ one }) => ({
    order: one(purchaseOrders, {
      fields: [purchaseOrderLines.purchaseOrderId],
      references: [purchaseOrders.id],
    }),
    account: one(chartOfAccounts, {
      fields: [purchaseOrderLines.accountId],
      references: [chartOfAccounts.id],
    }),
  }),
);

export const receiptsRelations = relations(receipts, ({ one, many }) => ({
  business: one(businesses, {
    fields: [receipts.businessId],
    references: [businesses.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [receipts.bankAccountId],
    references: [bankAccounts.id],
  }),
  contact: one(contacts, {
    fields: [receipts.contactId],
    references: [contacts.id],
  }),
  lines: many(receiptLines),
}));

export const receiptLinesRelations = relations(receiptLines, ({ one }) => ({
  receipt: one(receipts, {
    fields: [receiptLines.receiptId],
    references: [receipts.id],
  }),
  account: one(chartOfAccounts, {
    fields: [receiptLines.accountId],
    references: [chartOfAccounts.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  business: one(businesses, {
    fields: [payments.businessId],
    references: [businesses.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [payments.bankAccountId],
    references: [bankAccounts.id],
  }),
  contact: one(contacts, {
    fields: [payments.contactId],
    references: [contacts.id],
  }),
  lines: many(paymentLines),
}));

export const paymentLinesRelations = relations(paymentLines, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentLines.paymentId],
    references: [payments.id],
  }),
  account: one(chartOfAccounts, {
    fields: [paymentLines.accountId],
    references: [chartOfAccounts.id],
  }),
  purchaseInvoice: one(purchaseInvoices, {
    fields: [paymentLines.purchaseInvoiceId],
    references: [purchaseInvoices.id],
  }),
  expenseClaim: one(expenseClaims, {
    fields: [paymentLines.expenseClaimId],
    references: [expenseClaims.id],
  }),
}));

export const expenseClaimsRelations = relations(expenseClaims, ({ one, many }) => ({
  business: one(businesses, { fields: [expenseClaims.businessId], references: [businesses.id] }),
  payer: one(contacts, { fields: [expenseClaims.payerContactId], references: [contacts.id] }),
  lines: many(expenseClaimLines),
  paymentLines: many(paymentLines),
}));
export const expenseClaimLinesRelations = relations(expenseClaimLines, ({ one }) => ({
  claim: one(expenseClaims, { fields: [expenseClaimLines.expenseClaimId], references: [expenseClaims.id] }),
  account: one(chartOfAccounts, { fields: [expenseClaimLines.accountId], references: [chartOfAccounts.id] }),
}));

export const interAccountTransfersRelations = relations(
  interAccountTransfers,
  ({ one }) => ({
    business: one(businesses, {
      fields: [interAccountTransfers.businessId],
      references: [businesses.id],
    }),
    fromBankAccount: one(bankAccounts, {
      fields: [interAccountTransfers.fromBankAccountId],
      references: [bankAccounts.id],
      relationName: "transferFrom",
    }),
    toBankAccount: one(bankAccounts, {
      fields: [interAccountTransfers.toBankAccountId],
      references: [bankAccounts.id],
      relationName: "transferTo",
    }),
  }),
);

export const bankReconciliationsRelations = relations(
  bankReconciliations,
  ({ one }) => ({
    business: one(businesses, {
      fields: [bankReconciliations.businessId],
      references: [businesses.id],
    }),
    bankAccount: one(bankAccounts, {
      fields: [bankReconciliations.bankAccountId],
      references: [bankAccounts.id],
    }),
  }),
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  business: one(businesses, {
    fields: [auditLogs.businessId],
    references: [businesses.id],
  }),
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

// =====================================================================
// TIPE TURUNAN (dipakai repository & route)
// =====================================================================
export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserBusinessRole = typeof userBusinessRoles.$inferSelect;
export type NewUserBusinessRole = typeof userBusinessRoles.$inferInsert;
export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type JournalEntryLine = typeof journalEntryLines.$inferSelect;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type SalesInvoice = typeof salesInvoices.$inferSelect;
export type SalesInvoiceLine = typeof salesInvoiceLines.$inferSelect;
export type PurchaseInvoice = typeof purchaseInvoices.$inferSelect;
export type PurchaseInvoiceLine = typeof purchaseInvoiceLines.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type ReceiptLine = typeof receiptLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentLine = typeof paymentLines.$inferSelect;
export type InterAccountTransfer = typeof interAccountTransfers.$inferSelect;
export type BankReconciliation = typeof bankReconciliations.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
