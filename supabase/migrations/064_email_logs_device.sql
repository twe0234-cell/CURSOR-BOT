-- 064: add device tracking to email_logs + stats columns to email_campaigns

ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS device_type TEXT CHECK (device_type IN ('mobile', 'tablet', 'desktop', 'unknown'));

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS sent_count  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.email_logs.user_agent IS 'Raw UA string captured at open-pixel request';
COMMENT ON COLUMN public.email_logs.device_type IS 'Parsed device category from user-agent';
COMMENT ON COLUMN public.email_campaigns.sent_at IS 'Timestamp when send was triggered';
