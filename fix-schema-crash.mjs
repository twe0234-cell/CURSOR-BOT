/**
 * Temporary: ensure inventory pitum columns + PostgREST reload + market brokerage columns.
 * Run: node fix-schema-crash.mjs
 * Delete after successful execution.
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";

const { Client } = pg;
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
function ref(u) {
  try {
    const m = new URL(u).hostname.match(/^([^.]+)\.supabase\.co$/);
    return m ? m[1] : null;
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
  console.error("Missing DATABASE_URL or SUPABASE_DB_PASSWORD");
  process.exit(1);
}

const sql = `
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS has_lamnatzeach BOOLEAN DEFAULT false;
ALTER TABLE public.inventory ALTER COLUMN has_lamnatzeach SET DEFAULT false;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS size TEXT;
NOTIFY pgrst, 'reload schema';
`;

const sql2 = readFileSync(
  resolve(root, "supabase/migrations/037_market_torah_brokerage.sql"),
  "utf8"
);

const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  await client.query(sql2);
  await client.query(`NOTIFY pgrst, 'reload schema';`);
  console.log("OK: fix-schema-crash (inventory + market brokerage + reload)");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
console.log("fix-schema-crash: success.");
