-- 095: business_exceptions ג€” unified alerts view

CREATE OR REPLACE VIEW business_exceptions AS
SELECT
  'pace_behind'::TEXT AS exception_type,
  'error'::TEXT AS severity,
  pa.project_id AS entity_id,
  'torah_project'::TEXT AS entity_type,
  pa.title AS entity_label,
  format('פיגור %s עמודות בכתיבה', pa.columns_behind) AS message,
  jsonb_build_object(
    'columns_behind', pa.columns_behind,
    'pace_status', pa.pace_status
  ) AS meta,
  now() AS detected_at
FROM torah_project_pace_analysis pa
WHERE pa.pace_status IN ('behind', 'at_risk')

UNION ALL

SELECT
  'collection_overdue'::TEXT,
  CASE WHEN psv.days_overdue > 30 THEN 'error' ELSE 'warning' END,
  psv.project_id,
  'torah_project'::TEXT,
  tp.title,
  format('%s₪ בפיגור %s ימים מהלקוח', psv.variance_amount::INTEGER, psv.days_overdue),
  jsonb_build_object(
    'variance_amount', psv.variance_amount,
    'days_overdue', psv.days_overdue,
    'party', psv.party
  ),
  now()
FROM torah_payment_schedule_variance psv
JOIN torah_projects tp ON tp.id = psv.project_id
WHERE psv.party = 'client'
  AND psv.variance_amount > 0
  AND psv.days_overdue > 7

UNION ALL

SELECT
  'budget_overrun'::TEXT,
  CASE
    WHEN bva.cost_variance > bva.planned_total_cost * 0.25 THEN 'error'
    ELSE 'warning'
  END,
  bva.id,
  'torah_project'::TEXT,
  bva.title,
  format(
    'חריגת עלות: %s₪ (+%s%%)',
    bva.cost_variance::INTEGER,
    ((bva.cost_variance / NULLIF(bva.planned_total_cost, 0)) * 100)::INTEGER
  ),
  jsonb_build_object(
    'cost_variance', bva.cost_variance,
    'planned_total_cost', bva.planned_total_cost,
    'actual_total_cost', bva.actual_total_cost
  ),
  now()
FROM torah_project_budget_vs_actual bva
WHERE bva.cost_variance > bva.planned_total_cost * 0.10
  AND bva.planned_total_cost > 0

UNION ALL

SELECT
  'scribe_debt_overdue'::TEXT,
  'warning'::TEXT,
  psv.project_id,
  'torah_project'::TEXT,
  tp.title,
  format('חוב לסופר: %s₪ בפיגור %s ימים', psv.variance_amount::INTEGER, psv.days_overdue),
  jsonb_build_object(
    'variance_amount', psv.variance_amount,
    'days_overdue', psv.days_overdue
  ),
  now()
FROM torah_payment_schedule_variance psv
JOIN torah_projects tp ON tp.id = psv.project_id
WHERE psv.party = 'scribe'
  AND psv.variance_amount > 0
  AND psv.days_overdue > 14

UNION ALL

SELECT
  'sale_unpaid'::TEXT,
  'warning'::TEXT,
  s.id,
  'erp_sale'::TEXT,
  COALESCE(s.item_description, s.sale_type),
  format(
    'מכירה לא שולמה: %s₪ מתוך %s₪',
    (s.total_price - COALESCE(p.total_paid, 0))::INTEGER,
    s.total_price::INTEGER
  ),
  jsonb_build_object(
    'unpaid_amount', s.total_price - COALESCE(p.total_paid, 0),
    'total_price', s.total_price
  ),
  now()
FROM erp_sales s
LEFT JOIN (
  SELECT entity_id, SUM(amount) AS total_paid
  FROM erp_payments
  WHERE entity_type = 'sale'
    AND direction = 'incoming'
  GROUP BY entity_id
) p ON p.entity_id = s.id
WHERE s.status NOT IN ('נמכר', 'sold', 'cancelled', 'paid')
  AND (s.total_price - COALESCE(p.total_paid, 0)) > 0;
