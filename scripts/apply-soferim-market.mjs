/**
 * Apply migration 035 (scribes + market torah). Run: node scripts/apply-soferim-market.mjs
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
    const m = u.hostname.match(/^([^.]+)\.supabase\.co$/);
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
    return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
  }
  return null;
}
const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  console.error("Missing DATABASE_URL or SUPABASE_DB_PASSWORD");
  process.exit(1);
}
const sql = readFileSync(resolve(root, "supabase/migrations/035_soferim_and_market_torah.sql"), "utf8");
const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  console.log("OK: 035_soferim_and_market_torah.sql");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
