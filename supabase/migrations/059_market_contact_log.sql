-- 059: market_contact_log — יומן מגעים ומו״מ לכל ספר תורה במאגר
-- Append-only log; referenced by book id

CREATE TABLE IF NOT EXISTS public.market_contact_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id      UUID        NOT NULL REFERENCES public.market_torah_books(id) ON DELETE CASCADE,
  note         TEXT        NOT NULL CHECK (char_length(note) > 0),
  contacted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_contact_logs_book
  ON public.market_contact_logs(book_id, contacted_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_contact_logs_user
  ON public.market_contact_logs(user_id);

ALTER TABLE public.market_contact_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcl_select" ON public.market_contact_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mcl_insert" ON public.market_contact_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mcl_delete" ON public.market_contact_logs
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.market_contact_logs TO authenticated;
GRANT ALL ON public.market_contact_logs TO service_role;

COMMENT ON TABLE public.market_contact_logs IS
  'יומן מגעים ומו"מ — רשומה לכל שיחה/הודעה עם בעל הספר. append-only.';
