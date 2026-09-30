/**
 * WithholdingTaxReceiptRepository — bukti potong PPh dari pelanggan.
 *
 * Modul POSTING, tabel datar TANPA baris item:
 * - DEBIT: withholding_tax_account_id (kategori Asset, "PPh Dibayar di Muka")
 * - KREDIT: akun kontrol Accounts Receivable, contactId = customer
 * Mengurangi balanceDue Sales Invoice terkait (live, dihitung di
 * SalesInvoiceRepository dari receipt aktif). amount WAJIB <= balanceDue
 * faktur SAAT INI, divalidasi dalam transaction yang sama dengan insert
 * (faktur di-lock `FOR UPDATE` supaya dua receipt paralel tidak lolos
 * bersamaan). Status di respons SELALU "Applied".
 */
import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import db, { type Database } from "../db/index.js";
import {
  chartOfAccounts,
  contacts,
  journalEntries,
  journalEntryLines,
  salesInvoices,
  withholdingTaxReceipts,
} from "../db/schema.js";
import {
  findArControlAccount,
  getSalesInvoiceAllocationInfo,
} from "./SalesInvoiceRepository.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbOrTx = Database | Tx;

export const WITHHOLDING_TAX_RECEIPT_SOURCE_MODULE = "withholding_tax_receipt";

export class WithholdingTaxReceiptValidationError extends Error {}

export interface WithholdingTaxReceiptCreateInput {
  date: string;
  customerId: string;
  salesInvoiceId: string;
  withholdingTaxAccountId: string;
  amount: number;
  reference?: string | null;
  description?: string | null;
}

export type WithholdingTaxReceiptUpdateInput =
  Partial<WithholdingTaxReceiptCreateInput>;

export interface WithholdingTaxReceiptListOptions {
  page: number;
  pageSize: number;
  q?: string;
}

export interface WithholdingTaxReceiptRecord {
  id: string;
  businessId: string;
  date: string;
  customerId: string;
  customerName: string;
  salesInvoiceId: string;
  salesInvoiceReference: string | null;
  withholdingTaxAccountId: string;
  withholdingTaxAccountCode: string;
  withholdingTaxAccountName: string;
  amount: number;
  reference: string | null;
  description: string | null;
  status: "Applied";
  createdAt: Date;
  updatedAt: Date;
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function toRecord(row: {
  id: string;
  businessId: string;
  date: string;
  customerId: string;
  customerName: string;
  salesInvoiceId: string;
  salesInvoiceReference: string | null;
  withholdingTaxAccountId: string;
  withholdingTaxAccountCode: string;
  withholdingTaxAccountName: string;
  amount: string;
  reference: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): WithholdingTaxReceiptRecord {
  // numeric datang sebagai STRING dari driver — Number() eksplisit.
  return { ...row, amount: Number(row.amount), status: "Applied" };
}

const selectShape = {
  id: withholdingTaxReceipts.id,
  businessId: withholdingTaxReceipts.businessId,
  date: withholdingTaxReceipts.date,
  customerId: withholdingTaxReceipts.customerId,
  customerName: contacts.name,
  salesInvoiceId: withholdingTaxReceipts.salesInvoiceId,
  salesInvoiceReference: salesInvoices.reference,
  withholdingTaxAccountId: withholdingTaxReceipts.withholdingTaxAccountId,
  withholdingTaxAccountCode: chartOfAccounts.code,
  withholdingTaxAccountName: chartOfAccounts.name,
  amount: withholdingTaxReceipts.amount,
  reference: withholdingTaxReceipts.reference,
  description: withholdingTaxReceipts.description,
  createdAt: withholdingTaxReceipts.createdAt,
  updatedAt: withholdingTaxReceipts.updatedAt,
};

// ---------------------------------------------------------------------
// Validasi (dipanggil DI DALAM transaction)
// ---------------------------------------------------------------------
async function validateReceipt(
  tx: DbOrTx,
  businessId: string,
  v: {
    customerId: string;
    salesInvoiceId: string;
    withholdingTaxAccountId: string;
    amount: number;
  },
  excludeReceiptId?: string,
): Promise<void> {
  // Lock baris faktur: serialisasi receipt paralel ke faktur yang sama.
  await tx.execute(
    sql`SELECT id FROM sales_invoices WHERE id = ${v.salesInvoiceId} FOR UPDATE`,
  );

  const info = await getSalesInvoiceAllocationInfo(
    businessId,
    v.salesInvoiceId,
    { tx, excludeReceiptId },
  );
  if (!info) {
    throw new WithholdingTaxReceiptValidationError(
      "Sales Invoice tidak ditemukan.",
    );
  }
  if (info.customerId !== v.customerId) {
    throw new WithholdingTaxReceiptValidationError(
      "Sales Invoice yang dipilih bukan milik Customer ini.",
    );
  }

  const [account] = await tx
    .select({
      category: chartOfAccounts.category,
      isControlAccount: chartOfAccounts.isControlAccount,
    })
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.businessId, businessId),
        eq(chartOfAccounts.id, v.withholdingTaxAccountId),
        isNull(chartOfAccounts.deletedAt),
      ),
    )
    .limit(1);
  if (!account) {
    throw new WithholdingTaxReceiptValidationError(
      "Akun Withholding Tax tidak ditemukan.",
    );
  }
  if (account.category !== "Asset") {
    throw new WithholdingTaxReceiptValidationError(
      "Akun Withholding Tax harus berkategori Asset.",
    );
  }
  if (account.isControlAccount) {
    throw new WithholdingTaxReceiptValidationError(
      "Akun kontrol Piutang Usaha tidak boleh dipakai sebagai akun Withholding Tax.",
    );
  }

  if (toCents(v.amount) > toCents(info.balanceDue)) {
    throw new WithholdingTaxReceiptValidationError(
      `Nominal (${v.amount}) melebihi sisa tagihan Sales Invoice saat ini (${info.balanceDue}).`,
    );
  }
}

// ---------------------------------------------------------------------
// Jurnal
// ---------------------------------------------------------------------
async function postJournal(
  tx: DbOrTx,
  input: {
    receiptId: string;
    businessId: string;
    customerId: string;
    withholdingTaxAccountId: string;
    amount: number;
    date: string;
    reference: string | null;
    description: string | null;
  },
): Promise<void> {
  const arAccount = await findArControlAccount(input.businessId, tx);
  if (!arAccount) {
    throw new Error(
      "Akun kontrol Piutang Usaha (Asset + kontrol) tidak ditemukan atau tidak tunggal di bisnis ini.",
    );
  }

  const cents = toCents(input.amount);
  const debitCents = cents;
  const creditCents = cents;
  if (debitCents !== creditCents) {
    throw new Error(
      `Jurnal tidak balance (debit ${debitCents} != kredit ${creditCents}).`,
    );
  }

  const refLabel = input.reference ?? input.receiptId.slice(0, 8);
  const [entry] = await tx
    .insert(journalEntries)
    .values({
      businessId: input.businessId,
      entryDate: input.date,
      reference: input.reference,
      sourceModule: WITHHOLDING_TAX_RECEIPT_SOURCE_MODULE,
      sourceId: input.receiptId,
      description: input.description ?? `Bukti Potong ${refLabel}`,
    })
    .returning({ id: journalEntries.id });

  await tx.insert(journalEntryLines).values([
    {
      journalEntryId: entry.id,
      accountId: input.withholdingTaxAccountId,
      contactId: input.customerId,
      debit: (debitCents / 100).toFixed(2),
      credit: "0.00",
      description: `Pajak dipotong ${refLabel}`,
    },
    {
      journalEntryId: entry.id,
      accountId: arAccount.id,
      contactId: input.customerId,
      debit: "0.00",
      credit: (creditCents / 100).toFixed(2),
      description: `Pengurangan piutang ${refLabel}`,
    },
  ]);
}

async function softDeleteJournals(tx: DbOrTx, receiptId: string): Promise<void> {
  await tx
    .update(journalEntries)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(journalEntries.sourceModule, WITHHOLDING_TAX_RECEIPT_SOURCE_MODULE),
        eq(journalEntries.sourceId, receiptId),
        isNull(journalEntries.deletedAt),
      ),
    );
}

// ---------------------------------------------------------------------
// LIST + GET
// ---------------------------------------------------------------------
function baseSelect(tx: DbOrTx) {
  return tx
    .select(selectShape)
    .from(withholdingTaxReceipts)
    .innerJoin(contacts, eq(withholdingTaxReceipts.customerId, contacts.id))
    .innerJoin(
      salesInvoices,
      eq(withholdingTaxReceipts.salesInvoiceId, salesInvoices.id),
    )
    .innerJoin(
      chartOfAccounts,
      eq(withholdingTaxReceipts.withholdingTaxAccountId, chartOfAccounts.id),
    );
}

export async function listWithholdingTaxReceipts(
  businessId: string,
  opts: WithholdingTaxReceiptListOptions,
): Promise<{ data: WithholdingTaxReceiptRecord[]; total: number }> {
  const conditions = [
    eq(withholdingTaxReceipts.businessId, businessId),
    isNull(withholdingTaxReceipts.deletedAt),
  ];
  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(withholdingTaxReceipts.reference, pattern),
        ilike(contacts.name, pattern),
      )!,
    );
  }
  const where = and(...conditions);

  const [rows, [totalRow]] = await Promise.all([
    baseSelect(db)
      .where(where)
      .orderBy(
        asc(withholdingTaxReceipts.date),
        asc(withholdingTaxReceipts.createdAt),
      )
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(withholdingTaxReceipts)
      .innerJoin(contacts, eq(withholdingTaxReceipts.customerId, contacts.id))
      .where(where),
  ]);

  return { data: rows.map(toRecord), total: totalRow?.total ?? 0 };
}

export async function getWithholdingTaxReceiptById(
  businessId: string,
  receiptId: string,
  tx: DbOrTx = db,
): Promise<WithholdingTaxReceiptRecord | null> {
  const [row] = await baseSelect(tx)
    .where(
      and(
        eq(withholdingTaxReceipts.businessId, businessId),
        eq(withholdingTaxReceipts.id, receiptId),
        isNull(withholdingTaxReceipts.deletedAt),
      ),
    )
    .limit(1);
  return row ? toRecord(row) : null;
}

// ---------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------
async function insertWithPosting(
  tx: DbOrTx,
  businessId: string,
  input: WithholdingTaxReceiptCreateInput,
): Promise<string> {
  await validateReceipt(tx, businessId, input);

  const [row] = await tx
    .insert(withholdingTaxReceipts)
    .values({
      businessId,
      date: input.date,
      customerId: input.customerId,
      salesInvoiceId: input.salesInvoiceId,
      withholdingTaxAccountId: input.withholdingTaxAccountId,
      amount: (toCents(input.amount) / 100).toFixed(2),
      reference: input.reference ?? null,
      description: input.description ?? null,
    })
    .returning({ id: withholdingTaxReceipts.id });

  await postJournal(tx, {
    receiptId: row.id,
    businessId,
    customerId: input.customerId,
    withholdingTaxAccountId: input.withholdingTaxAccountId,
    amount: input.amount,
    date: input.date,
    reference: input.reference ?? null,
    description: input.description ?? null,
  });
  return row.id;
}

export async function createWithholdingTaxReceipt(
  businessId: string,
  input: WithholdingTaxReceiptCreateInput,
): Promise<WithholdingTaxReceiptRecord> {
  const id = await db.transaction((tx) =>
    insertWithPosting(tx, businessId, input),
  );
  const created = await getWithholdingTaxReceiptById(businessId, id);
  if (!created) throw new Error("Gagal mengambil bukti potong setelah create.");
  return created;
}

// ---------------------------------------------------------------------
// UPDATE — validasi ulang + repost jurnal (exclude alokasi lama sendiri)
// ---------------------------------------------------------------------
export async function updateWithholdingTaxReceipt(
  businessId: string,
  receiptId: string,
  input: WithholdingTaxReceiptUpdateInput,
): Promise<WithholdingTaxReceiptRecord | null> {
  const existing = await getWithholdingTaxReceiptById(businessId, receiptId);
  if (!existing) return null;

  const next = {
    date: input.date ?? existing.date,
    customerId: input.customerId ?? existing.customerId,
    salesInvoiceId: input.salesInvoiceId ?? existing.salesInvoiceId,
    withholdingTaxAccountId:
      input.withholdingTaxAccountId ?? existing.withholdingTaxAccountId,
    amount: input.amount ?? existing.amount,
    reference:
      input.reference !== undefined ? input.reference : existing.reference,
    description:
      input.description !== undefined ? input.description : existing.description,
  };

  await db.transaction(async (tx) => {
    // Pastikan masih aktif di dalam transaction (hindari balapan dengan delete).
    const current = await getWithholdingTaxReceiptById(
      businessId,
      receiptId,
      tx,
    );
    if (!current) {
      throw new WithholdingTaxReceiptValidationError(
        "Bukti potong sudah tidak aktif.",
      );
    }

    await validateReceipt(tx, businessId, next, receiptId);

    await tx
      .update(withholdingTaxReceipts)
      .set({
        date: next.date,
        customerId: next.customerId,
        salesInvoiceId: next.salesInvoiceId,
        withholdingTaxAccountId: next.withholdingTaxAccountId,
        amount: (toCents(next.amount) / 100).toFixed(2),
        reference: next.reference,
        description: next.description,
        updatedAt: new Date(),
      })
      .where(eq(withholdingTaxReceipts.id, receiptId));

    // Semua field penentu isi jurnal (invoice/akun/customer/amount, plus
    // tanggal/reference/description untuk header jurnal) -> selalu repost.
    await softDeleteJournals(tx, receiptId);
    await postJournal(tx, {
      receiptId,
      businessId,
      customerId: next.customerId,
      withholdingTaxAccountId: next.withholdingTaxAccountId,
      amount: next.amount,
      date: next.date,
      reference: next.reference,
      description: next.description,
    });
  });

  return getWithholdingTaxReceiptById(businessId, receiptId);
}

// ---------------------------------------------------------------------
// COPY — duplikat (date = hari ini), TETAP tervalidasi ulang
// ---------------------------------------------------------------------
export async function copyWithholdingTaxReceipt(
  businessId: string,
  receiptId: string,
): Promise<WithholdingTaxReceiptRecord | null> {
  const existing = await getWithholdingTaxReceiptById(businessId, receiptId);
  if (!existing) return null;

  const id = await db.transaction((tx) =>
    insertWithPosting(tx, businessId, {
      date: todayString(),
      customerId: existing.customerId,
      salesInvoiceId: existing.salesInvoiceId,
      withholdingTaxAccountId: existing.withholdingTaxAccountId,
      amount: existing.amount,
      reference: existing.reference,
      description: existing.description,
    }),
  );
  return getWithholdingTaxReceiptById(businessId, id);
}

// ---------------------------------------------------------------------
// DELETE — soft-delete record + jurnal, bebas tanpa lock
// ---------------------------------------------------------------------
export async function softDeleteWithholdingTaxReceipt(
  businessId: string,
  receiptId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(withholdingTaxReceipts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(withholdingTaxReceipts.businessId, businessId),
          eq(withholdingTaxReceipts.id, receiptId),
          isNull(withholdingTaxReceipts.deletedAt),
        ),
      )
      .returning({ id: withholdingTaxReceipts.id });
    if (!updated) return false;

    await softDeleteJournals(tx, receiptId);
    return true;
  });
}
