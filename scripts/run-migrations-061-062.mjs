import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const lines = readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const { default: pg } = await import("pg");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const files = ["061_crm_extra_contacts.sql", "062_scribe_gallery.sql"];
for (const f of files) {
  const sql = readFileSync(resolve(__dirname, `../supabase/migrations/${f}`), "utf8");
  try { await pool.query(sql); console.log(`✅ ${f}`); }
  catch (e) { console.error(`❌ ${f}: ${e.message}`); }
}
await pool.end();
