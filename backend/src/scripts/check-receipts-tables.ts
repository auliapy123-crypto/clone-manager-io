import "dotenv/config";
import { sql } from "drizzle-orm";
import db, { closePool } from "../db/index.js";

const result = await db.execute(sql`
  SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('receipts', 'receipt_lines')
  ORDER BY table_name, ordinal_position
`);

console.log(JSON.stringify(result.rows, null, 2));

const tables = await db.execute(sql`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename ILIKE '%receipt%'
`);
console.log("tables:", JSON.stringify(tables.rows, null, 2));

await closePool();
