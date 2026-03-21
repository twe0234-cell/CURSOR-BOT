-- Scribe extended profiles (1:1 with crm_contacts) + Torah market watch pipeline
-- market_torah_books includes user_id for tenant isolation (RLS).

-- 1. Scribe Profiles (Extending crm_contacts 1-to-1)
CREATE TABLE IF NOT EXISTS public.crm_sofer_profiles (
  contact_id UUID PRIMARY KEY REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  writing_style TEXT,
  writing_level TEXT,
  sample_image_url TEXT,
  last_contact_date DATE,
  daily_page_capacity NUMERIC,
  pricing_notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_sofer_profiles_contact ON public.crm_sofer_profiles(contact_id);

ALTER TABLE public.crm_sofer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_sofer_profiles_select" ON public.crm_sofer_profiles;
DROP POLICY IF EXISTS "crm_sofer_profiles_insert" ON public.crm_sofer_profiles;
DROP POLICY IF EXISTS "crm_sofer_profiles_update" ON public.crm_sofer_profiles;
DROP POLICY IF EXISTS "crm_sofer_profiles_delete" ON public.crm_sofer_profiles;

CREATE POLICY "crm_sofer_profiles_select" ON public.crm_sofer_profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
  );
CREATE POLICY "crm_sofer_profiles_insert" ON public.crm_sofer_profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
  );
CREATE POLICY "crm_sofer_profiles_update" ON public.crm_sofer_profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
  );
CREATE POLICY "crm_sofer_profiles_delete" ON public.crm_sofer_profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_sofer_profiles TO authenticated;
GRANT ALL ON public.crm_sofer_profiles TO service_role;

-- 2. Torah Market Watch (per-user pipeline)
CREATE TABLE IF NOT EXISTS public.market_torah_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sofer_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  external_sofer_name TEXT,
  style TEXT,
  size_cm NUMERIC,
  parchment_type TEXT,
  influencer_style TEXT,
  current_progress TEXT,
  asking_price NUMERIC,
  currency TEXT DEFAULT 'ILS',
  expected_completion_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_torah_books_user ON public.market_torah_books(user_id, created_at DESC);

ALTER TABLE public.market_torah_books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_torah_books_select" ON public.market_torah_books;
DROP POLICY IF EXISTS "market_torah_books_insert" ON public.market_torah_books;
DROP POLICY IF EXISTS "market_torah_books_update" ON public.market_torah_books;
DROP POLICY IF EXISTS "market_torah_books_delete" ON public.market_torah_books;

CREATE POLICY "market_torah_books_select" ON public.market_torah_books
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "market_torah_books_insert" ON public.market_torah_books
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "market_torah_books_update" ON public.market_torah_books
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "market_torah_books_delete" ON public.market_torah_books
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_torah_books TO authenticated;
GRANT ALL ON public.market_torah_books TO service_role;
