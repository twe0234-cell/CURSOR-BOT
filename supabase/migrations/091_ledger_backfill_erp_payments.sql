-- 091: backfill ledger_entries from erp_payments

INSERT INTO ledger_entries (
  user_id,
  entry_date,
  direction,
  amount,
  category,
  source_type,
  source_id,
  deal_type,
  sale_id,
  investment_id,
  notes,
  created_at
)
SELECT
  ep.user_id,
  ep.payment_date::DATE,
  CASE ep.direction
    WHEN 'incoming' THEN 'in'
    WHEN 'outgoing' THEN 'out'
    ELSE 'in'
  END,
  ep.amount,
  CASE
    WHEN ep.entity_type = 'sale' AND ep.direction = 'incoming' THEN 'sale_income'
    WHEN ep.entity_type = 'sale' AND ep.direction = 'outgoing' THEN 'other_expense'
    WHEN ep.entity_type = 'investment' THEN 'investment_payment'
    ELSE 'other_expense'
  END,
  'erp_payment',
  ep.id,
  COALESCE(s.deal_type, i.deal_type),
  CASE WHEN ep.entity_type = 'sale' THEN ep.entity_id END,
  CASE WHEN ep.entity_type = 'investment' THEN ep.entity_id END,
  ep.notes,
  ep.created_at
FROM erp_payments ep
LEFT JOIN erp_sales s
  ON s.id = ep.entity_id
 AND ep.entity_type = 'sale'
LEFT JOIN erp_investments i
  ON i.id = ep.entity_id
 AND ep.entity_type = 'investment'
WHERE NOT EXISTS (
  SELECT 1
  FROM ledger_entries le
  WHERE le.source_type = 'erp_payment'
    AND le.source_id = ep.id
);
