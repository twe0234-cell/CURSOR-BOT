-- Brokerage / flipping: seller ask vs your target offer; profit is derived in DB.
ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS target_brokerage_price NUMERIC(12, 2);

-- Drop plain column if re-running (safe if never existed as non-generated)
ALTER TABLE public.market_torah_books DROP COLUMN IF EXISTS potential_profit;

ALTER TABLE public.market_torah_books
  ADD COLUMN potential_profit NUMERIC(12, 2) GENERATED ALWAYS AS (
    CASE
      WHEN asking_price IS NOT NULL AND target_brokerage_price IS NOT NULL
      THEN target_brokerage_price - asking_price
      ELSE NULL
    END
  ) STORED;

COMMENT ON COLUMN public.market_torah_books.asking_price IS 'מחיר דורש — מה שהסופר/המוכר מבקש';
COMMENT ON COLUMN public.market_torah_books.target_brokerage_price IS 'מחיר יעד לתיווך — למה מתכוונים להציע';
COMMENT ON COLUMN public.market_torah_books.potential_profit IS 'רווח צפוי (יעד תיווך − מחיר דורש)';
