-- Migration 046: Torah projects — cash paid tracking (client / scribe)

ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS amount_paid_by_client NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS amount_paid_to_scribe NUMERIC(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.torah_projects.amount_paid_by_client IS
  'Total cash received from the commissioning client (₪).';

COMMENT ON COLUMN public.torah_projects.amount_paid_to_scribe IS
  'Total cash paid out to the scribe (₪).';
