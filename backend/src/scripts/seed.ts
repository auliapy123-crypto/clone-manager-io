/**
 * Seed Chart of Accounts standar untuk satu bisnis (Fase 1.4).
 *
 * Dipakai sebagai starting point akun-akun umum saat sebuah bisnis baru
 * dibuat. Idempotent: baris yang code-nya sudah ada di bisnis tsb (unique
 * constraint chart_of_accounts_business_id_code_key) dilewati, bukan error.
 *
 * Pemakaian:
 *   pnpm seed -- <businessId>
 *   BUSINESS_ID=<uuid> pnpm seed
 */
import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import db, { closePool } from "../db/index.js";
import { businesses, chartOfAccounts, type AccountCategory } from "../db/schema.js";

interface StandardAccount {
  code: string;
  name: string;
  category: AccountCategory;
  groupName: string;
  isControlAccount?: boolean;
}

/** Akun umum lintas jenis bisnis — dipakai sebagai starting point, bukan daftar final. */
const STANDARD_CHART_OF_ACCOUNTS: StandardAccount[] = [
  // --- Asset ---------------------------------------------------------
  { code: "1000", name: "Kas", category: "Asset", groupName: "Aset Lancar" },
  { code: "1010", name: "Bank", category: "Asset", groupName: "Aset Lancar" },
  {
    code: "1100",
    name: "Piutang Usaha",
    category: "Asset",
    groupName: "Aset Lancar",
    isControlAccount: true,
  },
  {
    code: "1200",
    name: "Persediaan",
    category: "Asset",
    groupName: "Aset Lancar",
  },
  {
    code: "1300",
    name: "Perlengkapan",
    category: "Asset",
    groupName: "Aset Lancar",
  },
  {
    code: "1500",
    name: "Peralatan",
    category: "Asset",
    groupName: "Aset Tetap",
  },
  {
    code: "1510",
    name: "Akumulasi Penyusutan Peralatan",
    category: "Asset",
    groupName: "Aset Tetap",
  },
  // --- Liability -------------------------------------------------------
  {
    code: "2000",
    name: "Utang Usaha",
    category: "Liability",
    groupName: "Liabilitas Jangka Pendek",
    isControlAccount: true,
  },
  {
    code: "2100",
    name: "Utang Bank",
    category: "Liability",
    groupName: "Liabilitas Jangka Pendek",
  },
  {
    code: "2200",
    name: "Utang Pajak",
    category: "Liability",
    groupName: "Liabilitas Jangka Pendek",
  },
  // --- Equity ----------------------------------------------------------
  { code: "3000", name: "Modal Pemilik", category: "Equity", groupName: "Ekuitas" },
  { code: "3100", name: "Prive", category: "Equity", groupName: "Ekuitas" },
  { code: "3900", name: "Laba Ditahan", category: "Equity", groupName: "Ekuitas" },
  // --- Revenue -----------------------------------------------------------
  {
    code: "4000",
    name: "Pendapatan Penjualan",
    category: "Revenue",
    groupName: "Pendapatan Operasional",
  },
  {
    code: "4900",
    name: "Pendapatan Lain-lain",
    category: "Revenue",
    groupName: "Pendapatan Non-Operasional",
  },
  // --- Expense -----------------------------------------------------------
  {
    code: "5000",
    name: "Harga Pokok Penjualan",
    category: "Expense",
    groupName: "Beban Pokok Penjualan",
  },
  {
    code: "6000",
    name: "Beban Gaji",
    category: "Expense",
    groupName: "Beban Operasional",
  },
  {
    code: "6100",
    name: "Beban Sewa",
    category: "Expense",
    groupName: "Beban Operasional",
  },
  {
    code: "6200",
    name: "Beban Utilitas",
    category: "Expense",
    groupName: "Beban Operasional",
  },
  {
    code: "6300",
    name: "Beban Penyusutan",
    category: "Expense",
    groupName: "Beban Operasional",
  },
  {
    code: "6900",
    name: "Beban Lain-lain",
    category: "Expense",
    groupName: "Beban Non-Operasional",
  },
];

async function seedChartOfAccounts(businessId: string): Promise<void> {
  const [business] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      baseCurrencyCode: businesses.baseCurrencyCode,
    })
    .from(businesses)
    .where(and(eq(businesses.id, businessId), isNull(businesses.deletedAt)))
    .limit(1);

  if (!business) {
    throw new Error(`Bisnis dengan id ${businessId} tidak ditemukan.`);
  }

  const rows = await db
    .insert(chartOfAccounts)
    .values(
      STANDARD_CHART_OF_ACCOUNTS.map((account) => ({
        ...account,
        businessId,
        currencyCode: business.baseCurrencyCode ?? "IDR",
      })),
    )
    .onConflictDoNothing({
      target: [chartOfAccounts.businessId, chartOfAccounts.code],
    })
    .returning({ id: chartOfAccounts.id, code: chartOfAccounts.code });

  console.log(
    `Selesai. ${rows.length}/${STANDARD_CHART_OF_ACCOUNTS.length} akun ditambahkan ke bisnis "${business.name}" ` +
      `(sisanya sudah ada sebelumnya).`,
  );
}

async function main() {
  const businessId = process.argv[2] || process.env.BUSINESS_ID;

  if (!businessId) {
    console.error(
      "Penggunaan: pnpm seed -- <businessId>  (atau set env BUSINESS_ID)",
    );
    process.exit(1);
  }

  try {
    await seedChartOfAccounts(businessId);
  } finally {
    await closePool();
  }
}

main().catch((error) => {
  console.error("Gagal menjalankan seed:", error);
  process.exit(1);
});
