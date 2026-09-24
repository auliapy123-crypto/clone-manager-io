import "dotenv/config";
import { sql } from "drizzle-orm";
import db, { closePool } from "../db/index.js";

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS bank_reconciliations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    date date NOT NULL,
    bank_account_id uuid NOT NULL REFERENCES bank_accounts(id),
    statement_balance numeric(18, 2) NOT NULL DEFAULT 0,
    description text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    deleted_at timestamp
  )
`);

await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_business
    ON bank_reconciliations (business_id)
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_bank_account
    ON bank_reconciliations (bank_account_id)
`);

const cols = await db.execute(sql`
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'bank_reconciliations'
  ORDER BY ordinal_position
`);
console.log(JSON.stringify(cols.rows, null, 2));

await closePool();
