/**
 * Temporary one-off: inventory megillah_type + safe market potential_profit if missing.
 * Run: node fix-schema-final.mjs
 * Delete after successful execution against your Supabase DB.
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
function ref(u) {
  try {
    return new URL(u).hostname.match(/^([^.]+)\.supabase\.co$/)?.[1] ?? null;
  } catch {
    return null;
  }
}
const conn =
  process.env.DATABASE_URL ||
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL ||
  (process.env.SUPABASE_DB_PASSWORD && url
    ? `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref(url)}.supabase.co:5432/postgres`
    : null);

if (!conn) {
  console.error("Missing DATABASE_URL or SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}

const sql = `
-- 1. Ensure market_torah_books exists (minimal; skipped if already created by migrations)
CREATE TABLE IF NOT EXISTS public.market_torah_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sofer_id UUID,
  external_sofer_name TEXT,
  asking_price NUMERIC DEFAULT 0,
  target_brokerage_price NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Brokerage columns if an older stub missed them
ALTER TABLE public.market_torah_books ADD COLUMN IF NOT EXISTS asking_price NUMERIC DEFAULT 0;
ALTER TABLE public.market_torah_books ADD COLUMN IF NOT EXISTS target_brokerage_price NUMERIC DEFAULT 0;

-- 3. potential_profit: add only if missing (avoid duplicate with migration 037)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'market_torah_books'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'market_torah_books' AND column_name = 'potential_profit'
  ) THEN
    ALTER TABLE public.market_torah_books
      ADD COLUMN potential_profit NUMERIC GENERATED ALWAYS AS (
        COALESCE(target_brokerage_price, 0) - COALESCE(asking_price, 0)
      ) STORED;
  END IF;
END $$;

-- 4. Megillah type on inventory
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS megillah_type TEXT DEFAULT 'אסתר';

NOTIFY pgrst, 'reload schema';
`;

const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  console.log("OK: fix-schema-final");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
