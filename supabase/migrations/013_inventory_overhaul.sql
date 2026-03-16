-- Phase 1: Schema fixes
-- 1. Make images optional (already nullable, ensure default)
-- 2. Remove hidur_level
-- 3. Consolidate to product_category (replace category, item_type, product_type)

-- Add product_category if not exists, migrate from category/item_type/product_type
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS product_category TEXT;

-- Migrate from category, item_type, or product_type (columns from prior migrations)
UPDATE public.inventory
SET product_category = COALESCE(NULLIF(TRIM(product_category), ''), category, item_type, product_type, '')
WHERE product_category IS NULL OR TRIM(product_category) = '';

-- Drop redundant columns
ALTER TABLE public.inventory DROP COLUMN IF EXISTS hidur_level;
ALTER TABLE public.inventory DROP COLUMN IF EXISTS category;
ALTER TABLE public.inventory DROP COLUMN IF EXISTS item_type;
ALTER TABLE public.inventory DROP COLUMN IF EXISTS product_type;

-- Ensure images is nullable and has safe default
ALTER TABLE public.inventory
  ALTER COLUMN images SET DEFAULT '{}';

-- Phase 2: sys_dropdowns table
CREATE TABLE IF NOT EXISTS public.sys_dropdowns (
  list_key TEXT PRIMARY KEY,
  options JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- RLS
ALTER TABLE public.sys_dropdowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sys_dropdowns"
  ON public.sys_dropdowns FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can update sys_dropdowns"
  ON public.sys_dropdowns FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Seed initial data
INSERT INTO public.sys_dropdowns (list_key, options) VALUES
  ('categories', '["ספר תורה", "נביא", "מגילה", "מזוזה", "פרשיות"]'::jsonb),
  ('parchment_types', '["גולדמאן", "נפרשטק שליל", "נפרשטק ליצה", "בראון"]'::jsonb),
  ('torah_sizes', '["17", "24", "30", "36", "42", "45", "48", "56", "אחר"]'::jsonb),
  ('neviim_names', '["יהושע", "שופטים", "שמואל", "מלכים", "ישעיה", "ירמיה", "יחזקאל", "תרי עשר"]'::jsonb),
  ('megilla_lines', '["11", "21", "28", "42"]'::jsonb),
  ('script_types', '["אר\"י", "בית יוסף"]'::jsonb),
  ('statuses', '["available", "in_use", "sold", "reserved"]'::jsonb)
ON CONFLICT (list_key) DO UPDATE SET options = EXCLUDED.options;
