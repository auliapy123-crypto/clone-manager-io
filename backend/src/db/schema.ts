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
 * bank_accounts. SETIAP query list WAJIB memfilter `isNull(x.deletedAt)`.
 *
 * Tiga tabel sengaja TIDAK punya deletedAt:
 * - user_business_roles : pivot keanggotaan; mencabut akses harus benar-benar
 *                         menghapus baris, bukan menyembunyikannya.
 * - journal_entry_lines : anak dari journal_entries, ikut lewat header-nya.
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
// 9. AUDIT_LOGS
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
  }),
);

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  business: one(businesses, {
    fields: [contacts.businessId],
    references: [businesses.id],
  }),
  journalLines: many(journalEntryLines),
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

export const bankAccountsRelations = relations(bankAccounts, ({ one }) => ({
  business: one(businesses, {
    fields: [bankAccounts.businessId],
    references: [businesses.id],
  }),
  account: one(chartOfAccounts, {
    fields: [bankAccounts.accountId],
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
export type AuditLog = typeof auditLogs.$inferSelect;
