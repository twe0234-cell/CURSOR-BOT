ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS megillah_type TEXT DEFAULT 'אסתר';

COMMENT ON COLUMN public.inventory.megillah_type IS 'סוג מגילה (אסתר, רות, וכו׳) — רלוונטי כש־product_category = מגילה';
