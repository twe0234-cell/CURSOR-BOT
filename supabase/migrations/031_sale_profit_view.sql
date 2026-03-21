-- Dynamic view: realized profit & balance per sale (matches erp_sales + erp_payments ledger)
-- Requires erp_payments with entity_id/entity_type (migration 030) or compatible columns.

CREATE OR REPLACE VIEW public.sale_profit_view
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
) leg ON true;

GRANT SELECT ON public.sale_profit_view TO authenticated;
GRANT SELECT ON public.sale_profit_view TO service_role;
