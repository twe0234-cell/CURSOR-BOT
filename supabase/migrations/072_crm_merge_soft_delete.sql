-- 072: מיזוג אנשי קשר — soft archive (לא מוחקים שורה עד שכל FK הועברו בקוד)

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN public.crm_contacts.merged_into IS
  'אם לא NULL — איש קשר זה הוזג ל-merged_into; שדות ייחודיים (מייל/טלפון) מנוקים למניעת התנגשות.';
COMMENT ON COLUMN public.crm_contacts.archived_at IS
  'חותמת ארכוב (מיזוג או עתידי); רשימות CRM מסננות archived_at IS NULL.';

CREATE INDEX IF NOT EXISTS idx_crm_contacts_user_active
  ON public.crm_contacts(user_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_merged_into
  ON public.crm_contacts(merged_into)
  WHERE merged_into IS NOT NULL;

NOTIFY pgrst, 'reload schema';
