-- 056: סנכרון מאגר ס״ת מקבוצת WhatsApp (Green API)

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS source_message_id VARCHAR(256);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_torah_books_source_message_id
  ON public.market_torah_books(source_message_id)
  WHERE source_message_id IS NOT NULL;

COMMENT ON COLUMN public.market_torah_books.source_message_id IS
  'מזהה הודעת WA (Green API idMessage) למניעת כפילויות';

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS wa_market_group_id VARCHAR(256);

COMMENT ON COLUMN public.user_settings.wa_market_group_id IS
  'Chat ID של קבוצת WhatsApp לסריקת הצעות למאגר (לרוב מסתיים ב-@g.us)';

NOTIFY pgrst, 'reload schema';
