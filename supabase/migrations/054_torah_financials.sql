-- 054: Torah project ledger (transactions + payment schedules)

CREATE TABLE IF NOT EXISTS public.torah_project_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES public.torah_projects(id) ON DELETE CASCADE,
  transaction_type  TEXT NOT NULL CHECK (
    transaction_type IN (
      'client_payment',
      'scribe_payment',
      'fix_deduction',
      'qa_expense',
      'other_expense'
    )
  ),
  amount            NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  date              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes             TEXT,
  receipt_sent      BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_torah_project_transactions_project
  ON public.torah_project_transactions(project_id, date DESC);

ALTER TABLE public.torah_project_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "torah_project_transactions_select" ON public.torah_project_transactions;
CREATE POLICY "torah_project_transactions_select" ON public.torah_project_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "torah_project_transactions_insert" ON public.torah_project_transactions;
CREATE POLICY "torah_project_transactions_insert" ON public.torah_project_transactions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "torah_project_transactions_update" ON public.torah_project_transactions;
CREATE POLICY "torah_project_transactions_update" ON public.torah_project_transactions
  FOR UPDATE USING (
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

DROP POLICY IF EXISTS "torah_project_transactions_delete" ON public.torah_project_transactions;
CREATE POLICY "torah_project_transactions_delete" ON public.torah_project_transactions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.torah_project_transactions TO authenticated;
GRANT ALL ON public.torah_project_transactions TO service_role;

-- ── Payment schedules ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.torah_payment_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.torah_projects(id) ON DELETE CASCADE,
  party       TEXT NOT NULL CHECK (party IN ('client', 'scribe')),
  amount      NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  due_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_torah_payment_schedules_project
  ON public.torah_payment_schedules(project_id, due_date);

ALTER TABLE public.torah_payment_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "torah_payment_schedules_select" ON public.torah_payment_schedules;
CREATE POLICY "torah_payment_schedules_select" ON public.torah_payment_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "torah_payment_schedules_insert" ON public.torah_payment_schedules;
CREATE POLICY "torah_payment_schedules_insert" ON public.torah_payment_schedules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "torah_payment_schedules_update" ON public.torah_payment_schedules;
CREATE POLICY "torah_payment_schedules_update" ON public.torah_payment_schedules
  FOR UPDATE USING (
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

DROP POLICY IF EXISTS "torah_payment_schedules_delete" ON public.torah_payment_schedules;
CREATE POLICY "torah_payment_schedules_delete" ON public.torah_payment_schedules
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.torah_projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.torah_payment_schedules TO authenticated;
GRANT ALL ON public.torah_payment_schedules TO service_role;

NOTIFY pgrst, 'reload schema';
