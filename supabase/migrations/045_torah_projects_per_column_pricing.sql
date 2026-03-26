-- Migration 045: Torah projects — per-column pricing foundation
--   • torah_projects.total_agreed_price — contract total (₪)
--   • torah_sheets.columns_count — columns on this sheet (usually 4; 3 or 2 possible)

ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS total_agreed_price NUMERIC(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.torah_projects.total_agreed_price IS
  'Total agreed price for the scroll; debt is allocated per column across sheets.';

ALTER TABLE public.torah_sheets
  ADD COLUMN IF NOT EXISTS columns_count INTEGER NOT NULL DEFAULT 4;

COMMENT ON COLUMN public.torah_sheets.columns_count IS
  'Number of columns on this ירייה (typically 4; some sheets have 3 or 2).';

ALTER TABLE public.torah_sheets
  DROP CONSTRAINT IF EXISTS torah_sheets_columns_count_check;

ALTER TABLE public.torah_sheets
  ADD CONSTRAINT torah_sheets_columns_count_check
  CHECK (columns_count >= 1 AND columns_count <= 12);
