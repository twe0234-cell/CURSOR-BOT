-- Preset / suggestion tags for email campaigns only (not WhatsApp audience allowed_tags)
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS email_tag_presets TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.user_settings.email_tag_presets IS
  'רשימת תגיות מוצעות לקמפייני אימייל (נפרד מ־allowed_tags לוואטסאפ)';
