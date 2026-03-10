-- Hidur-OS Upgrade: Scribe Code, Broadcast Queue, Sys Settings, Inventory

-- broadcast_logs: add scribe_code and internal_notes
ALTER TABLE public.broadcast_logs
  ADD COLUMN IF NOT EXISTS scribe_code TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- inventory (erp_inventory): add scribe_code and internal_notes
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS scribe_code TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- broadcast_queue: background job queue
CREATE TABLE IF NOT EXISTS public.broadcast_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_queue_status ON public.broadcast_queue(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_queue_user ON public.broadcast_queue(user_id);

ALTER TABLE public.broadcast_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "broadcast_queue_select" ON public.broadcast_queue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "broadcast_queue_insert" ON public.broadcast_queue FOR INSERT WITH CHECK (auth.uid() = user_id);

-- sys_settings: app-level settings (logo, branding)
CREATE TABLE IF NOT EXISTS public.sys_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  logo_url TEXT,
  app_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sys_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sys_settings_select" ON public.sys_settings FOR SELECT USING (true);
CREATE POLICY "sys_settings_update" ON public.sys_settings FOR UPDATE USING (true);
CREATE POLICY "sys_settings_insert" ON public.sys_settings FOR INSERT WITH CHECK (true);

INSERT INTO public.sys_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
