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
 * bank_accounts, sales_invoices, purchase_invoices, receipts.
 * SETIAP query list WAJIB memfilter `isNull(x.deletedAt)`.
 *
 * Beberapa tabel sengaja TIDAK punya deletedAt:
 * - user_business_roles : pivot keanggotaan; mencabut akses harus benar-benar
 *                         menghapus baris, bukan menyembunyikannya.
 * - journal_entry_lines : anak dari journal_entries, ikut lewat header-nya.
 * - sales_invoice_lines : anak dari sales_invoices, ikut lewat header-nya.
 * - purchase_invoice_lines / receipt_lines : anak header, ikut lewat parent.
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
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
  deletedAt: timestamp(),
}, (t) => [
  index("idx_purchase_invoices_business").on(t.businessId),
  index("idx_purchase_invoices_supplier").on(t.supplierId),
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
// 15. AUDIT_LOGS
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
    lines: many(purchaseInvoiceLines),
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
export type Receipt = typeof receipts.$inferSelect;
export type ReceiptLine = typeof receiptLines.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
