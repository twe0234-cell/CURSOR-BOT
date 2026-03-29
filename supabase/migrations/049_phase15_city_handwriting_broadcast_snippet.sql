-- Phase 1.5: city on contacts, handwriting_quality on sofer profiles, message snippet on broadcast logs

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS city TEXT;

COMMENT ON COLUMN public.crm_contacts.city IS 'עיר — סינון במאגר סופרים וכו׳';

ALTER TABLE public.crm_sofer_profiles
  ADD COLUMN IF NOT EXISTS handwriting_quality NUMERIC(2, 1);

COMMENT ON COLUMN public.crm_sofer_profiles.handwriting_quality IS 'דירוג 0.5–5 כוכבים (רמת כתב)';

ALTER TABLE public.broadcast_logs
  ADD COLUMN IF NOT EXISTS message_snippet TEXT;

COMMENT ON COLUMN public.broadcast_logs.message_snippet IS 'תקציר הודעה לתצוגה בהיסטוריה';
