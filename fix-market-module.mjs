/**
 * One-off: market_torah_books — currency, dealer_id, last_contact_date, negotiation_notes.
 * Run: node fix-market-module.mjs  (requires DATABASE_URL in .env.local)
 * Delete after success + migration 039 applied in prod.
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

const sql = readFileSync(resolve(root, "supabase/migrations/039_market_dealer_negotiation.sql"), "utf8") + "\nNOTIFY pgrst, 'reload schema';";

const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  console.log("OK: fix-market-module (039)");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
