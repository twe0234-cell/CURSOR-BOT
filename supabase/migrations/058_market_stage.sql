-- 058: market_stage column for market_torah_books pipeline
-- Enables Kanban board and image-pending ingestion flow

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS market_stage TEXT DEFAULT 'new'
    CHECK (market_stage IN ('image_pending','new','contacted','negotiating','deal_closed','archived'));

-- Backfill existing rows
UPDATE public.market_torah_books SET market_stage = 'new' WHERE market_stage IS NULL;

CREATE INDEX IF NOT EXISTS idx_market_torah_books_stage
  ON public.market_torah_books(user_id, market_stage);

COMMENT ON COLUMN public.market_torah_books.market_stage IS
  'שלב הטיפול: image_pending|new|contacted|negotiating|deal_closed|archived';
