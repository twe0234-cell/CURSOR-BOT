-- Add images array for gallery
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';

-- Add scribe_id FK to crm_contacts
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS scribe_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL;
