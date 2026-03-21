/**
 * Apply migration 034 (profit ledger) via direct Postgres.
 * Run: node scripts/apply-ledger.mjs
 * Requires DATABASE_URL (or SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL) in .env.local
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

function extractProjectRefFromSupabaseUrl(supabaseUrl) {
  try {
    const u = new URL(supabaseUrl);
    const host = u.hostname;
    const m = host.match(/^([^.]+)\.supabase\.co$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function resolveDatabaseUrl() {
  const direct =
    process.env.DATABASE_URL ||
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    null;
  if (direct) return direct;

  const password =
    process.env.SUPABASE_DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    process.env.DATABASE_PASSWORD ||
    null;
  const ref = url ? extractProjectRefFromSupabaseUrl(url) : null;
  if (password && ref) {
    const enc = encodeURIComponent(password);
    return `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`;
  }
  return null;
}

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  console.error(
    "Missing DATABASE_URL (or DIRECT_URL / POSTGRES_URL / SUPABASE_DB_PASSWORD) in .env.local"
  );
  process.exit(1);
}

const sqlPath = resolve(root, "supabase/migrations/034_enterprise_profit_ledger.sql");
let sql;
try {
  sql = readFileSync(sqlPath, "utf8");
} catch (e) {
  console.error("Cannot read:", sqlPath, e);
  process.exit(1);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  console.log("OK: applied 034_enterprise_profit_ledger.sql");
} catch (e) {
  console.error("Postgres error:", e);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

console.log("apply-ledger: success.");
