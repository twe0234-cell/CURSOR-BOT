-- Phase 2: CRM advanced fields (certification, phone_type; notes already exists)
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS certification TEXT,
  ADD COLUMN IF NOT EXISTS phone_type TEXT;
