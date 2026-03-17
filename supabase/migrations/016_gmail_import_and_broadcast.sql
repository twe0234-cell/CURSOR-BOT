-- Gmail Import Triage & Email Broadcast
-- 1. Ensure crm_contacts has unique email per user
-- 2. sys_ignored_emails blacklist
-- 3. sys_settings email_signature

-- Unique constraint on (user_id, email) for crm_contacts
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_user_email_unique
  ON public.crm_contacts(user_id, LOWER(email))
  WHERE email IS NOT NULL AND TRIM(email) != '';

-- sys_ignored_emails: blacklist for Gmail import triage
CREATE TABLE IF NOT EXISTS public.sys_ignored_emails (
  email TEXT PRIMARY KEY
);

ALTER TABLE public.sys_ignored_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage sys_ignored_emails"
  ON public.sys_ignored_emails FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Add email_signature to sys_settings
ALTER TABLE public.sys_settings
  ADD COLUMN IF NOT EXISTS email_signature TEXT;
