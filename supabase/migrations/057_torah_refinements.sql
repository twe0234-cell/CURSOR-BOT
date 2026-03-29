-- 057: Torah module refinements — dynamic parchment, contract URLs, ledger attachments

ALTER TABLE public.torah_projects
  DROP CONSTRAINT IF EXISTS torah_projects_parchment_type_check;

ALTER TABLE public.torah_projects
  ADD COLUMN IF NOT EXISTS client_contract_url TEXT,
  ADD COLUMN IF NOT EXISTS scribe_contract_url TEXT;

COMMENT ON COLUMN public.torah_projects.client_contract_url IS
  'קישור לחוזה/מסמך לקוח (חיצוני)';
COMMENT ON COLUMN public.torah_projects.scribe_contract_url IS
  'קישור לחוזה/מסמך סופר (חיצוני)';
COMMENT ON COLUMN public.torah_projects.parchment_type IS
  'סוג קלף בחוזה — ערכים דינמיים מ־sys_calculator_config (parchment_prices)';

ALTER TABLE public.torah_project_transactions
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

COMMENT ON COLUMN public.torah_project_transactions.attachment_url IS
  'קישור לאסמכתא / קבלה (תמונה או PDF חיצוני)';

NOTIFY pgrst, 'reload schema';
