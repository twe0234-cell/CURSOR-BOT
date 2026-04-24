-- 082: torah_project_budget_vs_actual VIEW

CREATE OR REPLACE VIEW torah_project_budget_vs_actual AS
WITH tx AS (
  SELECT
    tpt.project_id,
    tpt.amount,
    COALESCE(
      tpt.transaction_type_code,
      CASE
        WHEN tpt.transaction_type IN (
          'client_payment',
          'client_refund',
          'scribe_payment',
          'qa_payment',
          'tagging_payment',
          'sewing_payment',
          'other_expense',
          'internal_transfer',
          'parchment_purchase'
        ) THEN tpt.transaction_type
        WHEN tpt.transaction_type = 'parchment' THEN 'parchment_purchase'
        WHEN tpt.transaction_type = 'qa' THEN 'qa_payment'
        WHEN tpt.transaction_type = 'tagging' THEN 'tagging_payment'
        ELSE 'other_expense'
      END
    ) AS transaction_type_key
  FROM torah_project_transactions tpt
)
SELECT
  tp.id,
  tp.title,
  tp.status,
  tp.commercial_status,
  tp.production_status,
  COALESCE(tp.total_agreed_price, 0)                       AS contract_price,
  COALESCE(tp.planned_scribe_budget, 0)                   AS planned_scribe,
  COALESCE(tp.planned_parchment_budget, 0)                AS planned_parchment,
  COALESCE(tp.planned_proofreading_budget, 0)             AS planned_proofreading,
  COALESCE(tp.estimated_expenses_total, 0)                AS planned_total_cost,
  COALESCE(SUM(CASE WHEN tx.transaction_type_key = 'scribe_payment'
               THEN tx.amount END), 0)                    AS actual_scribe,
  COALESCE(SUM(CASE WHEN tx.transaction_type_key = 'parchment_purchase'
               THEN tx.amount END), 0)                    AS actual_parchment,
  COALESCE(SUM(CASE WHEN tx.transaction_type_key IN ('qa_payment', 'tagging_payment', 'sewing_payment')
               THEN tx.amount END), 0)                    AS actual_proofreading,
  COALESCE(SUM(CASE WHEN tx.transaction_type_key NOT IN ('client_payment', 'client_refund', 'internal_transfer')
               THEN tx.amount END), 0)                    AS actual_total_cost,
  COALESCE(SUM(CASE WHEN tx.transaction_type_key = 'client_payment'
               THEN tx.amount END), 0)                    AS actual_income,
  COALESCE(SUM(CASE WHEN tx.transaction_type_key = 'client_refund'
               THEN tx.amount END), 0)                    AS actual_refunds,
  COALESCE(tp.total_agreed_price, 0)
    - COALESCE(SUM(CASE WHEN tx.transaction_type_key NOT IN ('client_payment', 'client_refund', 'internal_transfer')
                    THEN tx.amount END), 0)               AS projected_profit,
  COALESCE(SUM(CASE WHEN tx.transaction_type_key = 'client_payment' THEN tx.amount END), 0)
    - COALESCE(SUM(CASE WHEN tx.transaction_type_key = 'client_refund' THEN tx.amount END), 0)
    - COALESCE(SUM(CASE WHEN tx.transaction_type_key NOT IN ('client_payment', 'client_refund', 'internal_transfer')
                    THEN tx.amount END), 0)               AS realized_profit,
  COALESCE(SUM(CASE WHEN tx.transaction_type_key NOT IN ('client_payment', 'client_refund', 'internal_transfer')
               THEN tx.amount END), 0)
    - COALESCE(tp.estimated_expenses_total, 0)            AS cost_variance
FROM torah_projects tp
LEFT JOIN tx ON tx.project_id = tp.id
GROUP BY
  tp.id,
  tp.title,
  tp.status,
  tp.commercial_status,
  tp.production_status,
  tp.total_agreed_price,
  tp.planned_scribe_budget,
  tp.planned_parchment_budget,
  tp.planned_proofreading_budget,
  tp.estimated_expenses_total;
