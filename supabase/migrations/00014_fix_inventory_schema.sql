-- Fix images schema cache error and add total_target_price
-- Run this in Supabase SQL Editor if you get "Could not find the 'images' column" error

-- Add images column if missing
ALTER TABLE public.erp_inventory ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}'::text[];

-- Just in case the table is literally named 'inventory' instead of 'erp_inventory'
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}'::text[];

-- Add total_target_price for the new logic
ALTER TABLE public.erp_inventory ADD COLUMN IF NOT EXISTS total_target_price NUMERIC DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS total_target_price NUMERIC DEFAULT 0;

-- Notify Supabase to reload schema cache
NOTIFY pgrst, 'reload schema';
