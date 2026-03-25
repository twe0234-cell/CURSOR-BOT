-- CRM: דוגמת כתב על איש קשר; יומן הערות; סטטוס מכירה

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS handwriting_image_url TEXT;

CREATE TABLE IF NOT EXISTS public.crm_contact_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_contact_history_contact
  ON public.crm_contact_history(contact_id, created_at DESC);

ALTER TABLE public.crm_contact_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_contact_history_select" ON public.crm_contact_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.crm_contacts c
      WHERE c.id = contact_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "crm_contact_history_insert" ON public.crm_contact_history
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.crm_contacts c
      WHERE c.id = contact_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "crm_contact_history_delete" ON public.crm_contact_history
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.erp_sales
  ADD COLUMN IF NOT EXISTS status TEXT;

COMMENT ON COLUMN public.crm_contacts.handwriting_image_url IS 'דוגמת כתב (URL ב-bucket media)';
COMMENT ON TABLE public.crm_contact_history IS 'יומן התקשרות / הערות עם חותמת זמן';
