-- 099: Tenant-safe Torah financial snapshot source for /dashboard/erp
-- Additive only: creates a read model view with explicit user_id for filtering.

CREATE OR REPLACE VIEW public.torah_financial_dashboard_snapshot
WITH (security_invoker = true) AS
SELECT
  tp.user_id,
  bva.id AS project_id,
  bva.title AS project_label,
  COALESCE(client.name, 'ללא לקוח') AS customer_label,
  bva.commercial_status,
  bva.production_status,
  COALESCE(bva.contract_price, 0::numeric) AS contract_amount,
  GREATEST(
    0::numeric,
    COALESCE(bva.actual_income, 0::numeric) - COALESCE(bva.actual_refunds, 0::numeric)
  ) AS received_amount,
  COALESCE(bva.actual_total_cost, 0::numeric) AS actual_cost,
  COALESCE(bva.projected_profit, 0::numeric) AS expected_profit,
  COALESCE(bva.realized_profit, 0::numeric) AS realized_profit,
  CASE
    WHEN COALESCE(bva.contract_price, 0::numeric) <= 0::numeric THEN 'no_contract'
    WHEN (COALESCE(bva.actual_income, 0::numeric) - COALESCE(bva.actual_refunds, 0::numeric))
      >= COALESCE(bva.contract_price, 0::numeric) THEN 'collected'
    WHEN (COALESCE(bva.actual_income, 0::numeric) - COALESCE(bva.actual_refunds, 0::numeric))
      > 0::numeric THEN 'partial_collection'
    ELSE 'uncollected'
  END AS cashflow_status
FROM public.torah_project_budget_vs_actual bva
JOIN public.torah_projects tp
  ON tp.id = bva.id
LEFT JOIN public.crm_contacts client
  ON client.id = tp.client_id
ORDER BY bva.title;

COMMENT ON VIEW public.torah_financial_dashboard_snapshot IS
  'Tenant-safe Torah project financial snapshot for ERP dashboard with explicit user_id and status fields';

GRANT SELECT ON public.torah_financial_dashboard_snapshot TO authenticated, service_role;
