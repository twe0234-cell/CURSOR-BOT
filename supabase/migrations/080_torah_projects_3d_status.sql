-- 080: torah_projects — מודל סטטוסים תלת-ממדי + VIEW פיננסי
-- ⚠️ ADDITIVE ONLY — status הישן נשאר, שום UI לא נשבר

-- 1. הוספת שני צירים כעמודות (commercial + production)
--    financial_status = VIEW בלבד (לא עמודה — מונע drift)
ALTER TABLE torah_projects
  ADD COLUMN IF NOT EXISTS commercial_status TEXT NOT NULL
    DEFAULT 'contract_signed'
    CHECK (commercial_status IN (
      'lead','quoted','contract_signed','delivered','closed','cancelled'
    )),
  ADD COLUMN IF NOT EXISTS production_status TEXT NOT NULL
    DEFAULT 'not_started'
    CHECK (production_status IN (
      'not_started','writing','sheets_received',
      'in_qa','qa_approved','sewn','delivered'
    ));

-- 2. Backfill מ-status הישן
UPDATE torah_projects SET
  production_status = CASE status
    WHEN 'contract'  THEN 'not_started'
    WHEN 'writing'   THEN 'writing'
    WHEN 'qa'        THEN 'in_qa'
    WHEN 'completed' THEN 'qa_approved'
    WHEN 'delivered' THEN 'delivered'
    ELSE 'not_started'
  END,
  commercial_status = CASE status
    WHEN 'delivered' THEN 'delivered'
    WHEN 'completed' THEN 'delivered'
    ELSE 'contract_signed'
  END;

-- 3. VIEW פיננסי — financial_status מחושב מ-transactions (לא נשמר)
CREATE OR REPLACE VIEW torah_projects_with_financials AS
SELECT
  tp.*,
  COALESCE(paid.total_paid, 0)           AS client_total_paid,
  COALESCE(scheduled.total_scheduled, 0) AS client_total_scheduled,
  CASE
    WHEN COALESCE(paid.total_paid, 0) = 0
      THEN 'no_payment'
    WHEN COALESCE(paid.total_paid, 0) >= COALESCE(tp.total_agreed_price, 0)
      THEN 'fully_paid'
    WHEN COALESCE(paid.total_paid, 0) > 0
      THEN 'partially_paid'
    ELSE 'no_payment'
  END AS financial_status
FROM torah_projects tp
LEFT JOIN (
  SELECT project_id, SUM(amount) AS total_paid
  FROM torah_project_transactions
  WHERE transaction_type = 'client_payment'
  GROUP BY project_id
) paid ON paid.project_id = tp.id
LEFT JOIN (
  SELECT project_id, SUM(amount) AS total_scheduled
  FROM torah_payment_schedules
  WHERE party = 'client'
  GROUP BY project_id
) scheduled ON scheduled.project_id = tp.id;
