-- Phase 1: Secure public inventory sharing
-- Add is_public and public_slug to inventory
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_slug UUID DEFAULT gen_random_uuid() UNIQUE;

-- Ensure existing rows get a slug
UPDATE public.inventory SET public_slug = gen_random_uuid() WHERE public_slug IS NULL;

-- Allow unauthenticated read of public inventory (for /p/[slug])
CREATE POLICY "Public can view shared inventory"
  ON public.inventory FOR SELECT
  USING (is_public = true);

-- Phase 2: Business WhatsApp number for public CTA
ALTER TABLE public.sys_settings
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
