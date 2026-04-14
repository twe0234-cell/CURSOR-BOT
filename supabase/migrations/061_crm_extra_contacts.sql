-- 061: ריבוי מיילים וטלפונים לאיש קשר ב-CRM
-- מוסיף עמודות JSONB עם מערך { label, value } לכל סוג

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS extra_phones JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_emails JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.crm_contacts.extra_phones IS
  'מערך: [{"label":"נייד","value":"0501234567"}, ...]';
COMMENT ON COLUMN public.crm_contacts.extra_emails IS
  'מערך: [{"label":"עסקי","value":"a@b.com"}, ...]';

CREATE INDEX IF NOT EXISTS idx_crm_contacts_extra_phones
  ON public.crm_contacts USING gin(extra_phones);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_extra_emails
  ON public.crm_contacts USING gin(extra_emails);
