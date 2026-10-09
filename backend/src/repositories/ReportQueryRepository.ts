/**
 * ReportQueryRepository — menghitung isi laporan Trial Balance, Profit and
 * Loss, dan Balance Sheet LANGSUNG dari journal_entries/journal_entry_lines
 * (sumber yang sama dengan modul posting; hanya baris dokumen aktif).
 *
 * Sisi saldo mengikuti normal balance kategori: Asset & Expense = debit;
 * Liability, Equity, Revenue = kredit. Semua agregasi di SQL (FILTER),
 * bukan loop JS. numeric(18,2) dari driver adalah STRING -> Number() eksplisit.
 */
import { sql } from "drizzle-orm";
import db from "../db/index.js";

export interface ReportRow {
  accountId: string | null;
  code: string | null;
  name: string;
  groupName: string | null;
  debit: number | null;
  credit: number | null;
  amount: number | null;
  kind?: "section" | "account" | "transaction" | "profit" | "customer" | "supplier" | "invoice" | "total" | "receipt" | "payment" | "summary";
  supplierId?: string;
  invoices?: number;
  creditNotes?: number;
  lateFees?: number;
  payments?: number;
  opening?: number;
  movement?: number;
  closing?: number;
  date?: string | null;
  label?: string;
  balance?: number;
  current?: number;
  days1To30?: number;
  days31To60?: number;
  days61To90?: number;
  daysOver90?: number;
  customerId?: string;
  invoiceId?: string;
}

// SQL sums/window functions operate on integer cents. Convert only at the API boundary.
function centsToAmount(value: unknown): number {
  const cents = Number(value);
  if (!Number.isSafeInteger(cents)) throw new Error("Report amount exceeds safe integer cents");
  return cents / 100;
}
function emptyRow(name: string): ReportRow {
  return { accountId: null, code: null, name, groupName: null, debit: null, credit: null, amount: null };
}

export async function computeGeneralLedgerSummary(
  businessId: string, title: string, dateFrom: string, dateTo: string, excludeZeroBalances: boolean,
): Promise<ReportResult> {
  const result = await db.execute(sql`
    WITH ledger AS (
      SELECT l.account_id, e.entry_date, (l.debit * 100)::bigint AS dr, (l.credit * 100)::bigint AS cr
      FROM journal_entry_lines l JOIN journal_entries e ON e.id=l.journal_entry_id
      WHERE e.business_id=${businessId} AND e.deleted_at IS NULL AND e.entry_date<=${dateTo}::date
    ), balances AS (
      SELECT a.id, a.code, a.name, a.category,
        COALESCE(SUM(l.dr-l.cr) FILTER (WHERE l.entry_date<${dateFrom}::date),0) AS opening,
        COALESCE(SUM(l.dr) FILTER (WHERE l.entry_date>=${dateFrom}::date),0) AS debit,
        COALESCE(SUM(l.cr) FILTER (WHERE l.entry_date>=${dateFrom}::date),0) AS credit
      FROM chart_of_accounts a LEFT JOIN ledger l ON l.account_id=a.id
      WHERE a.business_id=${businessId} AND a.deleted_at IS NULL
      GROUP BY a.id
    ), rows AS (
      SELECT id::text AS account_id, name, category, code, opening, debit, credit,
        debit-credit AS movement, opening+debit-credit AS closing, 'account' AS kind FROM balances
      WHERE NOT ${excludeZeroBalances} OR opening+debit-credit<>0
      UNION ALL
      SELECT NULL, 'Profit (loss) for the period', NULL, NULL, 0, NULL, NULL,
        COALESCE(SUM(debit-credit),0), COALESCE(SUM(debit-credit),0), 'profit'
      FROM balances WHERE category IN ('Revenue','Expense')
    ) SELECT * FROM rows ORDER BY CASE category WHEN 'Asset' THEN 1 WHEN 'Liability' THEN 2
      WHEN 'Equity' THEN 3 WHEN 'Revenue' THEN 4 WHEN 'Expense' THEN 5 ELSE 6 END, code, name
  `);
  const rows = (result.rows as Record<string, unknown>[]).map((r): ReportRow => ({
    ...emptyRow(String(r.name)), accountId: r.account_id as string | null,
    groupName: r.category as string | null, kind: r.kind as "account" | "profit",
    opening: centsToAmount(r.opening), debit: r.debit === null ? null : centsToAmount(r.debit),
    credit: r.credit === null ? null : centsToAmount(r.credit), movement: centsToAmount(r.movement),
    closing: centsToAmount(r.closing),
  }));
  return { type: "general_ledger_summary", title, headerDate: `${dateFrom} — ${dateTo}`, footer: null,
    rows, totals: [], netProfit: -(rows.find(r => r.kind === "profit")?.movement ?? 0) };
}

export async function computeGeneralLedgerTransactions(
  businessId: string, title: string, dateFrom: string, dateTo: string, accountId: string | null,
): Promise<ReportResult> {
  const result = await db.execute(sql`
    WITH ledger AS (
      SELECT a.id AS account_id, a.name, a.code, a.category, e.entry_date, e.id AS entry_id,
        l.id AS line_id, (l.debit*100)::bigint AS dr, (l.credit*100)::bigint AS cr,
        COALESCE(NULLIF(CONCAT_WS(' / ',NULLIF(e.reference,''),NULLIF(c.name,''),
          COALESCE(NULLIF(l.description,''),NULLIF(e.description,''))),''),'-') AS label
      FROM journal_entry_lines l JOIN journal_entries e ON e.id=l.journal_entry_id
      JOIN chart_of_accounts a ON a.id=l.account_id AND a.business_id=e.business_id
      LEFT JOIN contacts c ON c.id=l.contact_id AND c.business_id=e.business_id
      WHERE e.business_id=${businessId} AND e.deleted_at IS NULL AND e.entry_date<=${dateTo}::date
    ), profit AS (
      SELECT COALESCE(SUM(cr-dr) FILTER (WHERE entry_date<${dateFrom}::date),0) AS opening,
        COALESCE(SUM(cr-dr) FILTER (WHERE entry_date>=${dateFrom}::date),0) AS period
      FROM ledger WHERE category IN ('Revenue','Expense')
    ), retained AS (
      SELECT id,name,code FROM chart_of_accounts WHERE business_id=${businessId} AND category='Equity'
        AND deleted_at IS NULL AND LOWER(TRIM(name)) IN ('retained earnings','laba ditahan') ORDER BY code,id LIMIT 1
    ), account_openings AS (
      SELECT account_id, COALESCE(SUM(dr-cr) FILTER (WHERE entry_date<${dateFrom}::date),0) AS opening
      FROM ledger GROUP BY account_id
    ), movements AS (
      SELECT account_id::text, name, code, category, entry_date, entry_id::text, line_id::text, dr, cr, label,
        'transaction' AS kind, 0 AS sort_order FROM ledger WHERE entry_date>=${dateFrom}::date
      UNION ALL
      SELECT COALESCE(r.id::text,'retained-earnings'), COALESCE(r.name,'Retained earnings'),r.code,'Equity',
        ${dateTo}::date, '', 'profit', GREATEST(-p.period,0),GREATEST(p.period,0),
        'Profit (loss) for the period','profit',1 FROM profit p LEFT JOIN retained r ON true
      WHERE p.period<>0 OR EXISTS (
        SELECT 1 FROM ledger WHERE account_id=r.id AND entry_date>=${dateFrom}::date
      )
    ), running AS (
      SELECT m.*, COALESCE(o.opening,0) - CASE WHEN m.account_id=COALESCE(r.id::text,'retained-earnings') THEN p.opening ELSE 0 END AS opening,
        COALESCE(o.opening,0) - CASE WHEN m.account_id=COALESCE(r.id::text,'retained-earnings') THEN p.opening ELSE 0 END
        + SUM(m.dr-m.cr) OVER (PARTITION BY m.account_id ORDER BY entry_date,sort_order,entry_id,line_id ROWS UNBOUNDED PRECEDING) AS balance
      FROM movements m LEFT JOIN account_openings o ON o.account_id::text=m.account_id
      CROSS JOIN profit p LEFT JOIN retained r ON true
    ) SELECT *,entry_date::text AS date FROM running
      WHERE ${accountId}::uuid IS NULL OR account_id=${accountId}::text
      ORDER BY code NULLS LAST,account_id,entry_date,sort_order,entry_id,line_id
  `);
  const rows = (result.rows as Record<string, unknown>[]).map((r): ReportRow => ({
    ...emptyRow(String(r.name)), accountId: String(r.account_id), groupName: String(r.category),
    date: String(r.date), label: String(r.label), kind: r.kind as "transaction" | "profit",
    debit: centsToAmount(r.dr), credit: centsToAmount(r.cr), opening: centsToAmount(r.opening), balance: centsToAmount(r.balance),
  }));
  return { type: "general_ledger_transactions", title, headerDate: `${dateFrom} — ${dateTo}`,
    footer: null, rows, totals: [], netProfit: null };
}

export async function computeAgedReceivables(
  businessId: string, title: string, asOfDate: string, sortBy: string, showInvoices: boolean,
): Promise<ReportResult> {
  return computeAgeing(businessId, title, asOfDate, sortBy, showInvoices, false);
}

export async function computeAgedPayables(
  businessId: string, title: string, asOfDate: string, sortBy: string, showInvoices: boolean,
): Promise<ReportResult> {
  return computeAgeing(businessId, title, asOfDate, sortBy, showInvoices, true);
}

async function computeAgeing(
  businessId: string, title: string, asOfDate: string, sortBy: string, showInvoices: boolean, payable: boolean,
): Promise<ReportResult> {
  // Fixed SQL fragments only; mirror each invoice repository's live allocation calculation.
  const headers = sql.identifier(payable ? "purchase_invoices" : "sales_invoices");
  const lines = sql.identifier(payable ? "purchase_invoice_lines" : "sales_invoice_lines");
  const invoiceKey = sql.identifier(payable ? "purchase_invoice_id" : "sales_invoice_id");
  const contactKey = payable ? sql`i.supplier_id` : sql`i.customer_id`;
  const lineAmount = payable ? sql`l.subtotal` : sql`l.line_total`;
  const allocations = payable ? sql`
    SELECT l.purchase_invoice_id AS invoice_id,SUM((l.amount*100)::bigint) AS paid
    FROM payment_lines l JOIN payments p ON p.id=l.payment_id
    WHERE p.business_id=${businessId} AND p.deleted_at IS NULL GROUP BY l.purchase_invoice_id
  ` : sql`
    SELECT sales_invoice_id AS invoice_id,SUM((amount*100)::bigint) AS paid FROM withholding_tax_receipts
    WHERE business_id=${businessId} AND deleted_at IS NULL GROUP BY sales_invoice_id
  `;
  const result = await db.execute(sql`
    WITH invoice_totals AS (
      SELECT l.${invoiceKey} AS invoice_id, SUM((${lineAmount}*100)::bigint) AS amount
      FROM ${lines} l JOIN ${headers} i ON i.id=l.${invoiceKey}
      WHERE i.business_id=${businessId} AND i.deleted_at IS NULL AND i.issue_date<=${asOfDate}::date
      GROUP BY l.${invoiceKey}
    ), allocations AS (
      ${allocations}
    ), invoices AS (
      SELECT i.id,${contactKey} AS customer_id,c.name,i.reference,i.issue_date, t.amount-COALESCE(a.paid,0) AS balance,
        CASE WHEN i.due_date IS NULL OR i.due_date>=${asOfDate}::date THEN 0
          WHEN ${asOfDate}::date-i.due_date<=30 THEN 1 WHEN ${asOfDate}::date-i.due_date<=60 THEN 2
          WHEN ${asOfDate}::date-i.due_date<=90 THEN 3 ELSE 4 END AS bucket
      FROM ${headers} i JOIN invoice_totals t ON t.invoice_id=i.id
      JOIN contacts c ON c.id=${contactKey} AND c.business_id=i.business_id AND c.deleted_at IS NULL
      LEFT JOIN allocations a ON a.invoice_id=i.id
      WHERE i.business_id=${businessId} AND i.deleted_at IS NULL AND i.issue_date<=${asOfDate}::date
        AND t.amount-COALESCE(a.paid,0)>0
    ), buckets AS (
      SELECT *, CASE WHEN bucket=0 THEN balance ELSE 0 END AS current,
        CASE WHEN bucket=1 THEN balance ELSE 0 END AS days1,
        CASE WHEN bucket=2 THEN balance ELSE 0 END AS days31,
        CASE WHEN bucket=3 THEN balance ELSE 0 END AS days61,
        CASE WHEN bucket=4 THEN balance ELSE 0 END AS days90 FROM invoices
    ), customers AS (
      SELECT customer_id,name,SUM(balance) AS total,SUM(current) AS current,SUM(days1) AS days1,
        SUM(days31) AS days31,SUM(days61) AS days61,SUM(days90) AS days90 FROM buckets GROUP BY customer_id,name
    ), rows AS (
      SELECT customer_id::text, NULL::text AS invoice_id,name,NULL::text AS date,current,days1,days31,days61,days90,total,
        'customer' AS kind,0 AS detail_order FROM customers
      UNION ALL SELECT customer_id::text,id::text,COALESCE(NULLIF(reference,''),'-'),issue_date::text,current,days1,days31,days61,days90,balance,'invoice',1
        FROM buckets WHERE ${showInvoices}
      UNION ALL SELECT NULL,NULL,'Total',NULL,COALESCE(SUM(current),0),COALESCE(SUM(days1),0),COALESCE(SUM(days31),0),
        COALESCE(SUM(days61),0),COALESCE(SUM(days90),0),COALESCE(SUM(total),0),'total',2 FROM customers
    ) SELECT rows.* FROM rows LEFT JOIN customers c ON c.customer_id::text=rows.customer_id
      ORDER BY CASE WHEN rows.kind='total' THEN 1 ELSE 0 END,
        CASE WHEN ${sortBy}='total' THEN c.total END DESC,
        LOWER(c.name),c.customer_id,detail_order,rows.date,rows.invoice_id
  `);
  const rows = (result.rows as Record<string, unknown>[]).map((r): ReportRow => ({
    ...emptyRow(String(r.name)), kind: payable && r.kind === "customer" ? "supplier" : r.kind as "customer" | "invoice" | "total",
    ...(payable ? { supplierId: r.customer_id ? String(r.customer_id) : undefined }
      : { customerId: r.customer_id ? String(r.customer_id) : undefined }),
    invoiceId: r.invoice_id ? String(r.invoice_id) : undefined, date: r.date as string | null,
    current: centsToAmount(r.current), days1To30: centsToAmount(r.days1), days31To60: centsToAmount(r.days31),
    days61To90: centsToAmount(r.days61), daysOver90: centsToAmount(r.days90), amount: centsToAmount(r.total),
  }));
  return { type: payable ? "aged_payables" : "aged_receivables", title, headerDate: `As at ${asOfDate}`, footer: null, rows,
    totals: [{ label: "Total", value: rows.find(r => r.kind === "total")?.amount ?? 0 }], netProfit: null };
}

/** Document movements mandated by Report.md §9.3, dated from verified Neon columns.
 * Opening includes the same document types strictly before From (never live minus only this period).
 * WTR, debit notes and manual journals are outside this summary's specified columns/formula.
 */
export async function computeContactSummary(
  businessId: string, title: string, dateFrom: string, dateTo: string, supplier: boolean,
): Promise<ReportResult> {
  const movements = supplier ? sql`
    SELECT i.supplier_id AS contact_id,i.issue_date AS date,SUM((l.subtotal*100)::bigint) AS invoices,
      0::bigint AS credits,0::bigint AS fees,0::bigint AS payments
    FROM purchase_invoices i JOIN purchase_invoice_lines l ON l.purchase_invoice_id=i.id
    WHERE i.business_id=${businessId} AND i.deleted_at IS NULL AND i.issue_date<=${dateTo}::date
    GROUP BY i.id
    UNION ALL
    SELECT COALESCE(i.supplier_id,p.contact_id),p.date,0,0,0,(l.amount*100)::bigint
    FROM payments p JOIN payment_lines l ON l.payment_id=p.id
    LEFT JOIN purchase_invoices i ON i.id=l.purchase_invoice_id AND i.business_id=p.business_id AND i.deleted_at IS NULL
    JOIN chart_of_accounts a ON a.id=l.account_id AND a.business_id=p.business_id
    WHERE p.business_id=${businessId} AND p.deleted_at IS NULL AND p.date<=${dateTo}::date
      AND (i.id IS NOT NULL OR (l.purchase_invoice_id IS NULL AND a.category='Liability'
        AND a.is_control_account=true AND a.deleted_at IS NULL))
  ` : sql`
    SELECT i.customer_id AS contact_id,i.issue_date AS date,SUM((l.line_total*100)::bigint) AS invoices,
      0::bigint AS credits,0::bigint AS fees,0::bigint AS payments
    FROM sales_invoices i JOIN sales_invoice_lines l ON l.sales_invoice_id=i.id
    WHERE i.business_id=${businessId} AND i.deleted_at IS NULL AND i.issue_date<=${dateTo}::date
    GROUP BY i.id
    UNION ALL
    SELECT n.customer_id,n.issue_date,0,SUM((l.line_total*100)::bigint),0,0
    FROM credit_notes n JOIN credit_note_lines l ON l.credit_note_id=n.id
    WHERE n.business_id=${businessId} AND n.deleted_at IS NULL AND n.issue_date<=${dateTo}::date GROUP BY n.id
    UNION ALL
    SELECT f.customer_id,f.date,0,0,(f.amount*100)::bigint,0 FROM late_payment_fees f
    WHERE f.business_id=${businessId} AND f.deleted_at IS NULL AND f.date<=${dateTo}::date
  `;
  const result = await db.execute(sql`
    WITH movements AS (${movements}), contacts_summary AS (
      SELECT c.id AS contact_id,c.name,
        COALESCE(SUM(m.invoices-m.credits+m.fees-m.payments) FILTER (WHERE m.date<${dateFrom}::date),0) AS opening,
        COALESCE(SUM(m.invoices) FILTER (WHERE m.date>=${dateFrom}::date),0) AS invoices,
        COALESCE(SUM(m.credits) FILTER (WHERE m.date>=${dateFrom}::date),0) AS credits,
        COALESCE(SUM(m.fees) FILTER (WHERE m.date>=${dateFrom}::date),0) AS fees,
        COALESCE(SUM(m.payments) FILTER (WHERE m.date>=${dateFrom}::date),0) AS payments,
        COUNT(*) FILTER (WHERE m.date>=${dateFrom}::date) AS movement_count
      FROM contacts c JOIN movements m ON m.contact_id=c.id
      WHERE c.business_id=${businessId} AND c.deleted_at IS NULL
        AND ${supplier ? sql`c.is_supplier` : sql`c.is_customer`}
      GROUP BY c.id
    ), visible AS (
      SELECT *,opening+invoices-credits+fees-payments AS closing FROM contacts_summary
      WHERE opening<>0 OR movement_count>0
    ), rows AS (
      SELECT contact_id::text,name,opening,invoices,credits,fees,payments,closing,0 AS sort_order FROM visible
      UNION ALL
      SELECT NULL,'Total',COALESCE(SUM(opening),0),COALESCE(SUM(invoices),0),COALESCE(SUM(credits),0),
        COALESCE(SUM(fees),0),COALESCE(SUM(payments),0),COALESCE(SUM(closing),0),1 FROM visible
    ) SELECT * FROM rows ORDER BY sort_order,LOWER(name),contact_id
  `);
  const rows = (result.rows as Record<string, unknown>[]).map((r): ReportRow => ({
    ...emptyRow(String(r.name)), kind: r.sort_order === 1 ? "total" : supplier ? "supplier" : "customer",
    ...(supplier ? { supplierId: r.contact_id ? String(r.contact_id) : undefined, payments: centsToAmount(r.payments) }
      : { customerId: r.contact_id ? String(r.contact_id) : undefined, creditNotes: centsToAmount(r.credits), lateFees: centsToAmount(r.fees) }),
    opening: centsToAmount(r.opening), invoices: centsToAmount(r.invoices), closing: centsToAmount(r.closing),
  }));
  return { type: supplier ? "supplier_summary" : "customer_summary", title, headerDate: `${dateFrom} — ${dateTo}`,
    footer: null, rows, totals: [{ label: "Closing", value: rows.at(-1)?.closing ?? 0 }], netProfit: null };
}

export interface ReportTotals {
  label: string;
  value: number;
}

export interface ReportResult {
  groupLabel?: string;
  type: string;
  title: string;
  headerDate: string;
  footer: string | null;
  rows: ReportRow[];
  totals: ReportTotals[];
  netProfit: number | null;
}

interface AccountAggregate {
  accountId: string;
  code: string | null;
  name: string;
  category: string;
  groupName: string | null;
  debitToDate: number;
  creditToDate: number;
  debitPeriod: number;
  creditPeriod: number;
}

async function aggregateByAccount(
  businessId: string,
  dateFrom: string | null,
  dateTo: string,
): Promise<AccountAggregate[]> {
  const result = await db.execute(sql`
    SELECT a.id AS account_id, a.code, a.name, a.category, a.group_name,
      COALESCE(SUM(l.debit) FILTER (WHERE e.entry_date <= ${dateTo}::date), 0) AS debit_to_date,
      COALESCE(SUM(l.credit) FILTER (WHERE e.entry_date <= ${dateTo}::date), 0) AS credit_to_date,
      COALESCE(SUM(l.debit) FILTER (WHERE (${dateFrom}::date IS NULL OR e.entry_date >= ${dateFrom}::date) AND e.entry_date <= ${dateTo}::date), 0) AS debit_period,
      COALESCE(SUM(l.credit) FILTER (WHERE (${dateFrom}::date IS NULL OR e.entry_date >= ${dateFrom}::date) AND e.entry_date <= ${dateTo}::date), 0) AS credit_period
    FROM journal_entry_lines l
    JOIN journal_entries e ON e.id = l.journal_entry_id
    JOIN chart_of_accounts a ON a.id = l.account_id
    WHERE e.business_id = ${businessId} AND e.deleted_at IS NULL
    GROUP BY a.id, a.code, a.name, a.category, a.group_name
    ORDER BY a.code NULLS LAST, a.name
  `);
  return (result.rows as any[]).map((r) => ({
    accountId: r.account_id,
    code: r.code,
    name: r.name,
    category: r.category,
    groupName: r.group_name ?? null,
    debitToDate: Number(r.debit_to_date),
    creditToDate: Number(r.credit_to_date),
    debitPeriod: Number(r.debit_period),
    creditPeriod: Number(r.credit_period),
  }));
}

/** Saldo kumulatif s.d. dateTo, bertanda mengikuti normal balance kategori. */
function signedBalance(a: AccountAggregate): number {
  const delta = a.debitToDate - a.creditToDate;
  return a.category === "Asset" || a.category === "Expense" ? delta : -delta;
}

/** Mutasi from..to bertanda mengikuti normal balance kategori. */
function signedMovement(a: AccountAggregate): number {
  const delta = a.debitPeriod - a.creditPeriod;
  return a.category === "Asset" || a.category === "Expense" ? delta : -delta;
}

const DEBIT_CATEGORIES = new Set(["Asset", "Expense"]);

function rowFor(
  a: AccountAggregate,
  signed: number,
  showCodes: boolean,
  withAmountOnly = false,
): ReportRow {
  const debitSide = DEBIT_CATEGORIES.has(a.category) ? signed >= 0 : signed < 0;
  const value = Math.abs(signed);
  if (withAmountOnly) {
    return {
      accountId: a.accountId,
      code: showCodes ? a.code : null,
      name: a.name,
      groupName: a.groupName,
      debit: null,
      credit: null,
      amount: value,
    };
  }
  return {
    accountId: a.accountId,
    code: showCodes ? a.code : null,
    name: a.name,
    groupName: a.groupName,
    debit: debitSide ? value : null,
    credit: debitSide ? null : value,
    amount: null,
  };
}

export async function computeTrialBalance(
  businessId: string,
  title: string,
  dateFrom: string,
  dateTo: string,
  showAccountCodes: boolean,
  excludeZeroBalances: boolean,
  footer: string | null,
): Promise<ReportResult> {
  const accounts = await aggregateByAccount(businessId, dateFrom, dateTo);

  const rows: ReportRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  let netProfit = 0;
  const expense = new Set(["Expense"]);
  const income = new Set(["Revenue"]);

  for (const a of accounts) {
    // Akun neraca = saldo kumulatif s.d. date_to; akun laba rugi = mutasi
    // periode (perilaku resmi Manager.io — kolom From tak memengaruhi neraca).
    const isBalanceSheet = a.category === "Asset" || a.category === "Liability" || a.category === "Equity";
    const signed = isBalanceSheet ? signedBalance(a) : signedMovement(a);
    if (income.has(a.category)) netProfit += signed;
    if (expense.has(a.category)) netProfit -= signed;
    if (excludeZeroBalances && signed === 0) continue;
    rows.push(rowFor(a, signed, showAccountCodes));
    const debitSide = DEBIT_CATEGORIES.has(a.category) ? signed >= 0 : signed < 0;
    if (debitSide) totalDebit += Math.abs(signed);
    else totalCredit += Math.abs(signed);
  }

  // Baris Net profit (loss) = BALANCING FIGURE TB (selisih Total Credit dan
  // Total Debit semua akun). Untuk from sebelum transaksi pertama nilainya
  // sama dengan laba periode; kalau ada jurnal pra-`from`, hanya angka ini
  // yang membuat TB tetap seimbang secara matematis.
  const balanceGap = totalCredit - totalDebit;
  if (balanceGap !== 0 || !excludeZeroBalances) {
    rows.push({
      accountId: null,
      code: null,
      name: "Net profit (loss)",
      groupName: null,
      debit: balanceGap > 0 ? balanceGap : null,
      credit: balanceGap < 0 ? Math.abs(balanceGap) : null,
      amount: null,
    });
    if (balanceGap > 0) totalDebit += balanceGap;
    else totalCredit += Math.abs(balanceGap);
  }

  return {
    type: "trial_balance",
    title,
    headerDate: `As at ${dateTo}`,
    footer,
    rows,
    totals: [
      { label: "Total Debit", value: totalDebit },
      { label: "Total Credit", value: totalCredit },
    ],
    netProfit,
  };
}

export async function computeProfitAndLoss(
  businessId: string,
  title: string,
  dateFrom: string,
  dateTo: string,
  showAccountCodes: boolean,
  excludeZeroBalances: boolean,
  footer: string | null,
): Promise<ReportResult> {
  const accounts = await aggregateByAccount(businessId, dateFrom, dateTo);
  const plAccounts = accounts.filter(
    (a) => a.category === "Revenue" || a.category === "Expense",
  );

  const groups = new Map<
    string,
    { category: string; rows: ReportRow[]; total: number }
  >();
  let netProfit = 0;

  for (const a of plAccounts) {
    const signed = signedMovement(a);
    netProfit += a.category === "Revenue" ? signed : -signed;
    if (excludeZeroBalances && signed === 0) continue;
    const key = `${a.category}::${a.groupName ?? ""}`;
    if (!groups.has(key)) {
      groups.set(key, { category: a.category, rows: [], total: 0 });
    }
    const g = groups.get(key)!;
    g.rows.push(rowFor(a, signed, showAccountCodes, true));
    g.total += signed;
  }

  const rows: ReportRow[] = [];
  const totals: ReportTotals[] = [];
  const categoryOrder = ["Revenue", "Expense"];
  for (const category of categoryOrder) {
    const entries = [...groups.entries()].filter(
      ([, g]) => g.category === category,
    );
    for (const [key, g] of entries) {
      const groupName = key.split("::")[1] || null;
      rows.push({
        accountId: null,
        code: null,
        name: groupName ?? (category === "Revenue" ? "Income" : "Expenses"),
        groupName,
        debit: null,
        credit: null,
        amount: null,
      });
      rows.push(...g.rows);
      rows.push({
        accountId: null,
        code: null,
        name: `Total ${groupName ?? (category === "Revenue" ? "Income" : "Expenses")}`,
        groupName,
        debit: null,
        credit: null,
        amount: g.total,
      });
      totals.push({
        label: `Total ${groupName ?? (category === "Revenue" ? "Income" : "Expenses")}`,
        value: g.total,
      });
    }
  }
  rows.push({
    accountId: null,
    code: null,
    name: "Net Profit",
    groupName: null,
    debit: null,
    credit: null,
    amount: netProfit,
  });
  totals.push({ label: "Net Profit", value: netProfit });

  return {
    type: "profit_and_loss",
    title,
    headerDate: `${dateFrom} — ${dateTo}`,
    footer,
    rows,
    totals,
    netProfit,
  };
}

export async function computeBalanceSheet(
  businessId: string,
  title: string,
  asOfDate: string,
  showAccountCodes: boolean,
  excludeZeroBalances: boolean,
  footer: string | null,
): Promise<ReportResult> {
  // dateFrom null -> agregat kumulatif penuh s.d. asOfDate.
  const accounts = await aggregateByAccount(businessId, null, asOfDate);

  const rows: ReportRow[] = [];
  const totals: ReportTotals[] = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquityAccounts = 0;
  let netProfitToDate = 0;

  const sections: Array<{ category: string; label: string }> = [
    { category: "Asset", label: "Assets" },
    { category: "Liability", label: "Liabilities" },
    { category: "Equity", label: "Equity" },
  ];

  for (const { category, label } of sections) {
    rows.push({
      accountId: null,
      code: null,
      name: label,
      groupName: null,
      debit: null,
      credit: null,
      amount: null,
    });
    let sectionTotal = 0;
    for (const a of accounts.filter((x) => x.category === category)) {
      const signed = signedBalance(a);
      if (excludeZeroBalances && signed === 0) continue;
      rows.push(rowFor(a, signed, showAccountCodes, true));
      sectionTotal += signed;
    }
    if (category === "Asset") totalAssets = sectionTotal;
    if (category === "Liability") totalLiabilities = sectionTotal;
    if (category === "Equity") totalEquityAccounts = sectionTotal;
    const sectionTotalLabel =
      category === "Equity" ? "Total equity accounts" : `Total ${label}`;
    rows.push({
      accountId: null,
      code: null,
      name: sectionTotalLabel,
      groupName: null,
      debit: null,
      credit: null,
      amount: sectionTotal,
    });
    totals.push({ label: sectionTotalLabel, value: sectionTotal });
  }

  for (const a of accounts) {
    if (a.category === "Revenue") netProfitToDate += signedBalance(a);
    if (a.category === "Expense") netProfitToDate -= signedBalance(a);
  }
  const retainedEarnings = totalEquityAccounts + netProfitToDate;
  rows.push({
    accountId: null,
    code: null,
    name: "Retained earnings",
    groupName: null,
    debit: null,
    credit: null,
    amount: retainedEarnings,
  });
  const totalEquity = retainedEarnings;
  rows.push({
    accountId: null,
    code: null,
    name: "Total Equity",
    groupName: null,
    debit: null,
    credit: null,
    amount: totalEquity,
  });
  const netAssets = totalAssets - totalLiabilities;
  rows.push({
    accountId: null,
    code: null,
    name: "Net assets (Assets − Liabilities)",
    groupName: null,
    debit: null,
    credit: null,
    amount: netAssets,
  });

  return {
    type: "balance_sheet",
    title,
    headerDate: `As at ${asOfDate}`,
    footer,
    rows,
    totals: [
      ...totals,
      { label: "Laba berjalan (net profit)", value: netProfitToDate },
      { label: "Retained earnings", value: retainedEarnings },
      { label: "Total Equity", value: totalEquity },
      { label: "Net assets", value: netAssets },
    ],
    netProfit: netProfitToDate,
  };
}

export async function computeSalesInvoiceTotalsByCustomer(
  businessId: string,
  title: string,
  dateFrom: string,
  dateTo: string,
): Promise<ReportResult> {
  const result = await db.execute(sql`
    WITH customer_invoices AS (
      SELECT c.id AS customer_id, c.name,
        COALESCE(SUM((l.line_total * 100)::bigint), 0) AS total_cents
      FROM contacts c
      JOIN sales_invoices i ON i.customer_id = c.id
      JOIN sales_invoice_lines l ON l.sales_invoice_id = i.id
      WHERE i.business_id = ${businessId}
        AND i.deleted_at IS NULL
        AND i.issue_date >= ${dateFrom}::date
        AND i.issue_date <= ${dateTo}::date
        AND c.business_id = ${businessId}
        AND c.deleted_at IS NULL
      GROUP BY c.id, c.name
    ),
    rows AS (
      SELECT customer_id::text, name, total_cents, 0 AS sort_order FROM customer_invoices
      UNION ALL
      SELECT NULL, 'Total', COALESCE(SUM(total_cents), 0), 1 FROM customer_invoices
    )
    SELECT * FROM rows ORDER BY sort_order, LOWER(name), customer_id
  `);
  const rows = (result.rows as Record<string, unknown>[]).map((r): ReportRow => ({
    ...emptyRow(String(r.name)),
    kind: r.sort_order === 1 ? "total" : "customer",
    customerId: r.customer_id ? String(r.customer_id) : undefined,
    amount: centsToAmount(r.total_cents),
  }));
  const totalVal = rows.find((r) => r.kind === "total")?.amount ?? 0;
  return {
    type: "sales_invoice_totals_by_customer",
    title,
    headerDate: dateTo,
    footer: null,
    rows,
    totals: [{ label: "Total", value: totalVal }],
    netProfit: null,
  };
}

/** No item FK or item catalogue exists in the verified database: all lines are free-form. */
export async function computeSalesInvoiceTotalsByItem(
  businessId: string, title: string, dateFrom: string, dateTo: string,
): Promise<ReportResult> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM((l.line_total*100)::bigint),0) AS cents,COUNT(*) AS line_count
    FROM sales_invoices i JOIN sales_invoice_lines l ON l.sales_invoice_id=i.id
    WHERE i.business_id=${businessId} AND i.deleted_at IS NULL
      AND i.issue_date BETWEEN ${dateFrom}::date AND ${dateTo}::date
  `);
  const r = result.rows[0] as Record<string, unknown>;
  const amount = centsToAmount(r.cents);
  const rows: ReportRow[] = Number(r.line_count) ? [{ ...emptyRow("Tanpa item"), kind: "summary", label: "no_item", amount }] : [];
  rows.push({ ...emptyRow("Total"), kind: "total", amount });
  return { type: "sales_invoice_totals_by_item", title, headerDate: dateTo,
    footer: "Item catalogue and invoice item links are unavailable; all invoice lines are grouped as No item.",
    rows, totals: [{ label: "Total", value: amount }], netProfit: null };
}

export async function computeSalesInvoiceTotalsByCustomField(
  businessId: string, title: string, dateFrom: string, dateTo: string,
  customFieldId: string, fieldType: string, groupLabel: string,
): Promise<ReportResult> {
  const result = await db.execute(sql`
    WITH invoices AS (
      SELECT i.id,SUM((l.line_total*100)::bigint) AS cents
      FROM sales_invoices i JOIN sales_invoice_lines l ON l.sales_invoice_id=i.id
      WHERE i.business_id=${businessId} AND i.deleted_at IS NULL
        AND i.issue_date BETWEEN ${dateFrom}::date AND ${dateTo}::date GROUP BY i.id
    ), grouped AS (
      SELECT CASE ${fieldType} WHEN 'number' THEN v.value_number::text WHEN 'date' THEN v.value_date::text
        WHEN 'boolean' THEN v.value_boolean::text ELSE NULLIF(TRIM(v.value_text),'') END AS value,
        SUM(i.cents) AS cents
      FROM invoices i LEFT JOIN custom_field_values v ON v.record_id=i.id
        AND v.definition_id=${customFieldId} AND v.business_id=${businessId} AND v.entity_type='sales_invoice'
      GROUP BY 1
    ), rows AS (
      SELECT value,cents,0 AS sort_order FROM grouped
      UNION ALL SELECT NULL,COALESCE(SUM(cents),0),1 FROM grouped
    ) SELECT * FROM rows ORDER BY sort_order,value NULLS FIRST
  `);
  const rows = (result.rows as Record<string, unknown>[]).map((r): ReportRow => ({
    ...emptyRow(r.sort_order === 1 ? "Total" : r.value === null ? "(Kosong)" : String(r.value)),
    kind: r.sort_order === 1 ? "total" : "summary",
    label: r.sort_order !== 1 && r.value === null ? "empty_custom_field" : undefined,
    amount: centsToAmount(r.cents),
  }));
  return { type: "sales_invoice_totals_by_custom_field", title, headerDate: dateTo, groupLabel,
    footer: null, rows, totals: [{ label: "Total", value: rows.at(-1)?.amount ?? 0 }], netProfit: null };
}

export async function computeBillableTimeSummary(
  businessId: string,
  title: string,
  dateFrom: string,
  dateTo: string,
): Promise<ReportResult> {
  const result = await db.execute(sql`
    WITH entries AS (
      SELECT customer_id, date,
        (ROUND(hourly_rate * (time_spent_minutes / 60.0) * 100))::bigint AS amount_cents
      FROM billable_time_entries
      WHERE business_id = ${businessId}
        AND deleted_at IS NULL
        AND date <= ${dateTo}::date
    ),
    by_customer AS (
      SELECT c.id AS customer_id, c.name,
        COALESCE(SUM(e.amount_cents) FILTER (WHERE e.date < ${dateFrom}::date), 0) AS opening,
        COALESCE(SUM(e.amount_cents) FILTER (WHERE e.date >= ${dateFrom}::date), 0) AS new_billable,
        COUNT(*) FILTER (WHERE e.date >= ${dateFrom}::date) AS new_count
      FROM contacts c
      JOIN entries e ON e.customer_id = c.id
      WHERE c.business_id = ${businessId} AND c.deleted_at IS NULL
      GROUP BY c.id, c.name
      HAVING COALESCE(SUM(e.amount_cents) FILTER (WHERE e.date < ${dateFrom}::date), 0) <> 0
          OR COUNT(*) FILTER (WHERE e.date >= ${dateFrom}::date) > 0
    ),
    rows AS (
      SELECT customer_id::text, name, opening, new_billable, 0::bigint AS invoiced, 0::bigint AS written_off,
        opening + new_billable AS closing, 0 AS sort_order
      FROM by_customer
      UNION ALL
      SELECT NULL, 'Total', COALESCE(SUM(opening), 0), COALESCE(SUM(new_billable), 0), 0::bigint, 0::bigint,
        COALESCE(SUM(opening + new_billable), 0), 1
      FROM by_customer
    )
    SELECT * FROM rows ORDER BY sort_order, LOWER(name), customer_id
  `);
  const rows = (result.rows as Record<string, unknown>[]).map((r): ReportRow => ({
    ...emptyRow(String(r.name)),
    kind: r.sort_order === 1 ? "total" : "customer",
    customerId: r.customer_id ? String(r.customer_id) : undefined,
    opening: centsToAmount(r.opening),
    movement: centsToAmount(r.new_billable),
    invoices: 0,
    closing: centsToAmount(r.closing),
    amount: centsToAmount(r.closing),
  }));
  const totalVal = rows.find((r) => r.kind === "total")?.closing ?? 0;
  return {
    type: "billable_time_summary",
    title,
    headerDate: `${dateFrom} — ${dateTo}`,
    footer: null,
    rows,
    totals: [{ label: "Closing", value: totalVal }],
    netProfit: null,
  };
}

export async function computeReceiptsPaymentsSummary(
  businessId: string,
  title: string,
  dateFrom: string,
  dateTo: string,
  showAccountCodes: boolean,
  excludeZeroBalances: boolean,
  footer: string | null,
): Promise<ReportResult> {
  const [receiptsRes, paymentsRes, cashBalancesRes] = await Promise.all([
    db.execute(sql`
      SELECT a.id AS account_id, a.code, a.name, a.group_name,
        COALESCE(SUM((l.amount * 100)::bigint), 0) AS amount_cents
      FROM receipt_lines l
      JOIN receipts r ON r.id = l.receipt_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE r.business_id = ${businessId} AND r.deleted_at IS NULL
        AND r.date >= ${dateFrom}::date AND r.date <= ${dateTo}::date
        AND a.business_id = ${businessId} AND a.deleted_at IS NULL
      GROUP BY a.id, a.code, a.name, a.group_name
      ORDER BY a.code NULLS LAST, a.name
    `),
    db.execute(sql`
      SELECT a.id AS account_id, a.code, a.name, a.group_name,
        COALESCE(SUM((l.amount * 100)::bigint), 0) AS amount_cents
      FROM payment_lines l
      JOIN payments p ON p.id = l.payment_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE p.business_id = ${businessId} AND p.deleted_at IS NULL
        AND p.date >= ${dateFrom}::date AND p.date <= ${dateTo}::date
        AND a.business_id = ${businessId} AND a.deleted_at IS NULL
      GROUP BY a.id, a.code, a.name, a.group_name
      ORDER BY a.code NULLS LAST, a.name
    `),
    db.execute(sql`
      WITH bank_coas AS (
        SELECT account_id FROM bank_accounts
        WHERE business_id = ${businessId} AND deleted_at IS NULL
      )
      SELECT
        COALESCE(SUM((l.debit - l.credit) * 100) FILTER (WHERE e.entry_date < ${dateFrom}::date), 0)::bigint AS opening_cash,
        COALESCE(SUM((l.debit - l.credit) * 100) FILTER (WHERE e.entry_date <= ${dateTo}::date), 0)::bigint AS ending_cash
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.journal_entry_id
      JOIN bank_coas b ON b.account_id = l.account_id
      WHERE e.business_id = ${businessId} AND e.deleted_at IS NULL
    `),
  ]);

  const rows: ReportRow[] = [];

  rows.push({ ...emptyRow("Receipts"), kind: "section" });

  let totalReceiptsCents = 0n;
  for (const r of receiptsRes.rows as Record<string, unknown>[]) {
    const amountCents = BigInt(String(r.amount_cents ?? 0));
    if (excludeZeroBalances && amountCents === 0n) continue;
    totalReceiptsCents += amountCents;
    const codeStr = r.code ? String(r.code) : null;
    const nameStr = String(r.name);
    const displayName = showAccountCodes && codeStr ? `${codeStr} - ${nameStr}` : nameStr;
    rows.push({
      ...emptyRow(displayName),
      accountId: String(r.account_id),
      code: codeStr,
      groupName: r.group_name ? String(r.group_name) : null,
      amount: centsToAmount(amountCents),
      kind: "receipt",
    });
  }

  rows.push({
    ...emptyRow("Total Receipts"),
    amount: centsToAmount(totalReceiptsCents),
    kind: "total",
  });

  rows.push({ ...emptyRow("Less: Payments"), kind: "section" });

  let totalPaymentsCents = 0n;
  for (const r of paymentsRes.rows as Record<string, unknown>[]) {
    const amountCents = BigInt(String(r.amount_cents ?? 0));
    if (excludeZeroBalances && amountCents === 0n) continue;
    totalPaymentsCents += amountCents;
    const codeStr = r.code ? String(r.code) : null;
    const nameStr = String(r.name);
    const displayName = showAccountCodes && codeStr ? `${codeStr} - ${nameStr}` : nameStr;
    rows.push({
      ...emptyRow(displayName),
      accountId: String(r.account_id),
      code: codeStr,
      groupName: r.group_name ? String(r.group_name) : null,
      amount: centsToAmount(amountCents),
      kind: "payment",
    });
  }

  rows.push({
    ...emptyRow("Total Payments"),
    amount: centsToAmount(totalPaymentsCents),
    kind: "total",
  });

  const netIncreaseCents = totalReceiptsCents - totalPaymentsCents;
  const cashRow = cashBalancesRes.rows[0] as Record<string, unknown> | undefined;
  const openingCashCents = BigInt(String(cashRow?.opening_cash ?? 0));
  const endingCashCents = BigInt(String(cashRow?.ending_cash ?? 0));
  const adjustmentsCents = endingCashCents - (openingCashCents + netIncreaseCents);

  rows.push({
    ...emptyRow("Net increase (decrease) in cash"),
    amount: centsToAmount(netIncreaseCents),
    kind: "summary",
  });
  rows.push({
    ...emptyRow("Cash at beginning of period"),
    amount: centsToAmount(openingCashCents),
    kind: "summary",
  });
  rows.push({
    ...emptyRow("Adjustments"),
    amount: centsToAmount(adjustmentsCents),
    kind: "summary",
  });
  rows.push({
    ...emptyRow("Cash at end of period"),
    amount: centsToAmount(endingCashCents),
    kind: "total",
  });

  return {
    type: "receipts_payments_summary",
    title,
    headerDate: `${dateFrom} — ${dateTo}`,
    footer,
    rows,
    totals: [{ label: "Cash at end of period", value: centsToAmount(endingCashCents) }],
    netProfit: null,
  };
}
