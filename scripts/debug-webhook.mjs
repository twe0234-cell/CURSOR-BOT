/**
 * Debug script: checks webhook config + recent sys_logs
 * Run: node scripts/debug-webhook.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
try {
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { console.warn("Could not load .env.local"); }

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

let sql;
try {
  const { default: postgres } = await import("postgres");
  sql = postgres(url, { ssl: "require", max: 1 });
} catch {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  console.log("\n=== user_settings (webhook config) ===");
  const s = await pool.query(`
    SELECT user_id, green_api_id, LEFT(green_api_token,8)||'...' AS token_prefix,
           wa_market_group_id,
           CASE WHEN green_api_id IS NULL THEN 'MISSING' ELSE 'SET' END AS api_status
    FROM user_settings LIMIT 5
  `);
  console.table(s.rows);

  console.log("\n=== sys_logs — recent webhook events (last 30) ===");
  const l = await pool.query(`
    SELECT created_at, level, module, message, metadata
    FROM sys_logs
    WHERE module = 'whatsapp-webhook'
    ORDER BY created_at DESC
    LIMIT 30
  `);
  if (l.rows.length === 0) {
    console.log("⚠️  אין כלל רשומות ב-sys_logs לmodule whatsapp-webhook — הwebhook כנראה לא מגיע לשרת כלל");
  } else {
    l.rows.forEach(r => {
      console.log(`[${r.created_at}] ${r.level} — ${r.message}`);
      if (r.metadata) console.log("  metadata:", JSON.stringify(r.metadata).slice(0, 200));
    });
  }

  console.log("\n=== market_torah_books — last 5 ===");
  const b = await pool.query(`
    SELECT id, sku, source_message_id, market_stage, asking_price, script_type, torah_size, created_at
    FROM market_torah_books ORDER BY created_at DESC LIMIT 5
  `);
  console.table(b.rows);

  await pool.end();
  process.exit(0);
}

// postgres package path
console.log("\n=== user_settings (webhook config) ===");
const settings = await sql`
  SELECT user_id, green_api_id, LEFT(green_api_token,8)||'...' AS token_prefix,
         wa_market_group_id,
         CASE WHEN green_api_id IS NULL OR green_api_id = '' THEN 'MISSING' ELSE 'SET' END AS api_status,
         CASE WHEN wa_market_group_id IS NULL OR wa_market_group_id = '' THEN 'MISSING' ELSE wa_market_group_id END AS group_id_status
  FROM user_settings LIMIT 5
`;
console.table(settings);

console.log("\n=== sys_logs — recent webhook events (last 30) ===");
const logs = await sql`
  SELECT created_at, level, module, message, metadata
  FROM sys_logs
  WHERE module = 'whatsapp-webhook'
  ORDER BY created_at DESC
  LIMIT 30
`;
if (logs.length === 0) {
  console.log("⚠️  אין כלל רשומות ב-sys_logs לmodule whatsapp-webhook");
  console.log("   → הwebhook לא כותב ל-sys_logs (הוא אינו מוגדר לעשות זאת) OR לא הגיע כלל לשרת");
} else {
  logs.forEach(r => {
    console.log(`[${r.created_at}] ${r.level} — ${r.message}`);
    if (r.metadata) console.log("  metadata:", JSON.stringify(r.metadata).slice(0, 300));
  });
}

console.log("\n=== market_torah_books — last 5 rows ===");
const books = await sql`
  SELECT id, sku, source_message_id, market_stage, asking_price, script_type, torah_size, created_at
  FROM market_torah_books ORDER BY created_at DESC LIMIT 5
`;
console.table(books);

await sql.end();
