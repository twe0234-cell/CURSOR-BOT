/**
 * Apply all SQL files under supabase/migrations in filename order.
 * Skips errors that look idempotent (already exists, duplicate object).
 * Run: node scripts/run-all-migrations.mjs
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readdirSync, readFileSync } from "fs";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

function extractProjectRef(u) {
  try {
    const host = new URL(u).hostname;
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
  const ref = supabaseUrl ? extractProjectRef(supabaseUrl) : null;
  if (password && ref) {
    return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
  }
  return null;
}

function ignorable(err) {
  const c = err?.code;
  const m = String(err?.message ?? "").toLowerCase();
  if (c === "42P07" || c === "42710" || c === "42P06" || c === "42701") return true;
  if (m.includes("already exists")) return true;
  if (m.includes("duplicate key")) return true;
  if (m.includes("policy") && m.includes("already")) return true;
  return false;
}

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  console.error(
    "Missing DATABASE_URL (or DIRECT_URL / POSTGRES_URL / SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL)"
  );
  process.exit(1);
}

const fromArg = process.argv.find((a) => a.startsWith("--from="));
const fromName = fromArg ? fromArg.slice("--from=".length).trim() : null;

const migrationsDir = resolve(root, "supabase/migrations");
let files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (fromName) {
  const i = files.findIndex((f) => f === fromName || f.startsWith(fromName));
  if (i < 0) {
    console.error("No migration matching --from=", fromName);
    process.exit(1);
  }
  files = files.slice(i);
  console.log("Starting from:", files[0]);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120000,
});

let ok = 0;
let skipped = 0;
let failed = 0;

try {
  await client.connect();
  console.log("Connected. Running", files.length, "migration files...\n");

  for (const name of files) {
    const path = resolve(migrationsDir, name);
    const sql = readFileSync(path, "utf8").trim();
    if (!sql) {
      console.log("[EMPTY]", name);
      continue;
    }
    try {
      await client.query(sql);
      console.log("[OK]", name);
      ok++;
    } catch (e) {
      if (ignorable(e)) {
        console.log("[SKIP]", name, "—", e.code || "", (e.message || "").slice(0, 120));
        skipped++;
      } else {
        console.error("[FAIL]", name);
        console.error(e.message);
        failed++;
        process.exitCode = 1;
        break;
      }
    }
  }

  try {
    await client.query(`NOTIFY pgrst, 'reload schema';`);
  } catch {
    /* ignore */
  }

  console.log("\nDone. OK:", ok, "Skipped (idempotent):", skipped, "Failed:", failed);
} catch (e) {
  console.error("Connection or fatal error:", e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
