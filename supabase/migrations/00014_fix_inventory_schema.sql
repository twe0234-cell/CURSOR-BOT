-- Fix images schema cache error and add total_target_price
-- Table is 'inventory' (NOT erp_inventory). Run in Supabase SQL Editor if needed.

-- Add images column if missing
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}'::text[];

-- Add total_target_price for quantity * target_price logic
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS total_target_price NUMERIC DEFAULT 0;

-- Add product_category if missing (code uses it; table may have legacy category)
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS product_category TEXT;

-- Notify Supabase to reload schema cache
NOTIFY pgrst, 'reload schema';
