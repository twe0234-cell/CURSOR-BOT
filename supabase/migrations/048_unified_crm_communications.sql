-- Unified CRM timeline: direction, source, external id dedup, metadata

ALTER TABLE public.crm_contact_history
  ADD COLUMN IF NOT EXISTS follow_up_date DATE;

ALTER TABLE public.crm_contact_history
  ADD COLUMN IF NOT EXISTS direction TEXT;

UPDATE public.crm_contact_history
SET direction = 'internal'
WHERE direction IS NULL;

ALTER TABLE public.crm_contact_history
  ALTER COLUMN direction SET DEFAULT 'internal';

ALTER TABLE public.crm_contact_history
  ALTER COLUMN direction SET NOT NULL;

ALTER TABLE public.crm_contact_history
  ADD COLUMN IF NOT EXISTS source TEXT;

-- Existing manual notes → manual; new rows default system (per spec)
UPDATE public.crm_contact_history
SET source = 'manual'
WHERE source IS NULL;

ALTER TABLE public.crm_contact_history
  ALTER COLUMN source SET DEFAULT 'system';

ALTER TABLE public.crm_contact_history
  ALTER COLUMN source SET NOT NULL;

ALTER TABLE public.crm_contact_history
  ADD COLUMN IF NOT EXISTS external_reference_id TEXT;

ALTER TABLE public.crm_contact_history
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.crm_contact_history
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

ALTER TABLE public.crm_contact_history
  DROP CONSTRAINT IF EXISTS crm_contact_history_direction_check;

ALTER TABLE public.crm_contact_history
  ADD CONSTRAINT crm_contact_history_direction_check
  CHECK (direction IN ('in', 'out', 'internal'));

ALTER TABLE public.crm_contact_history
  DROP CONSTRAINT IF EXISTS crm_contact_history_source_check;

ALTER TABLE public.crm_contact_history
  ADD CONSTRAINT crm_contact_history_source_check
  CHECK (source IN ('gmail', 'whatsapp', 'system', 'manual'));

COMMENT ON COLUMN public.crm_contact_history.direction IS
  'in = inbound; out = outbound; internal = note';

COMMENT ON COLUMN public.crm_contact_history.source IS
  'gmail | whatsapp | system | manual';

COMMENT ON COLUMN public.crm_contact_history.external_reference_id IS
  'Gmail / WhatsApp id for idempotent sync';

COMMENT ON COLUMN public.crm_contact_history.metadata IS
  'subject, snippets, attachments, read receipts, etc.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contact_history_contact_source_ext
  ON public.crm_contact_history (contact_id, source, external_reference_id)
  WHERE external_reference_id IS NOT NULL;
