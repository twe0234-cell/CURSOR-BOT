-- 084: get_net_worth_snapshot() ג€” business net worth snapshot

CREATE OR REPLACE FUNCTION public.get_net_worth_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_inventory_cost_value     NUMERIC := 0;
  v_open_projects_receivable NUMERIC := 0;
  v_open_sales_receivable    NUMERIC := 0;
  v_realized_profit_total    NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(cost_price), 0)
  INTO v_inventory_cost_value
  FROM inventory
  WHERE status NOT IN ('sold', 'נמכר');

  SELECT COALESCE(SUM(GREATEST(total_agreed_price - client_total_paid, 0)), 0)
  INTO v_open_projects_receivable
  FROM torah_projects_with_financials
  WHERE status NOT IN ('delivered');

  SELECT COALESCE(SUM(GREATEST(s.total_price - COALESCE(p.total_paid, 0), 0)), 0)
  INTO v_open_sales_receivable
  FROM erp_sales s
  LEFT JOIN (
    SELECT entity_id, SUM(amount) AS total_paid
    FROM erp_payments
    WHERE entity_type = 'sale'
      AND direction = 'incoming'
    GROUP BY entity_id
  ) p ON p.entity_id = s.id
  WHERE s.status NOT IN ('נמכר', 'sold', 'cancelled', 'paid');

  SELECT COALESCE(SUM(CASE WHEN ledger_type = 'PROFIT' THEN amount ELSE 0 END), 0)
  INTO v_realized_profit_total
  FROM erp_profit_ledger;

  RETURN jsonb_build_object(
    'snapshot_at', now(),
    'inventory_cost_value', v_inventory_cost_value,
    'open_projects_receivable', v_open_projects_receivable,
    'open_sales_receivable', v_open_sales_receivable,
    'realized_profit_total', v_realized_profit_total,
    'net_worth_estimate', (
      v_inventory_cost_value
      + v_open_projects_receivable
      + v_open_sales_receivable
      + v_realized_profit_total
    )
  );
END;
$$;
