-- 076: atomic Torah project creation + atomic batch sheet transitions

CREATE OR REPLACE FUNCTION public.torah_create_project_with_sheets(
  p_title text,
  p_scribe_id uuid,
  p_client_id uuid DEFAULT NULL,
  p_target_date date DEFAULT NULL,
  p_total_agreed_price numeric DEFAULT 0,
  p_columns_per_day numeric DEFAULT 0,
  p_qa_weeks_buffer integer DEFAULT 3,
  p_gavra_qa_count integer DEFAULT 1,
  p_computer_qa_count integer DEFAULT 1,
  p_requires_tagging boolean DEFAULT false,
  p_price_per_column numeric DEFAULT 0,
  p_includes_accessories boolean DEFAULT false,
  p_parchment_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_project_id uuid;
  v_prefix text;
  v_i integer;
  v_cols integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'יש להתחבר');
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'שם הפרויקט חובה');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_contacts c
    WHERE c.id = p_scribe_id
      AND c.user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'הסופר שנבחר לא נמצא');
  END IF;

  IF p_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.crm_contacts c
    WHERE c.id = p_client_id
      AND c.user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'הלקוח שנבחר לא נמצא');
  END IF;

  INSERT INTO public.torah_projects (
    user_id,
    scribe_id,
    client_id,
    title,
    status,
    start_date,
    target_date,
    total_agreed_price,
    columns_per_day,
    qa_weeks_buffer,
    gavra_qa_count,
    computer_qa_count,
    requires_tagging,
    price_per_column,
    includes_accessories,
    parchment_type,
    qa_agreed_types
  ) VALUES (
    v_user_id,
    p_scribe_id,
    p_client_id,
    btrim(p_title),
    'writing',
    now()::date,
    p_target_date,
    GREATEST(0, COALESCE(p_total_agreed_price, 0)),
    GREATEST(0, COALESCE(p_columns_per_day, 0)),
    GREATEST(0, COALESCE(p_qa_weeks_buffer, 3)),
    GREATEST(0, COALESCE(p_gavra_qa_count, 1)),
    GREATEST(0, COALESCE(p_computer_qa_count, 1)),
    COALESCE(p_requires_tagging, false),
    GREATEST(0, COALESCE(p_price_per_column, 0)),
    COALESCE(p_includes_accessories, false),
    NULLIF(btrim(COALESCE(p_parchment_type, '')), ''),
    jsonb_build_object(
      'gavra', GREATEST(0, COALESCE(p_gavra_qa_count, 1)),
      'computer', GREATEST(0, COALESCE(p_computer_qa_count, 1))
    )
  )
  RETURNING id INTO v_project_id;

  v_prefix := substring(replace(v_project_id::text, '-', '') from 1 for 6);

  FOR v_i IN 1..62 LOOP
    v_cols := CASE WHEN v_i IN (1, 61, 62) THEN 3 ELSE 4 END;
    INSERT INTO public.torah_sheets (
      project_id,
      sheet_number,
      columns_count,
      sku,
      status
    ) VALUES (
      v_project_id,
      v_i,
      v_cols,
      format('%s-S%s', v_prefix, lpad(v_i::text, 2, '0')),
      'not_started'
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'project_id', v_project_id);
END;
$$;

COMMENT ON FUNCTION public.torah_create_project_with_sheets(
  text, uuid, uuid, date, numeric, numeric, integer, integer, integer, boolean, numeric, boolean, text
) IS 'Atomic: create torah_projects row + all 62 torah_sheets rows.';

GRANT EXECUTE ON FUNCTION public.torah_create_project_with_sheets(
  text, uuid, uuid, date, numeric, numeric, integer, integer, integer, boolean, numeric, boolean, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.torah_create_project_with_sheets(
  text, uuid, uuid, date, numeric, numeric, integer, integer, integer, boolean, numeric, boolean, text
) TO service_role;


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
      (t.status = 'not_started' AND p_to_status IN ('written', 'reported_written')) OR
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
  'Atomic batch status transition for torah_sheets + sys_events logging.';

GRANT EXECUTE ON FUNCTION public.torah_batch_transition_sheets(uuid, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.torah_batch_transition_sheets(uuid, uuid[], text) TO service_role;

NOTIFY pgrst, 'reload schema';
