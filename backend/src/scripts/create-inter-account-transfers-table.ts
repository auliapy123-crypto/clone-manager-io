import "dotenv/config";
import { sql } from "drizzle-orm";
import db, { closePool } from "../db/index.js";

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS inter_account_transfers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    date date NOT NULL,
    reference varchar(50),
    description text,
    from_bank_account_id uuid NOT NULL REFERENCES bank_accounts(id),
    to_bank_account_id uuid NOT NULL REFERENCES bank_accounts(id),
    amount numeric(18, 2) NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    deleted_at timestamp,
    CONSTRAINT chk_inter_account_transfers_amount_positive CHECK (amount > 0)
  )
`);

await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_inter_account_transfers_business
    ON inter_account_transfers (business_id)
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_inter_account_transfers_from
    ON inter_account_transfers (from_bank_account_id)
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_inter_account_transfers_to
    ON inter_account_transfers (to_bank_account_id)
`);

const cols = await db.execute(sql`
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'inter_account_transfers'
  ORDER BY ordinal_position
`);
console.log(JSON.stringify(cols.rows, null, 2));

await closePool();
