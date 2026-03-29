-- 052: Torah project contract fields (price per column, QA JSON, accessories, parchment)

ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS price_per_column NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS qa_agreed_types JSONB NOT NULL DEFAULT '{"gavra": 1, "computer": 1}'::jsonb;

ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS includes_accessories BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS parchment_type TEXT;

ALTER TABLE public.torah_projects DROP CONSTRAINT IF EXISTS torah_projects_parchment_type_check;
ALTER TABLE public.torah_projects
  ADD CONSTRAINT torah_projects_parchment_type_check
  CHECK (parchment_type IS NULL OR parchment_type IN ('שליל', 'בקר', 'עור', 'משוח'));

-- One-time sync from existing integer columns (preserves deployed data)
UPDATE public.torah_projects
SET qa_agreed_types = jsonb_build_object(
  'gavra', GREATEST(0, COALESCE(gavra_qa_count, 1)::int),
  'computer', GREATEST(0, COALESCE(computer_qa_count, 1)::int)
);

COMMENT ON COLUMN public.torah_projects.price_per_column IS 'מחיר מוסכם לעמודה (₪)';
COMMENT ON COLUMN public.torah_projects.qa_agreed_types IS 'JSON: מספר סבבי הגהה גו״ר ומחשב בחוזה, e.g. {"gavra":2,"computer":1}';
COMMENT ON COLUMN public.torah_projects.includes_accessories IS 'אביזרים בחוזה (עצי חיים, מעיל וכו׳)';
COMMENT ON COLUMN public.torah_projects.parchment_type IS 'סוג קלף בחוזה: שליל | בקר | עור | משוח';

NOTIFY pgrst, 'reload schema';
