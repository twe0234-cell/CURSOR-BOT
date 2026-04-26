-- 097: sys_audit_log - additive audit trail for ERP/Torah business tables.

CREATE TABLE IF NOT EXISTS public.sys_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES auth.users(id),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_value jsonb,
  new_value jsonb,
  changed_at timestamptz NOT NULL DEFAULT now(),
  source text DEFAULT 'trigger'
);

CREATE INDEX IF NOT EXISTS idx_sys_audit_log_table_record_changed_at
  ON public.sys_audit_log (table_name, record_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sys_audit_log_user_changed_at
  ON public.sys_audit_log (user_id, changed_at DESC);

ALTER TABLE public.sys_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sys_audit_log'
      AND policyname = 'sys_audit_log_select_own'
  ) THEN
    CREATE POLICY sys_audit_log_select_own ON public.sys_audit_log
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END;
$$;

GRANT SELECT ON public.sys_audit_log TO authenticated;

CREATE OR REPLACE FUNCTION public.sys_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_record_id uuid;
  v_user_id uuid;
  v_user_text text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_record_id := (v_old ->> 'id')::uuid;
    v_user_text := v_old ->> 'user_id';
  ELSE
    v_new := to_jsonb(NEW);
    v_record_id := (v_new ->> 'id')::uuid;
    v_user_text := v_new ->> 'user_id';

    IF TG_OP = 'UPDATE' THEN
      v_old := to_jsonb(OLD);
      v_user_text := COALESCE(v_user_text, v_old ->> 'user_id');
    END IF;
  END IF;

  IF v_user_text IS NOT NULL AND v_user_text <> '' THEN
    BEGIN
      v_user_id := v_user_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_user_id := NULL;
    END;
  END IF;

  v_user_id := COALESCE(v_user_id, auth.uid());

  INSERT INTO public.sys_audit_log (
    user_id,
    table_name,
    record_id,
    action,
    old_value,
    new_value
  ) VALUES (
    v_user_id,
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    v_old,
    v_new
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  target_table text;
  trigger_name text;
  target_reg regclass;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'erp_sales',
    'erp_payments',
    'erp_investments',
    'torah_projects',
    'torah_project_transactions'
  ]
  LOOP
    target_reg := to_regclass('public.' || target_table);

    IF target_reg IS NOT NULL THEN
      trigger_name := 'trg_sys_audit_' || target_table;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgrelid = target_reg
          AND tgname = trigger_name
      ) THEN
        EXECUTE format(
          'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.sys_audit_trigger()',
          trigger_name,
          target_table
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;
