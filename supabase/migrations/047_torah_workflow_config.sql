-- Migration 047: Torah projects — workflow / QA configuration

ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS columns_per_day NUMERIC(12, 4) NOT NULL DEFAULT 0;

ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS qa_weeks_buffer INTEGER NOT NULL DEFAULT 3;

ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS gavra_qa_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS computer_qa_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS requires_tagging BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.torah_projects.columns_per_day IS
  'Scribe pace: expected columns written per day (0 = unset).';

COMMENT ON COLUMN public.torah_projects.qa_weeks_buffer IS
  'Weeks reserved for QA cycle before target delivery date.';

COMMENT ON COLUMN public.torah_projects.gavra_qa_count IS
  'Number of human (gavra) proofread rounds required.';

COMMENT ON COLUMN public.torah_projects.computer_qa_count IS
  'Number of computer proofread rounds required.';

COMMENT ON COLUMN public.torah_projects.requires_tagging IS
  'Whether external tagging (תיוג) is required for this project.';
