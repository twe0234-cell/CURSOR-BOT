-- 062: גלריית תמונות לסופר (ללא הגבלת מספר תמונות)
CREATE TABLE IF NOT EXISTS public.crm_scribe_gallery (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id   UUID        NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  image_url    TEXT        NOT NULL,
  caption      TEXT,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scribe_gallery_contact
  ON public.crm_scribe_gallery(contact_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_scribe_gallery_user
  ON public.crm_scribe_gallery(user_id);

ALTER TABLE public.crm_scribe_gallery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sg_select" ON public.crm_scribe_gallery FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sg_insert" ON public.crm_scribe_gallery FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sg_update" ON public.crm_scribe_gallery FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sg_delete" ON public.crm_scribe_gallery FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_scribe_gallery TO authenticated;
GRANT ALL ON public.crm_scribe_gallery TO service_role;

COMMENT ON TABLE public.crm_scribe_gallery IS
  'גלריית כתב-יד ותמונות לכל סופר — append-only, מספר תמונות בלתי מוגבל';
