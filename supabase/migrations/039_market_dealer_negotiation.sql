-- Market מאגר: סוחר (CRM), מעקב משא ומתן, מטבע (אם חסר)
ALTER TABLE public.market_torah_books ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'ILS';

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS dealer_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL;

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS last_contact_date DATE DEFAULT CURRENT_DATE;

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS negotiation_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_market_torah_books_dealer ON public.market_torah_books(dealer_id);

COMMENT ON COLUMN public.market_torah_books.dealer_id IS 'סוחר ב-CRM (Merchant); אם ריק — הבעלים לצורכי תצוגה הוא הסופר';
COMMENT ON COLUMN public.market_torah_books.last_contact_date IS 'תאריך קשר אחרון';
COMMENT ON COLUMN public.market_torah_books.negotiation_notes IS 'הערות / יומן משא ומתן';
