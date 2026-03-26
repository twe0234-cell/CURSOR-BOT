-- ============================================================
-- Migration 044: Torah Projects Engine
-- Tables: torah_projects, torah_sheets, torah_qa_batches, torah_batch_sheets
--
-- Design notes:
--   • All tables are user-scoped either directly (torah_projects) or via
--     ownership join (torah_sheets, torah_qa_batches, torah_batch_sheets).
--   • Every CREATE / ADD / INDEX / POLICY statement is idempotent.
--   • RLS is enabled and four CRUD policies are defined per table.
--   • torah_batch_sheets is a pure junction table (no surrogate PK needed).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- TABLE 1: torah_projects
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.torah_projects (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  client_id       UUID          REFERENCES public.crm_contacts(id)       ON DELETE SET NULL,
  scribe_id       UUID          NOT NULL REFERENCES public.crm_contacts(id),
  title           TEXT          NOT NULL,
  status          TEXT          NOT NULL DEFAULT 'contract'
                                  CHECK (status IN ('contract', 'writing', 'qa', 'completed', 'delivered')),
  start_date      DATE,
  target_date     DATE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_torah_projects_user
  ON public.torah_projects(user_id);

CREATE INDEX IF NOT EXISTS idx_torah_projects_scribe
  ON public.torah_projects(scribe_id);

ALTER TABLE public.torah_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "torah_projects_select" ON public.torah_projects;
CREATE POLICY "torah_projects_select" ON public.torah_projects
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "torah_projects_insert" ON public.torah_projects;
CREATE POLICY "torah_projects_insert" ON public.torah_projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "torah_projects_update" ON public.torah_projects;
CREATE POLICY "torah_projects_update" ON public.torah_projects
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "torah_projects_delete" ON public.torah_projects;
CREATE POLICY "torah_projects_delete" ON public.torah_projects
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.torah_projects TO authenticated;
GRANT ALL ON public.torah_projects TO service_role;


-- ─────────────────────────────────────────────────────────────
-- TABLE 2: torah_sheets
-- No direct user_id — ownership verified through torah_projects.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.torah_sheets (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID          NOT NULL REFERENCES public.torah_projects(id) ON DELETE CASCADE,
  sheet_number      SMALLINT      NOT NULL CHECK (sheet_number BETWEEN 1 AND 62),
  status            TEXT          NOT NULL DEFAULT 'not_started'
                                    CHECK (status IN (
                                      'not_started', 'written', 'in_qa',
                                      'needs_fixing', 'approved', 'sewn'
                                    )),
  current_holder_id UUID          REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  sku               TEXT          UNIQUE,
  image_url         TEXT,
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, sheet_number)
);

CREATE INDEX IF NOT EXISTS idx_torah_sheets_project
  ON public.torah_sheets(project_id);

CREATE INDEX IF NOT EXISTS idx_torah_sheets_holder
  ON public.torah_sheets(current_holder_id);

ALTER TABLE public.torah_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "torah_sheets_select" ON public.torah_sheets;
CREATE POLICY "torah_sheets_select" ON public.torah_sheets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "torah_sheets_insert" ON public.torah_sheets;
CREATE POLICY "torah_sheets_insert" ON public.torah_sheets
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "torah_sheets_update" ON public.torah_sheets;
CREATE POLICY "torah_sheets_update" ON public.torah_sheets
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

DROP POLICY IF EXISTS "torah_sheets_delete" ON public.torah_sheets;
CREATE POLICY "torah_sheets_delete" ON public.torah_sheets
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.torah_sheets TO authenticated;
GRANT ALL ON public.torah_sheets TO service_role;


-- ─────────────────────────────────────────────────────────────
-- TABLE 3: torah_qa_batches  (שקיות הגהה)
-- No direct user_id — ownership verified through torah_projects.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.torah_qa_batches (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID          NOT NULL REFERENCES public.torah_projects(id) ON DELETE CASCADE,
  magiah_id       UUID          NOT NULL REFERENCES public.crm_contacts(id),
  status          TEXT          NOT NULL DEFAULT 'sent'
                                  CHECK (status IN ('sent', 'returned')),
  sent_date       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  returned_date   TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_torah_qa_batches_project
  ON public.torah_qa_batches(project_id);

CREATE INDEX IF NOT EXISTS idx_torah_qa_batches_magiah
  ON public.torah_qa_batches(magiah_id);

ALTER TABLE public.torah_qa_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "torah_qa_batches_select" ON public.torah_qa_batches;
CREATE POLICY "torah_qa_batches_select" ON public.torah_qa_batches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "torah_qa_batches_insert" ON public.torah_qa_batches;
CREATE POLICY "torah_qa_batches_insert" ON public.torah_qa_batches
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "torah_qa_batches_update" ON public.torah_qa_batches;
CREATE POLICY "torah_qa_batches_update" ON public.torah_qa_batches
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

DROP POLICY IF EXISTS "torah_qa_batches_delete" ON public.torah_qa_batches;
CREATE POLICY "torah_qa_batches_delete" ON public.torah_qa_batches
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.torah_qa_batches TO authenticated;
GRANT ALL ON public.torah_qa_batches TO service_role;


-- ─────────────────────────────────────────────────────────────
-- TABLE 4: torah_batch_sheets  (junction: batch ↔ sheet)
-- Ownership chain: torah_batch_sheets → torah_qa_batches → torah_projects.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.torah_batch_sheets (
  batch_id    UUID  NOT NULL REFERENCES public.torah_qa_batches(id) ON DELETE CASCADE,
  sheet_id    UUID  NOT NULL REFERENCES public.torah_sheets(id)     ON DELETE CASCADE,
  PRIMARY KEY (batch_id, sheet_id)
);

CREATE INDEX IF NOT EXISTS idx_torah_batch_sheets_sheet
  ON public.torah_batch_sheets(sheet_id);

ALTER TABLE public.torah_batch_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "torah_batch_sheets_select" ON public.torah_batch_sheets;
CREATE POLICY "torah_batch_sheets_select" ON public.torah_batch_sheets
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.torah_qa_batches b
      JOIN public.torah_projects p ON p.id = b.project_id
      WHERE b.id = batch_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "torah_batch_sheets_insert" ON public.torah_batch_sheets;
CREATE POLICY "torah_batch_sheets_insert" ON public.torah_batch_sheets
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.torah_qa_batches b
      JOIN public.torah_projects p ON p.id = b.project_id
      WHERE b.id = batch_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "torah_batch_sheets_delete" ON public.torah_batch_sheets;
CREATE POLICY "torah_batch_sheets_delete" ON public.torah_batch_sheets
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.torah_qa_batches b
      JOIN public.torah_projects p ON p.id = b.project_id
      WHERE b.id = batch_id AND p.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, DELETE ON public.torah_batch_sheets TO authenticated;
GRANT ALL ON public.torah_batch_sheets TO service_role;


-- ─────────────────────────────────────────────────────────────
-- Trigger: auto-update torah_sheets.updated_at on row change
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_torah_sheet_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_torah_sheets_updated_at ON public.torah_sheets;
CREATE TRIGGER trg_torah_sheets_updated_at
  BEFORE UPDATE ON public.torah_sheets
  FOR EACH ROW EXECUTE FUNCTION public.set_torah_sheet_updated_at();
