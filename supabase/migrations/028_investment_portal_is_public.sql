-- Fix: anonymous must not read all investments. Align with inventory (is_public gate).
ALTER TABLE public.erp_investments
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "anon_can_view_shared_investment" ON public.erp_investments;

CREATE POLICY "anon_can_view_shared_investment"
  ON public.erp_investments FOR SELECT
  TO anon
  USING (is_public = true AND public_slug IS NOT NULL);
