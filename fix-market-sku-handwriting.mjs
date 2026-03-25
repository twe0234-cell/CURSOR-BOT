/**
 * One-off: market_torah_books — sku + handwriting_image_url; crm_contacts — sku
 * Run: node fix-market-sku-handwriting.mjs  (requires DATABASE_URL in .env.local)
 * Delete after success.
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
  console.error("Missing DATABASE_URL / DIRECT_URL / POSTGRES_URL in .env.local");
  process.exit(1);
}

const sql = readFileSync(
  resolve(root, "supabase/migrations/041_market_sku_handwriting.sql"),
  "utf8"
);

const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  console.log("✅  041_market_sku_handwriting: columns added successfully");
} catch (e) {
  console.error("❌  Migration failed:", e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
