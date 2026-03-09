-- Ensure email_campaigns and email_logs exist
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body_html TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  contact_id UUID NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'open', 'unsub')),
  opened_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own campaigns" ON public.email_campaigns;
DROP POLICY IF EXISTS "Users can insert own campaigns" ON public.email_campaigns;
CREATE POLICY "Users can view own campaigns"
  ON public.email_campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own campaigns"
  ON public.email_campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);

-- email_logs: service role used for track/unsubscribe (public links)
DROP POLICY IF EXISTS "Users can view own logs via campaign" ON public.email_logs;
DROP POLICY IF EXISTS "Users can insert logs" ON public.email_logs;
DROP POLICY IF EXISTS "Users can update logs" ON public.email_logs;
CREATE POLICY "Users can view own logs via campaign"
  ON public.email_logs FOR SELECT USING (
    contact_id IN (SELECT id FROM public.email_contacts WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can insert logs"
  ON public.email_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update for track and unsubscribe"
  ON public.email_logs FOR UPDATE USING (true);
