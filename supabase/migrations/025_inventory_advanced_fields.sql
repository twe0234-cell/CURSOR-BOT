-- Phase 2: Inventory advanced fields
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS parchment_type TEXT,
  ADD COLUMN IF NOT EXISTS computer_proofread BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_proofread BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_sewn BOOLEAN DEFAULT false;
