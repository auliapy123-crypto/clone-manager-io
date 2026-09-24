import "dotenv/config";
import { sql } from "drizzle-orm";
import db, { closePool } from "../db/index.js";

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    supplier_id uuid NOT NULL REFERENCES contacts(id),
    reference varchar(50),
    date date NOT NULL,
    billing_address text,
    description text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    deleted_at timestamp
  )
`);

await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_business
    ON purchase_orders (business_id)
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier
    ON purchase_orders (supplier_id)
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES chart_of_accounts(id),
    description varchar(255),
    quantity numeric(18, 4) NOT NULL DEFAULT 1.0000,
    unit_price numeric(18, 2) NOT NULL,
    line_amount numeric(18, 2) NOT NULL,
    sort_order integer NOT NULL DEFAULT 0
  )
`);

await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_order
    ON purchase_order_lines (purchase_order_id)
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_account
    ON purchase_order_lines (account_id)
`);

await db.execute(sql`
  ALTER TABLE purchase_invoices
    ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES purchase_orders(id)
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_purchase_invoices_purchase_order
    ON purchase_invoices (purchase_order_id)
`);

const cols = await db.execute(sql`
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('purchase_orders', 'purchase_order_lines')
  ORDER BY table_name, ordinal_position
`);
console.log(JSON.stringify(cols.rows, null, 2));

const invCol = await db.execute(sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'purchase_invoices'
    AND column_name = 'purchase_order_id'
`);
console.log("purchase_invoices.purchase_order_id:", JSON.stringify(invCol.rows));

await closePool();
