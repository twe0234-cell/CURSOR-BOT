-- 086: torah_payment_schedule_variance ג€” expected vs actual per party

CREATE OR REPLACE VIEW torah_payment_schedule_variance AS
WITH scheduled AS (
  SELECT
    project_id,
    party,
    SUM(CASE WHEN due_date <= CURRENT_DATE THEN amount ELSE 0 END) AS expected_by_now,
    SUM(amount)                                                    AS total_scheduled,
    MIN(CASE WHEN status != 'paid' AND due_date <= CURRENT_DATE
             THEN due_date END)                                    AS earliest_overdue
  FROM torah_payment_schedules
  GROUP BY project_id, party
),
tx AS (
  SELECT
    project_id,
    amount,
    COALESCE(
      transaction_type_code,
      CASE
        WHEN transaction_type IN (
          'client_payment',
          'client_refund',
          'scribe_payment',
          'qa_payment',
          'tagging_payment',
          'sewing_payment',
          'other_expense',
          'internal_transfer',
          'parchment_purchase'
        ) THEN transaction_type
        WHEN transaction_type = 'parchment' THEN 'parchment_purchase'
        WHEN transaction_type = 'qa' THEN 'qa_payment'
        WHEN transaction_type = 'tagging' THEN 'tagging_payment'
        ELSE 'other_expense'
      END
    ) AS transaction_type_key
  FROM torah_project_transactions
),
actual_client AS (
  SELECT project_id, SUM(amount) AS paid
  FROM tx
  WHERE transaction_type_key = 'client_payment'
  GROUP BY project_id
),
actual_scribe AS (
  SELECT project_id, SUM(amount) AS paid
  FROM tx
  WHERE transaction_type_key = 'scribe_payment'
  GROUP BY project_id
)
SELECT
  s.project_id,
  s.party,
  s.total_scheduled,
  s.expected_by_now,
  CASE s.party
    WHEN 'client' THEN COALESCE(ac.paid, 0)
    WHEN 'scribe' THEN COALESCE(asc_.paid, 0)
    ELSE 0
  END AS actual_paid,
  s.expected_by_now
    - CASE s.party
        WHEN 'client' THEN COALESCE(ac.paid, 0)
        WHEN 'scribe' THEN COALESCE(asc_.paid, 0)
        ELSE 0
      END AS variance_amount,
  CASE
    WHEN s.earliest_overdue IS NULL THEN 0
    ELSE (CURRENT_DATE - s.earliest_overdue)
  END AS days_overdue
FROM scheduled s
LEFT JOIN actual_client ac
  ON ac.project_id = s.project_id AND s.party = 'client'
LEFT JOIN actual_scribe asc_
  ON asc_.project_id = s.project_id AND s.party = 'scribe';
