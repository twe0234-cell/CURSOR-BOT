-- Phase 1: Initial database schema for "הידור הסת"ם"
-- Scribes (סופרים), Inventory (מלאי), Customers (לקוחות)

-- ============================================
-- SCRIBES (סופרים)
-- ============================================
CREATE TABLE IF NOT EXISTS public.scribes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  active_projects TEXT,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('paid', 'pending', 'overdue')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.scribes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated" ON public.scribes FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated" ON public.scribes FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for authenticated" ON public.scribes FOR UPDATE USING (true);
CREATE POLICY "Enable delete for authenticated" ON public.scribes FOR DELETE USING (true);

-- ============================================
-- INVENTORY (מלאי)
-- ============================================
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type TEXT NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'sold', 'reserved')),
  availability BOOLEAN DEFAULT true,
  price NUMERIC(12, 2),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated" ON public.inventory FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated" ON public.inventory FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for authenticated" ON public.inventory FOR UPDATE USING (true);
CREATE POLICY "Enable delete for authenticated" ON public.inventory FOR DELETE USING (true);

-- ============================================
-- CUSTOMERS (לקוחות)
-- ============================================
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  order_history TEXT,
  current_requests TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated" ON public.customers FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated" ON public.customers FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for authenticated" ON public.customers FOR UPDATE USING (true);
CREATE POLICY "Enable delete for authenticated" ON public.customers FOR DELETE USING (true);
