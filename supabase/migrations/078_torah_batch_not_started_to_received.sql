-- 078: allow not_started → received (קליטת מחסן / עדכון המוני בלי שלב «דווח נכתב»)

CREATE OR REPLACE FUNCTION public.torah_batch_transition_sheets(
  p_project_id uuid,
  p_sheet_ids uuid[],
  p_to_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_missing_count integer;
  v_bad_from text;
  v_updated integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'יש להתחבר');
  END IF;

  IF p_sheet_ids IS NULL OR cardinality(p_sheet_ids) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'לא נבחרו יריעות');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.torah_projects p
    WHERE p.id = p_project_id
      AND p.user_id = v_user_id
  ) THEN
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
  SELECT t.status
  INTO v_bad_from
  FROM target_rows t
  WHERE t.status <> p_to_status
    AND NOT (
      (t.status = 'not_started' AND p_to_status IN ('written', 'reported_written', 'received')) OR
      (t.status = 'written' AND p_to_status IN ('reported_written', 'received', 'in_qa')) OR
      (t.status = 'reported_written' AND p_to_status = 'received') OR
      (t.status = 'received' AND p_to_status = 'in_qa') OR
      (t.status = 'needs_fixing' AND p_to_status IN ('reported_written', 'in_qa', 'approved')) OR
      (t.status = 'in_qa' AND p_to_status IN ('approved', 'needs_fixing')) OR
      (t.status = 'approved' AND p_to_status = 'sewn')
    )
  LIMIT 1;

  IF v_bad_from IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('מעבר לא חוקי: %s → %s', v_bad_from, p_to_status)
    );
  END IF;

  WITH before_rows AS (
    SELECT s.id, s.status AS from_state
    FROM public.torah_sheets s
    WHERE s.project_id = p_project_id
      AND s.id = ANY(p_sheet_ids)
      AND s.status <> p_to_status
    FOR UPDATE
  ), changed AS (
    UPDATE public.torah_sheets s
    SET status = p_to_status
    FROM before_rows b
    WHERE s.id = b.id
    RETURNING s.id
  ), ev AS (
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
      b.id,
      p_project_id,
      'sheet_status_changed',
      b.from_state,
      p_to_status
    FROM before_rows b
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM changed;

  RETURN jsonb_build_object('ok', true, 'updated', COALESCE(v_updated, 0));
END;
$$;

COMMENT ON FUNCTION public.torah_batch_transition_sheets(uuid, uuid[], text) IS
  'Atomic batch status transition for torah_sheets + sys_events logging. Allows not_started→received for warehouse shortcut.';

GRANT EXECUTE ON FUNCTION public.torah_batch_transition_sheets(uuid, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.torah_batch_transition_sheets(uuid, uuid[], text) TO service_role;

NOTIFY pgrst, 'reload schema';
