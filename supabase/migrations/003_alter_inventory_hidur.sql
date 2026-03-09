-- Hidur HaStam: Add user_id and Hidur-specific columns to inventory
-- Run in Supabase SQL Editor if table already exists

-- Add user_id if not exists (for multi-tenant)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.inventory ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add item_type (Tefillin/Mezuzah/Sefer Torah) - map from product_type if exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'item_type'
  ) THEN
    ALTER TABLE public.inventory ADD COLUMN item_type TEXT;
    UPDATE public.inventory SET item_type = product_type WHERE product_type IS NOT NULL;
  END IF;
END $$;

-- Add script_type (Ari/Beit Yosef)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'script_type'
  ) THEN
    ALTER TABLE public.inventory ADD COLUMN script_type TEXT;
  END IF;
END $$;

-- Add hidur_level (A/B/C)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'hidur_level'
  ) THEN
    ALTER TABLE public.inventory ADD COLUMN hidur_level TEXT;
  END IF;
END $$;

-- Drop old RLS policies and create user-scoped ones
DROP POLICY IF EXISTS "Enable read for authenticated" ON public.inventory;
DROP POLICY IF EXISTS "Enable insert for authenticated" ON public.inventory;
DROP POLICY IF EXISTS "Enable update for authenticated" ON public.inventory;
DROP POLICY IF EXISTS "Enable delete for authenticated" ON public.inventory;

CREATE POLICY "Users can view own inventory"
  ON public.inventory FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Users can insert own inventory"
  ON public.inventory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own inventory"
  ON public.inventory FOR UPDATE
  USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Users can delete own inventory"
  ON public.inventory FOR DELETE
  USING (user_id IS NULL OR auth.uid() = user_id);
