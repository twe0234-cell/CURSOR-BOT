/** Apply 036_inventory_pitum_haketoret.sql — node scripts/apply-pitum-inventory.mjs */
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
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const sql = readFileSync(
  resolve(root, "supabase/migrations/036_inventory_pitum_haketoret.sql"),
  "utf8"
);
const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query(sql);
await c.end();
console.log("OK: 036");
