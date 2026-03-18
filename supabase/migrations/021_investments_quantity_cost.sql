-- Add quantity and cost_per_unit to erp_investments
ALTER TABLE public.erp_investments
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(12, 2) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC(12, 2);
