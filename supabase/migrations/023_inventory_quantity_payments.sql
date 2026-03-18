-- Inventory: quantity, total_cost, amount_paid for partial payments to scribe
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) DEFAULT 0;
