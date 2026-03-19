-- Phase 4: Sefer Torah Project Manager - erp_investments upgrades
ALTER TABLE public.erp_investments
  ADD COLUMN IF NOT EXISTS milestones JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deductions NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS documents TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS public_slug UUID DEFAULT gen_random_uuid() UNIQUE;

-- Allow unauthenticated (anon) read of shared investments for client portal
CREATE POLICY "anon_can_view_shared_investment"
  ON public.erp_investments FOR SELECT
  TO anon
  USING (public_slug IS NOT NULL);
