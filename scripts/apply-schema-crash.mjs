/** Run fix-schema-crash SQL — node scripts/apply-schema-crash.mjs */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";

const { Client } = pg;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
  (process.env.SUPABASE_DB_PASSWORD && url
    ? `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref(url)}.supabase.co:5432/postgres`
    : null);
if (!conn) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const sql = `
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS has_lamnatzeach BOOLEAN DEFAULT false;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS size TEXT;
NOTIFY pgrst, 'reload schema';
`;
const sql2 = readFileSync(resolve(root, "supabase/migrations/037_market_torah_brokerage.sql"), "utf8");

const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query(sql);
await c.query(sql2);
await c.query(`NOTIFY pgrst, 'reload schema';`);
await c.end();
console.log("OK");
