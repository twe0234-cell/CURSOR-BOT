-- Pitum HaKetoret: optional extras + physical size (cm) as dedicated columns
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS has_lamnatzeach BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS size TEXT;

COMMENT ON COLUMN public.inventory.has_lamnatzeach IS 'פיטום הקטורת: כולל למנצח';
COMMENT ON COLUMN public.inventory.size IS 'גודל (ס״מ) או טקסט חופשי לקטגוריית פיטום הקטורת';
