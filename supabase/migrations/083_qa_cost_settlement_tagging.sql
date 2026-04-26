-- 083: QA batch cost settlement + tagging status

ALTER TABLE torah_qa_batches
  ADD COLUMN IF NOT EXISTS is_cost_settled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settlement_tx_id UUID
    REFERENCES torah_project_transactions(id);

ALTER TABLE torah_projects
  ADD COLUMN IF NOT EXISTS tagging_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (tagging_status IN ('not_required', 'pending', 'in_progress', 'completed'));

UPDATE torah_projects
SET tagging_status = 'pending'
WHERE requires_tagging = TRUE
  AND status NOT IN ('completed', 'delivered')
  AND tagging_status = 'not_required';

UPDATE torah_projects
SET tagging_status = 'completed'
WHERE requires_tagging = TRUE
  AND status IN ('completed', 'delivered')
  AND tagging_status = 'not_required';
