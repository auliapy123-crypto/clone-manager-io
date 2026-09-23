import "dotenv/config";
import { sql } from "drizzle-orm";
import db, { closePool } from "../db/index.js";

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    date date NOT NULL,
    reference varchar(50),
    bank_account_id uuid NOT NULL REFERENCES bank_accounts(id),
    contact_id uuid REFERENCES contacts(id),
    description text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    deleted_at timestamp
  )
`);

await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_receipts_business ON receipts (business_id)
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_receipts_bank_account ON receipts (bank_account_id)
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_receipts_contact ON receipts (contact_id)
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS receipt_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES chart_of_accounts(id),
    description varchar(255),
    amount numeric(18, 2) NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    CONSTRAINT chk_receipt_lines_amount_positive CHECK (amount > 0)
  )
`);

await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_receipt_lines_receipt ON receipt_lines (receipt_id)
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_receipt_lines_account ON receipt_lines (account_id)
`);

const cols = await db.execute(sql`
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('receipts', 'receipt_lines')
  ORDER BY table_name, ordinal_position
`);
console.log(JSON.stringify(cols.rows, null, 2));

await closePool();
