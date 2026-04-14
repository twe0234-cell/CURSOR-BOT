-- 068: שיוך הודעות WhatsApp למאגר — מזהה שולח

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS sender_wa_id TEXT;

COMMENT ON COLUMN public.market_torah_books.sender_wa_id IS
  'WhatsApp sender ID (@c.us) ממי נשלחה ההודעה המקורית — משמש לשיוך תמונה+טקסט שנשלחו בנפרד';

CREATE INDEX IF NOT EXISTS idx_market_torah_books_sender
  ON public.market_torah_books(user_id, sender_wa_id, market_stage, created_at DESC)
  WHERE sender_wa_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
