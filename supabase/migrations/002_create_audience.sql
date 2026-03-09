-- Broadcast Buddy: Audience table for WhatsApp contacts
CREATE TABLE IF NOT EXISTS public.audience (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wa_chat_id TEXT NOT NULL,
  name TEXT,
  tags TEXT[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, wa_chat_id)
);

ALTER TABLE public.audience ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audience"
  ON public.audience FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own audience"
  ON public.audience FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own audience"
  ON public.audience FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own audience"
  ON public.audience FOR DELETE USING (auth.uid() = user_id);
