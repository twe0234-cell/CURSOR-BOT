-- 063: link market_torah_books → erp_sales (provenance workflow)
-- Allows tracking a Torah book's journey: market → negotiation → sale

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS sale_id UUID
    REFERENCES public.erp_sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_market_torah_books_sale_id
  ON public.market_torah_books(sale_id)
  WHERE sale_id IS NOT NULL;

COMMENT ON COLUMN public.market_torah_books.sale_id IS
  'FK → erp_sales: קישור לעסקת המכירה שנסגרה על הספר';
