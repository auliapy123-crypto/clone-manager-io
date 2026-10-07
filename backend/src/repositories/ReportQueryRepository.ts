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
}

export interface ReportTotals {
  label: string;
  value: number;
}

export interface ReportResult {
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
