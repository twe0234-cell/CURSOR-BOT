-- 074: atomic settlement of a Torah payment schedule (ledger + schedule + sys_events)

CREATE OR REPLACE FUNCTION public.torah_mark_payment_schedule_paid(p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_project_id uuid;
  v_party text;
  v_amount numeric(14, 2);
  v_status text;
  v_tx_type text;
  v_notes text;
  v_client_id uuid;
  v_scribe_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'יש להתחבר');
  END IF;

  SELECT
    s.id,
    s.project_id,
    s.party,
    s.amount,
    s.status,
    p.client_id,
    p.scribe_id
  INTO
    v_id,
    v_project_id,
    v_party,
    v_amount,
    v_status,
    v_client_id,
    v_scribe_id
  FROM public.torah_payment_schedules AS s
  INNER JOIN public.torah_projects AS p
    ON p.id = s.project_id AND p.user_id = auth.uid()
  WHERE s.id = p_schedule_id
  FOR UPDATE OF s;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'המועד לא נמצא');
  END IF;

  IF v_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'המועד כבר סומן כשולם');
  END IF;

  IF v_amount IS NULL OR v_amount < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'סכום המועד לא תקין');
  END IF;

  v_tx_type := CASE WHEN v_party = 'scribe' THEN 'scribe_payment' ELSE 'client_payment' END;
  v_notes := format('מועד תשלום · %s', substring(v_id::text, 1, 8));

  INSERT INTO public.torah_project_transactions (
    project_id,
    transaction_type,
    amount,
    date,
    notes,
    receipt_sent,
    attachment_url
  ) VALUES (
    v_project_id,
    v_tx_type,
    v_amount,
    now(),
    v_notes,
    false,
    NULL
  );

  UPDATE public.torah_payment_schedules
  SET status = 'paid'
  WHERE id = p_schedule_id;

  INSERT INTO public.sys_events (
    user_id,
    source,
    entity_type,
    entity_id,
    project_id,
    action,
    from_state,
    to_state,
    metadata
  ) VALUES (
    auth.uid(),
    'torah',
    'torah_payment_schedule',
    p_schedule_id,
    v_project_id,
    'payment_schedule_marked_paid',
    'pending',
    'paid',
    jsonb_build_object(
      'amount', v_amount,
      'party', v_party,
      'transaction_type', v_tx_type
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'project_id', v_project_id,
    'party', v_party,
    'amount', v_amount,
    'client_id', v_client_id,
    'scribe_id', v_scribe_id
  );
END;
$$;

COMMENT ON FUNCTION public.torah_mark_payment_schedule_paid(uuid) IS
  'Atomic: torah_project_transactions insert + payment schedule paid + sys_events.';

GRANT EXECUTE ON FUNCTION public.torah_mark_payment_schedule_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.torah_mark_payment_schedule_paid(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
