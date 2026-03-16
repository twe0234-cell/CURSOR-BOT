-- Add cost_price, target_price to inventory
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS target_price NUMERIC(12, 2);

-- Add category for type-specific fields (ספר תורה, נביא, מגילה, מזוזה, פרשיות)
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS category TEXT;

-- Category-dependent metadata (e.g. parshiot count, neviim type)
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS category_meta JSONB DEFAULT '{}';
