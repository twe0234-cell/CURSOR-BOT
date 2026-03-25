-- 041: market_torah_books — SKU + handwriting image; crm_contacts — SKU
-- inventory.sku already exists (migration 00017)

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS handwriting_image_url TEXT;

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS sku TEXT UNIQUE;

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS sku TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_market_torah_books_sku ON public.market_torah_books(sku);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_sku ON public.crm_contacts(sku);

COMMENT ON COLUMN public.market_torah_books.sku IS 'מזהה ייחודי קצר (MKT-XXXXXXXX) לזיהוי פנימי';
COMMENT ON COLUMN public.market_torah_books.handwriting_image_url IS 'URL לדוגמת כתב ב-Storage';
COMMENT ON COLUMN public.crm_contacts.sku IS 'מזהה ייחודי קצר (CRM-XXXXXXXX) לזיהוי פנימי';

NOTIFY pgrst, 'reload schema';
