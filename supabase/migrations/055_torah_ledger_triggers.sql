-- 055: סנכרון amount_paid_by_client / amount_paid_to_scribe מיומן תנועות (ללא JOIN בכל טעינה)
-- דורש טבלת public.torah_project_transactions (מיגרציה 054).

CREATE OR REPLACE FUNCTION public.sync_torah_project_payments_from_ledger(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client numeric(14, 2);
  v_scribe numeric(14, 2);
BEGIN
  IF p_project_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'client_payment'), 0)::numeric(14, 2),
    COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'scribe_payment'), 0)::numeric(14, 2)
  INTO v_client, v_scribe
  FROM public.torah_project_transactions
  WHERE project_id = p_project_id;

  UPDATE public.torah_projects
  SET
    amount_paid_by_client = v_client,
    amount_paid_to_scribe = v_scribe
  WHERE id = p_project_id;
END;
$$;

COMMENT ON FUNCTION public.sync_torah_project_payments_from_ledger(uuid) IS
  'מעדכן שדות תשלום בפרויקט מתוך סכום client_payment ו-scribe_payment בלבד; fix_deduction וכו׳ נשארים ביומן לחישובי רווחיות באפליקציה.';

CREATE OR REPLACE FUNCTION public.tg_torah_project_transactions_sync_project_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_torah_project_payments_from_ledger(OLD.project_id);
    RETURN OLD;
  END IF;

  PERFORM public.sync_torah_project_payments_from_ledger(NEW.project_id);

  IF TG_OP = 'UPDATE' AND OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    PERFORM public.sync_torah_project_payments_from_ledger(OLD.project_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_torah_transactions_sync_payments ON public.torah_project_transactions;

CREATE TRIGGER trg_torah_transactions_sync_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.torah_project_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_torah_project_transactions_sync_project_payments();

-- סנכרון חד־פעמי לכל הפרויקטים הקיימים
DO $$
DECLARE
  r uuid;
BEGIN
  FOR r IN SELECT id FROM public.torah_projects LOOP
    PERFORM public.sync_torah_project_payments_from_ledger(r);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
