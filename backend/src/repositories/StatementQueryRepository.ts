/**
 * StatementQueryRepository — Customer/Supplier Statements (Report §12, Tahap 2b).
 *
 * POLA BERBEDA dari keluarga Totals: parameter-only, TANPA definisi
 * tersimpan (`report_definitions` tidak disentuh), READ-ONLY total —
 * tidak posting jurnal, tidak menulis audit.
 *
 * Saldo faktur MEMAKAI ULANG `invoiceAllocationsSql` dari
 * ReportQueryRepository — rumus yang sama persis dengan Aged
 * Receivables/Payables. TIDAK ada rumus saldo baru di sini.
 *
 * Prasyarat yang sudah diverifikasi langsung ke Neon (bukan asumsi):
 *   - sales_invoices.due_date & purchase_invoices.due_date ADA (nullable),
 *     jadi "overdue" dihitung harian: GREATEST(0, asOf - due_date).
 *     due_date NULL = belum jatuh tempo (bucket Current), sama seperti Aged.
 *   - Link kontak: sales_invoices.customer_id, purchase_invoices.supplier_id,
 *     receipts.contact_id (nullable), payments.contact_id,
 *     credit_notes.customer_id, debit_notes.supplier_id,
 *     late_payment_fees.customer_id.
 *   - sales_invoices TIDAK punya order_number (hanya purchase_invoices) ->
 *     kolom Order number hanya terisi di sisi supplier, dicatat sebagai
 *     keterbatasan, bukan dikarang.
 *   - late_payment_fees TIDAK punya reference/description.
 */
import { sql } from "drizzle-orm";
import db from "../db/index.js";
import { centsToAmount, invoiceAllocationsSql } from "./ReportQueryRepository.js";
import { isSupplierStatement, isUnpaidStatement, type StatementType } from "../schemas/Statement.js";

export interface StatementContactRow {
  contactId: string;
  name: string;
  transactionCount: number;
  amount: number;
}

export interface StatementDetailRow {
  kind: "invoice" | "transaction";
  date: string;
  invoiceId?: string;
  orderNumber?: string | null;
  reference?: string;
  invoiceTotal?: number;
  overdueDays?: number;
  balanceDue?: number;
  description?: string;
  sourceModule?: string;
  debit?: number;
  credit?: number;
  runningBalance?: number;
}

export interface StatementBuckets {
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  daysOver90: number;
  total: number;
}

export interface StatementContact {
  id: string;
  name: string;
  email: string | null;
  billingAddress: string | null;
}

export interface StatementListResult {
  type: StatementType;
  headerDate: string;
  rows: StatementContactRow[];
  /** Jumlah kontak yang cocok (untuk pagination), bukan jumlah baris di halaman ini. */
  total: number;
  totals: { label: string; value: number }[];
}

export interface StatementDetailResult {
  type: StatementType;
  headerDate: string;
  contact: StatementContact;
  rows: StatementDetailRow[];
  buckets: StatementBuckets | null;
  totals: { label: string; value: number }[];
}

type ListParams = {
  asOfDate?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page: number;
  pageSize: number;
  q?: string | null;
};

type DetailParams = {
  asOfDate?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

/** CTE faktur yang masih terutang — rumus identik dengan Aged (lihat doc atas). */
function unpaidCte(businessId: string, payable: boolean, asOfDate: string) {
  const headers = sql.identifier(payable ? "purchase_invoices" : "sales_invoices");
  const lines = sql.identifier(payable ? "purchase_invoice_lines" : "sales_invoice_lines");
  const invoiceKey = sql.identifier(payable ? "purchase_invoice_id" : "sales_invoice_id");
  const contactKey = payable ? sql`i.supplier_id` : sql`i.customer_id`;
  const lineAmount = payable ? sql`l.subtotal` : sql`l.line_total`;
  const roleFlag = payable ? sql`c.is_supplier` : sql`c.is_customer`;
  // Order number hanya ada di purchase_invoices (diverifikasi ke Neon).
  const orderNumber = payable ? sql`NULLIF(i.order_number,'')` : sql`NULL::text`;
  return sql`
    invoice_totals AS (
      SELECT l.${invoiceKey} AS invoice_id, SUM((${lineAmount}*100)::bigint) AS amount
      FROM ${lines} l JOIN ${headers} i ON i.id=l.${invoiceKey}
      WHERE i.business_id=${businessId} AND i.deleted_at IS NULL AND i.issue_date<=${asOfDate}::date
      GROUP BY l.${invoiceKey}
    ), allocations AS (
      ${invoiceAllocationsSql(businessId, payable)}
    ), unpaid AS (
      SELECT i.id AS invoice_id, ${contactKey} AS contact_id, c.name AS contact_name,
        i.issue_date AS date, ${orderNumber} AS order_number,
        COALESCE(NULLIF(i.reference,''),'-') AS reference, i.description AS description,
        t.amount AS invoice_total, t.amount-COALESCE(a.paid,0) AS balance,
        CASE WHEN i.due_date IS NULL THEN 0
          ELSE GREATEST(0, ${asOfDate}::date-i.due_date) END AS overdue_days,
        CASE WHEN i.due_date IS NULL OR i.due_date>=${asOfDate}::date THEN 0
          WHEN ${asOfDate}::date-i.due_date<=30 THEN 1 WHEN ${asOfDate}::date-i.due_date<=60 THEN 2
          WHEN ${asOfDate}::date-i.due_date<=90 THEN 3 ELSE 4 END AS bucket
      FROM ${headers} i
      JOIN invoice_totals t ON t.invoice_id=i.id
      JOIN contacts c ON c.id=${contactKey} AND c.business_id=i.business_id AND c.deleted_at IS NULL
      LEFT JOIN allocations a ON a.invoice_id=i.id
      WHERE i.business_id=${businessId} AND i.deleted_at IS NULL AND i.issue_date<=${asOfDate}::date
        AND t.amount-COALESCE(a.paid,0)>0 AND ${roleFlag}
    )
  `;
}

/**
 * CTE gerakan per kontak (Report §12.3). HANYA sumber yang punya link kontak:
 * Customer -> invoice & late fee = Debit, credit note & receipt = Credit.
 * Supplier -> purchase invoice = Credit, payment & debit note = Debit.
 * Sumber yang tidak ter-link kontak (mis. receipt tanpa contact_id) TIDAK
 * dikarang; barisnya memang tidak muncul.
 */
function movementsCte(
  businessId: string,
  payable: boolean,
  dateFrom: string,
  dateTo: string,
) {
  const roleFlag = payable ? sql`c.is_supplier` : sql`c.is_customer`;
  const union = payable ? sql`
    SELECT i.supplier_id AS contact_id, i.issue_date AS date, 'purchase_invoice' AS source_module,
      1 AS source_order, i.id AS doc_id,
      COALESCE(NULLIF(CONCAT_WS(' — ',NULLIF(i.description,''),NULLIF(i.reference,'')),''),'Purchase Invoice') AS description,
      0::bigint AS debit, SUM((l.subtotal*100)::bigint) AS credit
    FROM purchase_invoices i JOIN purchase_invoice_lines l ON l.purchase_invoice_id=i.id
    WHERE i.business_id=${businessId} AND i.deleted_at IS NULL AND i.issue_date BETWEEN ${dateFrom}::date AND ${dateTo}::date
    GROUP BY i.id
    UNION ALL
    SELECT n.supplier_id, n.date, 'debit_note', 2, n.id,
      COALESCE(NULLIF(CONCAT_WS(' — ',NULLIF(n.description,''),NULLIF(n.debit_note_number,'')),''),'Debit Note'),
      SUM((l.line_total*100)::bigint), 0::bigint
    FROM debit_notes n JOIN debit_note_lines l ON l.debit_note_id=n.id
    WHERE n.business_id=${businessId} AND n.deleted_at IS NULL AND n.date BETWEEN ${dateFrom}::date AND ${dateTo}::date
    GROUP BY n.id
    UNION ALL
    SELECT p.contact_id, p.date, 'payment', 3, p.id,
      COALESCE(NULLIF(CONCAT_WS(' — ',NULLIF(p.description,''),NULLIF(p.reference,'')),''),'Payment'),
      SUM((l.amount*100)::bigint), 0::bigint
    FROM payments p JOIN payment_lines l ON l.payment_id=p.id
    WHERE p.business_id=${businessId} AND p.deleted_at IS NULL AND p.date BETWEEN ${dateFrom}::date AND ${dateTo}::date
    GROUP BY p.id
  ` : sql`
    SELECT i.customer_id AS contact_id, i.issue_date AS date, 'sales_invoice' AS source_module,
      1 AS source_order, i.id AS doc_id,
      COALESCE(NULLIF(CONCAT_WS(' — ',NULLIF(i.description,''),NULLIF(i.reference,'')),''),'Sales Invoice') AS description,
      SUM((l.line_total*100)::bigint) AS debit, 0::bigint AS credit
    FROM sales_invoices i JOIN sales_invoice_lines l ON l.sales_invoice_id=i.id
    WHERE i.business_id=${businessId} AND i.deleted_at IS NULL AND i.issue_date BETWEEN ${dateFrom}::date AND ${dateTo}::date
    GROUP BY i.id
    UNION ALL
    SELECT f.customer_id, f.date, 'late_payment_fee', 2, f.id, 'Late Payment Fee',
      (f.amount*100)::bigint, 0::bigint
    FROM late_payment_fees f
    WHERE f.business_id=${businessId} AND f.deleted_at IS NULL AND f.date BETWEEN ${dateFrom}::date AND ${dateTo}::date
    UNION ALL
    SELECT n.customer_id, n.issue_date, 'credit_note', 3, n.id,
      COALESCE(NULLIF(CONCAT_WS(' — ',NULLIF(n.description,''),NULLIF(n.reference,'')),''),'Credit Note'),
      0::bigint, SUM((l.line_total*100)::bigint)
    FROM credit_notes n JOIN credit_note_lines l ON l.credit_note_id=n.id
    WHERE n.business_id=${businessId} AND n.deleted_at IS NULL AND n.issue_date BETWEEN ${dateFrom}::date AND ${dateTo}::date
    GROUP BY n.id
    UNION ALL
    SELECT r.contact_id, r.date, 'receipt', 4, r.id,
      COALESCE(NULLIF(CONCAT_WS(' — ',NULLIF(r.description,''),NULLIF(r.reference,'')),''),'Receipt'),
      0::bigint, SUM((l.amount*100)::bigint)
    FROM receipts r JOIN receipt_lines l ON l.receipt_id=r.id
    WHERE r.business_id=${businessId} AND r.deleted_at IS NULL AND r.contact_id IS NOT NULL
      AND r.date BETWEEN ${dateFrom}::date AND ${dateTo}::date
    GROUP BY r.id
  `;
  return sql`
    movements AS (
      SELECT m.*, c.name AS contact_name FROM (${union}) m
      JOIN contacts c ON c.id=m.contact_id AND c.business_id=${businessId} AND c.deleted_at IS NULL AND ${roleFlag}
    )
  `;
}

export function statementHeaderDate(type: StatementType, params: DetailParams): string {
  if (isUnpaidStatement(type)) return String(params.asOfDate);
  return `${params.dateFrom} — ${params.dateTo}`;
}

/** Kontak harus ada, milik bisnis ini, belum dihapus, dan berperan sesuai sisi statement. */
export async function findStatementContact(
  businessId: string,
  payable: boolean,
  contactId: string,
): Promise<StatementContact | null> {
  const result = await db.execute(sql`
    SELECT id::text, name, email, billing_address
    FROM contacts
    WHERE id=${contactId}::uuid AND business_id=${businessId} AND deleted_at IS NULL
      AND ${payable ? sql`is_supplier` : sql`is_customer`}
  `);
  const row = (result.rows as Record<string, unknown>[])[0];
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    email: row.email === null || row.email === undefined ? null : String(row.email),
    billingAddress:
      row.billing_address === null || row.billing_address === undefined
        ? null
        : String(row.billing_address),
  };
}

export async function listStatements(
  businessId: string,
  type: StatementType,
  params: ListParams,
): Promise<StatementListResult> {
  const payable = isSupplierStatement(type);
  const q = params.q ?? null;
  const offset = (params.page - 1) * params.pageSize;
  const headerDate = statementHeaderDate(type, params);

  if (isUnpaidStatement(type)) {
    const asOf = String(params.asOfDate);
    const cte = unpaidCte(businessId, payable, asOf);
    const page = await db.execute(sql`
      WITH ${cte}
      SELECT contact_id::text, contact_name, COUNT(*)::int AS tx_count, SUM(balance) AS amount
      FROM unpaid
      WHERE (${q}::text IS NULL OR LOWER(contact_name) LIKE '%'||LOWER(${q}::text)||'%')
      GROUP BY contact_id, contact_name
      ORDER BY LOWER(contact_name), contact_id
      LIMIT ${params.pageSize} OFFSET ${offset}
    `);
    const agg = await db.execute(sql`
      WITH ${cte}
      SELECT COUNT(DISTINCT contact_id)::int AS contacts, COALESCE(SUM(balance),0) AS amount
      FROM unpaid
      WHERE (${q}::text IS NULL OR LOWER(contact_name) LIKE '%'||LOWER(${q}::text)||'%')
    `);
    const aggRow = (agg.rows as Record<string, unknown>[])[0];
    return {
      type,
      headerDate,
      rows: (page.rows as Record<string, unknown>[]).map((r): StatementContactRow => ({
        contactId: String(r.contact_id),
        name: String(r.contact_name),
        transactionCount: Number(r.tx_count),
        amount: centsToAmount(r.amount),
      })),
      total: Number(aggRow?.contacts ?? 0),
      totals: [{ label: "Total", value: centsToAmount(aggRow?.amount ?? 0) }],
    };
  }

  const from = String(params.dateFrom);
  const to = String(params.dateTo);
  const cte = movementsCte(businessId, payable, from, to);
  const page = await db.execute(sql`
    WITH ${cte}
    SELECT contact_id::text, contact_name, COUNT(*)::int AS tx_count, SUM(debit-credit) AS amount
    FROM movements
    WHERE (${q}::text IS NULL OR LOWER(contact_name) LIKE '%'||LOWER(${q}::text)||'%')
    GROUP BY contact_id, contact_name
    ORDER BY LOWER(contact_name), contact_id
    LIMIT ${params.pageSize} OFFSET ${offset}
  `);
  const agg = await db.execute(sql`
    WITH ${cte}
    SELECT COUNT(DISTINCT contact_id)::int AS contacts, COALESCE(SUM(debit-credit),0) AS amount
    FROM movements
    WHERE (${q}::text IS NULL OR LOWER(contact_name) LIKE '%'||LOWER(${q}::text)||'%')
  `);
  const aggRow = (agg.rows as Record<string, unknown>[])[0];
  return {
    type,
    headerDate,
    rows: (page.rows as Record<string, unknown>[]).map((r): StatementContactRow => ({
      contactId: String(r.contact_id),
      name: String(r.contact_name),
      transactionCount: Number(r.tx_count),
      amount: centsToAmount(r.amount),
    })),
    total: Number(aggRow?.contacts ?? 0),
    totals: [{ label: "Total", value: centsToAmount(aggRow?.amount ?? 0) }],
  };
}

export async function getStatementDetail(
  businessId: string,
  type: StatementType,
  contact: StatementContact,
  params: DetailParams,
): Promise<StatementDetailResult> {
  const payable = isSupplierStatement(type);
  const headerDate = statementHeaderDate(type, params);

  if (isUnpaidStatement(type)) {
    const asOf = String(params.asOfDate);
    const cte = unpaidCte(businessId, payable, asOf);
    const rows = await db.execute(sql`
      WITH ${cte}
      SELECT invoice_id::text, date::text, order_number, reference, description,
        invoice_total, overdue_days, balance, bucket
      FROM unpaid WHERE contact_id=${contact.id}::uuid
      ORDER BY date, invoice_id
    `);
    const agg = await db.execute(sql`
      WITH ${cte}
      SELECT COALESCE(SUM(balance) FILTER (WHERE bucket=0),0) AS current,
        COALESCE(SUM(balance) FILTER (WHERE bucket=1),0) AS d1,
        COALESCE(SUM(balance) FILTER (WHERE bucket=2),0) AS d31,
        COALESCE(SUM(balance) FILTER (WHERE bucket=3),0) AS d61,
        COALESCE(SUM(balance) FILTER (WHERE bucket=4),0) AS d90,
        COALESCE(SUM(balance),0) AS total
      FROM unpaid WHERE contact_id=${contact.id}::uuid
    `);
    const a = (agg.rows as Record<string, unknown>[])[0];
    const buckets: StatementBuckets = {
      current: centsToAmount(a?.current ?? 0),
      days1To30: centsToAmount(a?.d1 ?? 0),
      days31To60: centsToAmount(a?.d31 ?? 0),
      days61To90: centsToAmount(a?.d61 ?? 0),
      daysOver90: centsToAmount(a?.d90 ?? 0),
      total: centsToAmount(a?.total ?? 0),
    };
    return {
      type,
      headerDate,
      contact,
      rows: (rows.rows as Record<string, unknown>[]).map((r): StatementDetailRow => ({
        kind: "invoice",
        date: String(r.date),
        invoiceId: String(r.invoice_id),
        orderNumber: r.order_number === null || r.order_number === undefined ? null : String(r.order_number),
        reference: String(r.reference),
        invoiceTotal: centsToAmount(r.invoice_total),
        overdueDays: Number(r.overdue_days),
        balanceDue: centsToAmount(r.balance),
      })),
      buckets,
      totals: [{ label: "Total", value: buckets.total }],
    };
  }

  const from = String(params.dateFrom);
  const to = String(params.dateTo);
  const cte = movementsCte(businessId, payable, from, to);
  const rows = await db.execute(sql`
    WITH ${cte}, running AS (
      SELECT m.*, SUM(m.debit-m.credit) OVER (
        PARTITION BY m.contact_id ORDER BY m.date, m.source_order, m.doc_id ROWS UNBOUNDED PRECEDING
      ) AS running_balance
      FROM movements m WHERE m.contact_id=${contact.id}::uuid
    )
    SELECT date::text, description, source_module, debit, credit, running_balance
    FROM running ORDER BY date, source_order, doc_id
  `);
  const agg = await db.execute(sql`
    WITH ${cte}
    SELECT COALESCE(SUM(debit),0) AS total_debit, COALESCE(SUM(credit),0) AS total_credit
    FROM movements WHERE contact_id=${contact.id}::uuid
  `);
  const a = (agg.rows as Record<string, unknown>[])[0];
  const totalDebit = centsToAmount(a?.total_debit ?? 0);
  const totalCredit = centsToAmount(a?.total_credit ?? 0);
  return {
    type,
    headerDate,
    contact,
    rows: (rows.rows as Record<string, unknown>[]).map((r): StatementDetailRow => ({
      kind: "transaction",
      date: String(r.date),
      description: String(r.description),
      sourceModule: String(r.source_module),
      debit: centsToAmount(r.debit),
      credit: centsToAmount(r.credit),
      runningBalance: centsToAmount(r.running_balance),
    })),
    buckets: null,
    totals: [
      { label: "debits", value: totalDebit },
      { label: "credits", value: totalCredit },
      { label: "closing", value: totalDebit - totalCredit },
    ],
  };
}
