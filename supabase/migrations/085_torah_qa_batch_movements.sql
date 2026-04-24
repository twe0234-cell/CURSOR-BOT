-- 085: torah_qa_batch_movements ג€” full lifecycle log per QA bag

CREATE TABLE IF NOT EXISTS torah_qa_batch_movements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id       UUID NOT NULL REFERENCES torah_qa_batches(id) ON DELETE CASCADE,
  action         TEXT NOT NULL CHECK (action IN (
    'created',
    'sent_to_computer_qa', 'returned_from_computer_qa',
    'sent_to_gavra_qa',    'returned_from_gavra_qa',
    'sent_to_repair',      'returned_from_repair',
    'sent_to_tagging',     'returned_from_tagging',
    'sent_to_sofer',       'returned_from_sofer',
    'approved',            'voided'
  )),
  direction      TEXT CHECK (direction IN ('out', 'in', 'none')),
  holder_id      UUID REFERENCES crm_contacts(id),
  holder_label   TEXT,
  cost_amount    NUMERIC DEFAULT 0 CHECK (cost_amount >= 0),
  transaction_id UUID REFERENCES torah_project_transactions(id),
  report_url     TEXT,
  notes          TEXT,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qa_movements_batch_date
  ON torah_qa_batch_movements (batch_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_qa_movements_holder
  ON torah_qa_batch_movements (holder_id, occurred_at DESC);

ALTER TABLE torah_qa_batch_movements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'torah_qa_batch_movements'
      AND policyname = 'qa_movements_user_policy'
  ) THEN
    CREATE POLICY qa_movements_user_policy ON torah_qa_batch_movements
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM torah_qa_batches b
          JOIN torah_projects p ON p.id = b.project_id
          WHERE b.id = torah_qa_batch_movements.batch_id
            AND p.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM torah_qa_batches b
          JOIN torah_projects p ON p.id = b.project_id
          WHERE b.id = torah_qa_batch_movements.batch_id
            AND p.user_id = auth.uid()
        )
      );
  END IF;
END;
$$;

CREATE OR REPLACE VIEW torah_qa_batch_current_location AS
SELECT DISTINCT ON (batch_id)
  batch_id,
  action       AS last_action,
  direction    AS last_direction,
  holder_id    AS current_holder_id,
  holder_label AS current_holder_label,
  occurred_at  AS last_movement_at
FROM torah_qa_batch_movements
ORDER BY batch_id, occurred_at DESC;
