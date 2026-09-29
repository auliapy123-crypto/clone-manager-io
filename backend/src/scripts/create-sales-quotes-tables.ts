import "dotenv/config";
import { sql } from "drizzle-orm";
import db, { closePool } from "../db/index.js";

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS sales_quotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES contacts(id),
    issue_date date NOT NULL,
    valid_for_days integer,
    reference varchar(50),
    billing_address text,
    description text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    deleted_at timestamp
  )
`);

await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_sales_quotes_business
    ON sales_quotes (business_id)
`);
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_sales_quotes_customer
    ON sales_quotes (customer_id)
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS sales_quote_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_quote_id uuid NOT NULL REFERENCES sales_quotes(id) ON DELETE CASCADE,
    description varchar(255) NOT NULL,
    quantity numeric(18, 4) NOT NULL DEFAULT 1.0000,
    unit_price numeric(18, 2) NOT NULL,
    line_total numeric(18, 2) NOT NULL,
    sort_order integer NOT NULL DEFAULT 0
  )
`);

await db.execute(sql`
  CREATE INDEX IF NOT EXISTS idx_sales_quote_lines_quote
    ON sales_quote_lines (sales_quote_id)
`);

const cols = await db.execute(sql`
  SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('sales_quotes', 'sales_quote_lines')
  ORDER BY table_name, ordinal_position
`);
console.log(JSON.stringify(cols.rows, null, 2));

await closePool();
