/**
 * Shows distinct group chatIds seen by the webhook + frequency
 */
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

console.log("\n🔴 CONFIGURED group in user_settings:");
const cfg = await pool.query(`SELECT wa_market_group_id FROM user_settings LIMIT 1`);
console.log("  →", cfg.rows[0]?.wa_market_group_id ?? "NULL");

console.log("\n📊 Distinct chatIds seen in webhook logs (last 7 days, sorted by frequency):");
const counts = await pool.query(`
  SELECT 
    metadata->>'chatId' AS chat_id,
    COUNT(*) AS hits,
    MAX(created_at) AS last_seen
  FROM sys_logs
  WHERE module = 'whatsapp-webhook'
    AND message = 'chatId mismatch - ignoring'
    AND created_at > NOW() - INTERVAL '7 days'
  GROUP BY metadata->>'chatId'
  ORDER BY hits DESC
  LIMIT 20
`);

if (counts.rows.length === 0) {
  console.log("  No mismatch logs found");
} else {
  console.table(counts.rows);
  console.log("\n💡 כנראה הקבוצה הנכונה היא זו שמופיעה הכי הרבה פעמים.");
  console.log("   עדכן את wa_market_group_id להיות אחד מה-chat_id האלה.");
}

await pool.end();
