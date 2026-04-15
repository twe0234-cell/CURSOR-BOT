-- 070: וידוא עמודת message_text ב-broadcast_logs
-- (מיגרציה 065 הוסיפה אותה; אם הפרויקט ב-Supabase דילג עליה — כאן תיקון idempotent)

ALTER TABLE public.broadcast_logs
  ADD COLUMN IF NOT EXISTS message_text TEXT;

COMMENT ON COLUMN public.broadcast_logs.message_text IS
  'טקסט מלא של הודעת השידור (לשימוש חוזר)';

NOTIFY pgrst, 'reload schema';
