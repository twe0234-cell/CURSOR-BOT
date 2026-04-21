-- 075: Torah financial health — planned budgets, estimated expenses, sales collection dates,
--       and invoker-security views for aggregate dashboard queries.

-- ── Torah project: explicit budgets & total estimated expenses (overrides snapshot heuristics) ──
ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS planned_parchment_budget NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS planned_scribe_budget NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS planned_proofreading_budget NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS estimated_expenses_total NUMERIC(14, 2);

COMMENT ON COLUMN public.torah_projects.planned_parchment_budget IS 'תקציב קלף מתוכנן (₪) — השוואה ל־parchment_expense ביומן';
COMMENT ON COLUMN public.torah_projects.planned_scribe_budget IS 'תקציב סופר מתוכנן (₪) — השוואה ל־scribe_payment ביומן';
COMMENT ON COLUMN public.torah_projects.planned_proofreading_budget IS 'תקציב הגהות מתוכנן (₪) — השוואה ל־qa_expense ביומן';
COMMENT ON COLUMN public.torah_projects.estimated_expenses_total IS 'סה״כ עלויות מתוכננות (סופר/הגהות/שונות) לרווח תיאורטי; דוחף על פריסה מהצילום כשמלא';

-- ── ERP sales: expected collection month for Torah / CRM cashflow chart ──
ALTER TABLE public.erp_sales
  ADD COLUMN IF NOT EXISTS expected_payment_date DATE;

COMMENT ON COLUMN public.erp_sales.expected_payment_date IS 'תאריך צפוי לגביית יתרה (תרשים תזרים צפוי)';

-- ── Aggregates: ledger cash-in / cash-out per user (includes parchment_expense in outflow) ──
CREATE OR REPLACE VIEW public.v_torah_user_ledger_cashflow
WITH (security_invoker = true) AS
SELECT
  p.user_id,
  COALESCE(
    SUM(
      CASE WHEN t.transaction_type = 'client_payment' THEN t.amount ELSE 0::numeric END
    ),
    0::numeric
  ) AS cash_in,
  COALESCE(
    SUM(
      CASE
        WHEN t.transaction_type IN (
          'scribe_payment',
          'fix_deduction',
          'qa_expense',
          'parchment_expense',
          'other_expense'
        )
          THEN t.amount
        ELSE 0::numeric
      END
    ),
    0::numeric
  ) AS cash_out
FROM public.torah_projects p
LEFT JOIN public.torah_project_transactions t ON t.project_id = p.id
GROUP BY p.user_id;

COMMENT ON VIEW public.v_torah_user_ledger_cashflow IS
  'Torah ledger aggregates per user — cash_in = client_payment; cash_out includes parchment_expense';

-- ── Contract rollups (column estimated_expenses_total only; snapshot handled in app) ──
CREATE OR REPLACE VIEW public.v_torah_user_contract_rollups
WITH (security_invoker = true) AS
SELECT
  user_id,
  COALESCE(SUM(total_agreed_price), 0::numeric) AS contract_sum,
  COALESCE(SUM(COALESCE(estimated_expenses_total, 0::numeric)), 0::numeric) AS estimated_expenses_column_sum
FROM public.torah_projects
GROUP BY user_id;

COMMENT ON VIEW public.v_torah_user_contract_rollups IS
  'Sum of Torah total_agreed_price and explicit estimated_expenses_total per user';

GRANT SELECT ON public.v_torah_user_ledger_cashflow TO authenticated, service_role;
GRANT SELECT ON public.v_torah_user_contract_rollups TO authenticated, service_role;

-- ── Expected monthly collections (remaining balance) from erp_sales.expected_payment_date ──
CREATE OR REPLACE FUNCTION public.get_torah_sales_collection_projection(p_months integer DEFAULT 18)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      date_trunc('month', CURRENT_DATE::timestamp WITH TIME ZONE) AS start_m,
      date_trunc('month', CURRENT_DATE::timestamp WITH TIME ZONE)
        + (GREATEST(COALESCE(p_months, 18), 1)::text || ' months')::interval AS end_m
  ),
  sales AS (
    SELECT
      date_trunc('month', s.expected_payment_date::timestamp WITH TIME ZONE)::date AS bucket,
      GREATEST(
        0::numeric,
        COALESCE(
          s.total_price,
          s.sale_price * GREATEST(1, floor(COALESCE(s.quantity, 1)::numeric))
        ) - COALESCE(s.amount_paid, 0::numeric)
      ) AS remaining
    FROM public.erp_sales s
    CROSS JOIN bounds b
    WHERE s.user_id = auth.uid()
      AND s.expected_payment_date IS NOT NULL
      AND date_trunc('month', s.expected_payment_date::timestamp WITH TIME ZONE) >= b.start_m
      AND date_trunc('month', s.expected_payment_date::timestamp WITH TIME ZONE) < b.end_m
  ),
  rolled AS (
    SELECT bucket, SUM(remaining)::numeric AS expected_amount
    FROM sales
    GROUP BY bucket
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'month', to_char(bucket, 'YYYY-MM'),
        'expected_amount', expected_amount
      )
      ORDER BY bucket
    ),
    '[]'::jsonb
  )
  FROM rolled;
$$;

COMMENT ON FUNCTION public.get_torah_sales_collection_projection(integer) IS
  'Buckets remaining sale balance by calendar month of expected_payment_date (RLS via auth.uid())';

GRANT EXECUTE ON FUNCTION public.get_torah_sales_collection_projection(integer) TO authenticated, service_role;
