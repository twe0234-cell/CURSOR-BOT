-- 089: tagging cost per column + auto-transaction trigger

ALTER TABLE torah_projects
  ADD COLUMN IF NOT EXISTS tagging_cost_per_column NUMERIC NOT NULL DEFAULT 30
    CHECK (tagging_cost_per_column >= 0),
  ADD COLUMN IF NOT EXISTS tagger_contact_id UUID REFERENCES crm_contacts(id);

CREATE OR REPLACE FUNCTION public.create_tagging_cost_tx()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_columns INTEGER;
  v_cost NUMERIC;
BEGIN
  IF NEW.tagging_status = 'completed'
     AND NEW.requires_tagging = TRUE
     AND (OLD.tagging_status IS NULL OR OLD.tagging_status != 'completed')
  THEN
    SELECT COALESCE(SUM(columns_count), 245)
    INTO v_total_columns
    FROM torah_sheets
    WHERE project_id = NEW.id;

    v_cost := v_total_columns * NEW.tagging_cost_per_column;

    IF NOT EXISTS (
      SELECT 1
      FROM torah_project_transactions
      WHERE project_id = NEW.id
        AND COALESCE(transaction_type_code, transaction_type) = 'tagging_payment'
    ) THEN
      INSERT INTO torah_project_transactions (
        project_id,
        transaction_type,
        transaction_type_code,
        amount,
        date,
        notes
      ) VALUES (
        NEW.id,
        'tagging_payment',
        'tagging_payment',
        v_cost,
        now(),
        format('תיוג אוטומטי: %s עמודות × %s ₪', v_total_columns, NEW.tagging_cost_per_column)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tagging_cost_auto ON torah_projects;
CREATE TRIGGER trg_tagging_cost_auto
  AFTER UPDATE OF tagging_status ON torah_projects
  FOR EACH ROW
  EXECUTE FUNCTION create_tagging_cost_tx();
