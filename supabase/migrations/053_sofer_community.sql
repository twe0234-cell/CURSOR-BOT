-- 053: Scribe profile — community (קהילה)

ALTER TABLE public.crm_sofer_profiles
  ADD COLUMN IF NOT EXISTS community TEXT;

COMMENT ON COLUMN public.crm_sofer_profiles.community IS 'קהילה / מוסד';

NOTIFY pgrst, 'reload schema';
