/**
 * Apply migrations 059 (market_contact_logs) and 060 (crm address).
 * Run: node scripts/run-migrations-059-060.mjs
 * Requires DATABASE_URL in .env.local
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = resolve(__dirname, "../.env.local");
try {
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  console.warn("Could not load .env.local");
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Use postgres npm package (or pg)
let sql;
try {
  const { default: postgres } = await import("postgres");
  sql = postgres(url, { ssl: "require", max: 1 });
} catch {
  // fallback: pg
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const run = async (query) => { const r = await pool.query(query); return r; };
  const migrations = [
    readFileSync(resolve(__dirname, "../supabase/migrations/059_market_contact_log.sql"), "utf8"),
    readFileSync(resolve(__dirname, "../supabase/migrations/060_crm_address.sql"), "utf8"),
  ];
  for (const m of migrations) {
    try { await run(m); console.log("OK"); } catch (e) { console.error(e.message); }
  }
  await pool.end();
  process.exit(0);
}

const migrations = [
  { name: "059_market_contact_log", file: "../supabase/migrations/059_market_contact_log.sql" },
  { name: "060_crm_address", file: "../supabase/migrations/060_crm_address.sql" },
];

for (const { name, file } of migrations) {
  const query = readFileSync(resolve(__dirname, file), "utf8");
  try {
    await sql.unsafe(query);
    console.log(`✅ ${name}`);
  } catch (e) {
    console.error(`❌ ${name}: ${e.message}`);
  }
}

await sql.end();
