-- 069: Torah Production Engine — Phase 2 (schema foundation)
--   • sys_events — ציר זמן גלובלי למעברי מצב (לא רק עדכון שדות טקסט)
--   • torah_projects.calculator_snapshot — צילום מחירים מהמחשבון בעת חתימה/יצירה
--   • torah_sheets — הרחבת מצבי יריעה (מכונה מצבית: דווח → התקבל → …) תוך שמירה על "written" לגירסאות קיימות
--   • torah_qa_batches.checker_id — בודק (איש קשר) נפרד מהמגיה/ספק כשצריך
--   • torah_fix_tasks — לולאת תיקונים עם קישור ליריעה ולסבב הגהה
--   • torah_project_transactions — FK אופציונלי לסבב הגהה / משימת תיקון (מעקב P&L)
--
-- הערה: אין טבלת torah_pages — יחידת העבודה היא torah_sheets (62 יריעות); עמודות נספרות ב-columns_count.

-- ── 1) sys_events — אירועי דומיין (מאוחדים, לא מקבילים ל-sys_logs) ─────────
CREATE TABLE IF NOT EXISTS public.sys_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source          TEXT NOT NULL DEFAULT 'torah',
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  project_id      UUID REFERENCES public.torah_projects(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,
  from_state      TEXT,
  to_state        TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sys_events_user_created
  ON public.sys_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sys_events_project_created
  ON public.sys_events(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sys_events_entity
  ON public.sys_events(entity_type, entity_id);

ALTER TABLE public.sys_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sys_events_select_own" ON public.sys_events;
CREATE POLICY "sys_events_select_own" ON public.sys_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "sys_events_insert_own" ON public.sys_events;
CREATE POLICY "sys_events_insert_own" ON public.sys_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sys_events_update_own" ON public.sys_events;
CREATE POLICY "sys_events_update_own" ON public.sys_events
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sys_events_delete_own" ON public.sys_events;
CREATE POLICY "sys_events_delete_own" ON public.sys_events
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sys_events TO authenticated;
GRANT ALL ON public.sys_events TO service_role;

COMMENT ON TABLE public.sys_events IS
  'אירועי מעבר מצב ואודיט — ציר זמן; לא מחליף את sys_logs (לוגים טכניים).';

-- ── 2) torah_projects — צילום מחשבון קפוא ───────────────────────────────────
ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS calculator_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS snapshot_locked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.torah_projects.calculator_snapshot IS
  'צילום JSON של קטעי sys_calculator_config הרלוונטיים בעת חתימה (מחירים קפואים).';
COMMENT ON COLUMN public.torah_projects.snapshot_locked_at IS
  'מתי ננעל צילום המחירים (NULL = עדיין לא ננעל).';

-- ── 3) torah_sheets — מצבים נוספים (שומרים written לתאימות לאחור) ─────────────
ALTER TABLE public.torah_sheets
  DROP CONSTRAINT IF EXISTS torah_sheets_status_check;

ALTER TABLE public.torah_sheets
  ADD CONSTRAINT torah_sheets_status_check
  CHECK (status IN (
    'not_started',
    'written',
    'reported_written',
    'received',
    'in_qa',
    'needs_fixing',
    'approved',
    'sewn'
  ));

COMMENT ON COLUMN public.torah_sheets.status IS
  'מחזור חיים: written=legacy; reported_written/received=מנוע Phase 2; in_qa/needs_fixing/approved/sewn.';

-- ── 4) torah_qa_batches — checker (בודק) ─────────────────────────────────────
ALTER TABLE public.torah_qa_batches
  ADD COLUMN IF NOT EXISTS checker_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_torah_qa_batches_checker
  ON public.torah_qa_batches(checker_id)
  WHERE checker_id IS NOT NULL;

COMMENT ON COLUMN public.torah_qa_batches.checker_id IS
  'איש קשר — בודק/מאשר סבב (לעומת magiah_id / vendor חיצוני).';

-- ── 5) torah_fix_tasks ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.torah_fix_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.torah_projects(id) ON DELETE CASCADE,
  sheet_id        UUID NOT NULL REFERENCES public.torah_sheets(id) ON DELETE CASCADE,
  qa_batch_id     UUID REFERENCES public.torah_qa_batches(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  description     TEXT,
  cost_amount     NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (cost_amount >= 0),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_torah_fix_tasks_project
  ON public.torah_fix_tasks(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_torah_fix_tasks_sheet
  ON public.torah_fix_tasks(sheet_id);

ALTER TABLE public.torah_fix_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "torah_fix_tasks_select" ON public.torah_fix_tasks;
CREATE POLICY "torah_fix_tasks_select" ON public.torah_fix_tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "torah_fix_tasks_insert" ON public.torah_fix_tasks;
CREATE POLICY "torah_fix_tasks_insert" ON public.torah_fix_tasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "torah_fix_tasks_update" ON public.torah_fix_tasks;
CREATE POLICY "torah_fix_tasks_update" ON public.torah_fix_tasks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "torah_fix_tasks_delete" ON public.torah_fix_tasks;
CREATE POLICY "torah_fix_tasks_delete" ON public.torah_fix_tasks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.torah_fix_tasks TO authenticated;
GRANT ALL ON public.torah_fix_tasks TO service_role;

CREATE OR REPLACE FUNCTION public.set_torah_fix_task_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_torah_fix_tasks_updated_at ON public.torah_fix_tasks;
CREATE TRIGGER trg_torah_fix_tasks_updated_at
  BEFORE UPDATE ON public.torah_fix_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_torah_fix_task_updated_at();

COMMENT ON TABLE public.torah_fix_tasks IS
  'משימות תיקון יריעה; השלמה → יומן (fix_deduction) בשירות האפליקציה (שלב 2).';

-- ── 6) torah_project_transactions — קישור לסבב הגהה / תיקון ───────────────────
ALTER TABLE public.torah_project_transactions
  ADD COLUMN IF NOT EXISTS qa_batch_id UUID REFERENCES public.torah_qa_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fix_task_id UUID REFERENCES public.torah_fix_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_torah_project_transactions_qa_batch
  ON public.torah_project_transactions(qa_batch_id)
  WHERE qa_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_torah_project_transactions_fix_task
  ON public.torah_project_transactions(fix_task_id)
  WHERE fix_task_id IS NOT NULL;

COMMENT ON COLUMN public.torah_project_transactions.qa_batch_id IS
  'קישור לסבב הגהה כש-transaction_type=qa_expense (או תנועות קשורות).';
COMMENT ON COLUMN public.torah_project_transactions.fix_task_id IS
  'קישור למשימת תיקון כש-transaction_type=fix_deduction.';

NOTIFY pgrst, 'reload schema';
