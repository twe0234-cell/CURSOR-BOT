/**
 * מריץ מיגרציית יישור erp_payments + יצירת sale_profit_view.
 * דורש DATABASE_URL (או POSTGRES_URL / SUPABASE_DB_URL / DIRECT_URL) ב-.env.local
 * — מחרוזת Postgres מלאה מ-Supabase → הגדרות → Database → Connection string (URI).
 */
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.DIRECT_URL ||
  process.env.POSTGRES_PRISMA_URL;

const SQL_STEPS = [
  `DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'erp_payments' AND column_name = 'target_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'erp_payments' AND column_name = 'entity_id'
  ) THEN
    ALTER TABLE public.erp_payments RENAME COLUMN target_id TO entity_id;
    ALTER TABLE public.erp_payments RENAME COLUMN target_type TO entity_type;
  END IF;
END $$;`,
  `ALTER TABLE public.erp_payments ADD COLUMN IF NOT EXISTS method TEXT;`,
  `ALTER TABLE public.erp_payments ADD COLUMN IF NOT EXISTS direction TEXT;`,
  `UPDATE public.erp_payments SET direction = 'incoming' WHERE direction IS NULL;`,
  `ALTER TABLE public.erp_payments ALTER COLUMN direction SET DEFAULT 'incoming';`,
  `ALTER TABLE public.erp_payments ALTER COLUMN direction SET NOT NULL;`,
  `ALTER TABLE public.erp_payments DROP CONSTRAINT IF EXISTS erp_payments_direction_check;`,
  `ALTER TABLE public.erp_payments ADD CONSTRAINT erp_payments_direction_check
   CHECK (direction IN ('incoming', 'outgoing'));`,
  `DROP INDEX IF EXISTS idx_erp_payments_user_target;`,
  `CREATE INDEX IF NOT EXISTS idx_erp_payments_user_entity
   ON public.erp_payments(user_id, entity_type, entity_id);`,
  `ALTER TABLE public.erp_sales ADD COLUMN IF NOT EXISTS actual_commission_received NUMERIC(12, 2);`,
  `UPDATE public.erp_sales SET actual_commission_received = commission_received
   WHERE actual_commission_received IS NULL AND commission_received IS NOT NULL;`,
  `CREATE OR REPLACE VIEW public.sale_profit_view
WITH (security_invoker = true) AS
SELECT
  s.id AS sale_id,
  s.user_id,
  lt.line_total AS total_price,
  s.cost_price AS cost,
  COALESCE(s.amount_paid, 0) + COALESCE(leg.sum_signed, 0) AS total_paid,
  CASE
    WHEN s.cost_price IS NULL THEN NULL::numeric
    WHEN COALESCE(s.amount_paid, 0) + COALESCE(leg.sum_signed, 0) <= s.cost_price THEN 0::numeric
    ELSE COALESCE(s.amount_paid, 0) + COALESCE(leg.sum_signed, 0) - s.cost_price
  END AS realized_profit,
  lt.line_total - (COALESCE(s.amount_paid, 0) + COALESCE(leg.sum_signed, 0)) AS remaining_balance
FROM public.erp_sales s
CROSS JOIN LATERAL (
  SELECT COALESCE(s.total_price, s.sale_price * GREATEST(1, COALESCE(s.quantity, 1))) AS line_total
) lt
LEFT JOIN LATERAL (
  SELECT SUM(
    CASE
      WHEN COALESCE(p.direction, 'incoming') = 'outgoing' THEN -p.amount
      ELSE p.amount
    END
  ) AS sum_signed
  FROM public.erp_payments p
  WHERE p.entity_id = s.id
    AND p.entity_type = 'sale'
) leg ON true;`,
  `GRANT SELECT ON public.sale_profit_view TO authenticated;`,
  `GRANT SELECT ON public.sale_profit_view TO service_role;`,
];

async function main() {
  if (!connectionString) {
    console.error(
      "חסר DATABASE_URL (או POSTGRES_URL / SUPABASE_DB_URL). הוסף מ-.env.local את מחרוזת ה-Postgres מהדאשבורד של Supabase."
    );
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString,
    ssl: /supabase\.co|pooler\.supabase\.com/i.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  });

  await client.connect();
  try {
    for (const sql of SQL_STEPS) {
      try {
        await client.query(sql);
      } catch (e) {
        if (sql.includes("SET NOT NULL") && e && String(e.message).includes("null value")) {
          await client.query(`UPDATE public.erp_payments SET direction = 'incoming' WHERE direction IS NULL;`);
          await client.query(sql);
        } else if (sql.includes("security_invoker")) {
          const fallback = sql.replace(/\s*WITH\s*\(\s*security_invoker\s*=\s*true\s*\)\s*/i, " ");
          await client.query(fallback);
        } else {
          throw e;
        }
      }
    }
    console.log("בוצע: sale_profit_view + יישור erp_payments.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
