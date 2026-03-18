-- Add sale_type and optional fields for brokerage/new project sales
ALTER TABLE public.erp_sales
  ADD COLUMN IF NOT EXISTS sale_type TEXT DEFAULT 'ממלאי' CHECK (sale_type IN ('ממלאי', 'תיווך', 'פרויקט חדש')),
  ADD COLUMN IF NOT EXISTS item_description TEXT,
  ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS investment_id UUID REFERENCES public.erp_investments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_profit NUMERIC(12, 2);

-- Make item_id nullable for non-inventory sales (תיווך, פרויקט חדש)
ALTER TABLE public.erp_sales ALTER COLUMN item_id DROP NOT NULL;

-- Ensure update policy exists for bulk operations
DROP POLICY IF EXISTS "erp_sales_update" ON public.erp_sales;
CREATE POLICY "erp_sales_update" ON public.erp_sales FOR UPDATE USING (auth.uid() = user_id);
