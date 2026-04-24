-- 087: torah_project_pace_analysis ג€” required vs actual writing pace

CREATE OR REPLACE VIEW torah_project_pace_analysis AS
WITH sheet_progress AS (
  SELECT
    project_id,
    SUM(columns_count) FILTER (
      WHERE status IN (
        'written', 'reported_written', 'received', 'in_qa',
        'needs_fixing', 'approved', 'sewn'
      )
    ) AS columns_written,
    SUM(columns_count) AS columns_total
  FROM torah_sheets
  GROUP BY project_id
)
SELECT
  tp.id AS project_id,
  tp.title,
  tp.start_date,
  tp.target_date,
  COALESCE(tp.columns_per_day, 0) AS required_pace,
  COALESCE(sp.columns_total, 245) AS columns_total,
  COALESCE(sp.columns_written, 0) AS columns_written,
  GREATEST((CURRENT_DATE - COALESCE(tp.start_date, CURRENT_DATE)), 0) AS days_since_start,
  CASE
    WHEN GREATEST((CURRENT_DATE - COALESCE(tp.start_date, CURRENT_DATE)), 0) > 0
      THEN COALESCE(sp.columns_written, 0)::NUMERIC
        / GREATEST((CURRENT_DATE - COALESCE(tp.start_date, CURRENT_DATE)), 1)
    ELSE 0
  END AS actual_pace,
  COALESCE(tp.columns_per_day, 0) * GREATEST((CURRENT_DATE - COALESCE(tp.start_date, CURRENT_DATE)), 0)
    AS expected_columns_by_now,
  (COALESCE(tp.columns_per_day, 0) * GREATEST((CURRENT_DATE - COALESCE(tp.start_date, CURRENT_DATE)), 0))
    - COALESCE(sp.columns_written, 0) AS columns_behind,
  CASE
    WHEN tp.target_date IS NULL THEN 'no_deadline'
    WHEN COALESCE(tp.columns_per_day, 0) = 0 THEN 'no_pace_set'
    WHEN COALESCE(sp.columns_written, 0) >= COALESCE(sp.columns_total, 245) THEN 'completed'
    WHEN (COALESCE(tp.columns_per_day, 0) * GREATEST((CURRENT_DATE - COALESCE(tp.start_date, CURRENT_DATE)), 0))
         - COALESCE(sp.columns_written, 0) > (COALESCE(tp.columns_per_day, 0) * 7)
      THEN 'at_risk'
    WHEN (COALESCE(tp.columns_per_day, 0) * GREATEST((CURRENT_DATE - COALESCE(tp.start_date, CURRENT_DATE)), 0))
         - COALESCE(sp.columns_written, 0) > 0
      THEN 'behind'
    ELSE 'on_track'
  END AS pace_status
FROM torah_projects tp
LEFT JOIN sheet_progress sp ON sp.project_id = tp.id
WHERE tp.status NOT IN ('delivered', 'completed');
