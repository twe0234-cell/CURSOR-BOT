-- 065: WhatsApp broadcast scheduling + full message text in logs

-- Store full message text in broadcast_logs (snippet was 120 chars only)
ALTER TABLE public.broadcast_logs
  ADD COLUMN IF NOT EXISTS message_text TEXT;

COMMENT ON COLUMN public.broadcast_logs.message_text IS 'טקסט מלא של הודעת השידור (לשימוש חוזר)';

-- Allow scheduled future broadcasts in queue
ALTER TABLE public.broadcast_queue
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.broadcast_queue.scheduled_at IS
  'NULL = שלח מיד; TIMESTAMPTZ = שלח לא לפני תאריך זה';

CREATE INDEX IF NOT EXISTS idx_broadcast_queue_scheduled
  ON public.broadcast_queue(scheduled_at)
  WHERE status = 'pending';
