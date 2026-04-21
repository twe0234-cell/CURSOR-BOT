-- 077: atomic receive sheets from scribe (status transition + CRM history)

CREATE OR REPLACE FUNCTION public.torah_receive_sheets_from_scribe_atomic(
  p_project_id uuid,
  p_sheet_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_scribe_id uuid;
  v_missing_count integer;
  v_invalid_count integer;
  v_updated integer;
  v_sheet_numbers text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'יש להתחבר');
  END IF;

  IF p_sheet_ids IS NULL OR cardinality(p_sheet_ids) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'בחר לפחות יריעה אחת');
  END IF;

  SELECT p.scribe_id
  INTO v_scribe_id
  FROM public.torah_projects p
  WHERE p.id = p_project_id
    AND p.user_id = v_user_id;

  IF v_scribe_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'הפרויקט לא נמצא');
  END IF;

  WITH dedup AS (
    SELECT DISTINCT x.id
    FROM unnest(p_sheet_ids) AS x(id)
  )
  SELECT COUNT(*)
  INTO v_missing_count
  FROM dedup d
  LEFT JOIN public.torah_sheets s
    ON s.id = d.id
   AND s.project_id = p_project_id
  WHERE s.id IS NULL;

  IF v_missing_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'לא כל היריעות שייכות לפרויקט');
  END IF;

  WITH target_rows AS (
    SELECT s.id, s.status
    FROM public.torah_sheets s
    WHERE s.project_id = p_project_id
      AND s.id = ANY(p_sheet_ids)
    FOR UPDATE
  )
  SELECT COUNT(*)
  INTO v_invalid_count
  FROM target_rows
  WHERE status NOT IN ('not_started', 'needs_fixing');

  IF v_invalid_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'ניתן לקלוט רק יריעות בסטטוס «טרם התחיל» או «לתיקון»'
    );
  END IF;

  WITH before_rows AS (
    SELECT s.id, s.sheet_number, s.status AS from_state
    FROM public.torah_sheets s
    WHERE s.project_id = p_project_id
      AND s.id = ANY(p_sheet_ids)
      AND s.status <> 'reported_written'
    FOR UPDATE
  ), changed AS (
    UPDATE public.torah_sheets s
    SET status = 'reported_written'
    FROM before_rows b
    WHERE s.id = b.id
    RETURNING s.id, b.sheet_number, b.from_state
  ), events AS (
    INSERT INTO public.sys_events (
      user_id,
      source,
      entity_type,
      entity_id,
      project_id,
      action,
      from_state,
      to_state
    )
    SELECT
      v_user_id,
      'torah',
      'torah_sheet',
      c.id,
      p_project_id,
      'sheet_status_changed',
      c.from_state,
      'reported_written'
    FROM changed c
    RETURNING 1
  ), nums AS (
    SELECT string_agg(c.sheet_number::text, ', ' ORDER BY c.sheet_number) AS numbers
    FROM changed c
  )
  SELECT
    COALESCE((SELECT COUNT(*) FROM changed), 0),
    COALESCE((SELECT numbers FROM nums), '')
  INTO v_updated, v_sheet_numbers;

  INSERT INTO public.crm_contact_history (
    user_id,
    contact_id,
    body,
    direction,
    source,
    metadata
  ) VALUES (
    v_user_id,
    v_scribe_id,
    format('קליטת יריעות מהסופר — יריעות: %s', v_sheet_numbers),
    'internal',
    'system',
    jsonb_build_object(
      'kind', 'torah_receive_sheets',
      'project_id', p_project_id,
      'sheet_ids', p_sheet_ids
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'updated', v_updated,
    'scribe_id', v_scribe_id,
    'sheet_numbers', v_sheet_numbers
  );
END;
$$;

COMMENT ON FUNCTION public.torah_receive_sheets_from_scribe_atomic(uuid, uuid[]) IS
  'Atomic: validate + status transition to reported_written + sys_events + crm_contact_history.';

GRANT EXECUTE ON FUNCTION public.torah_receive_sheets_from_scribe_atomic(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.torah_receive_sheets_from_scribe_atomic(uuid, uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
