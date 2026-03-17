-- Observability: sys_logs table for AI analysis
CREATE TABLE IF NOT EXISTS public.sys_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR')),
  module TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sys_logs_created_at ON public.sys_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sys_logs_level ON public.sys_logs (level);

ALTER TABLE public.sys_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can insert sys_logs"
  ON public.sys_logs FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can read sys_logs"
  ON public.sys_logs FOR SELECT
  TO authenticated USING (true);
