-- 088: torah_calculator_vs_actual ג€” original quote vs actual expenses

CREATE OR REPLACE VIEW torah_calculator_vs_actual AS
SELECT
  tp.id AS project_id,
  tp.title,
  tp.snapshot_locked_at,
  COALESCE((tp.calculator_snapshot ->> 'scribe_total')::NUMERIC, 0)       AS quoted_scribe,
  COALESCE((tp.calculator_snapshot ->> 'parchment_total')::NUMERIC, 0)    AS quoted_parchment,
  COALESCE((tp.calculator_snapshot ->> 'proofreading_total')::NUMERIC, 0) AS quoted_proofreading,
  COALESCE((tp.calculator_snapshot ->> 'tagging_total')::NUMERIC, 0)      AS quoted_tagging,
  COALESCE((tp.calculator_snapshot ->> 'total_cost')::NUMERIC, 0)         AS quoted_total,
  bva.actual_scribe,
  bva.actual_parchment,
  bva.actual_proofreading,
  bva.actual_total_cost,
  bva.actual_scribe
    - COALESCE((tp.calculator_snapshot ->> 'scribe_total')::NUMERIC, 0)       AS scribe_variance,
  bva.actual_parchment
    - COALESCE((tp.calculator_snapshot ->> 'parchment_total')::NUMERIC, 0)    AS parchment_variance,
  bva.actual_proofreading
    - COALESCE((tp.calculator_snapshot ->> 'proofreading_total')::NUMERIC, 0) AS proofreading_variance,
  bva.actual_total_cost
    - COALESCE((tp.calculator_snapshot ->> 'total_cost')::NUMERIC, 0)         AS total_variance
FROM torah_projects tp
LEFT JOIN torah_project_budget_vs_actual bva ON bva.id = tp.id
WHERE tp.calculator_snapshot IS NOT NULL;
