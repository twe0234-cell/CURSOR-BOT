-- ERP Sales, Expenses, and Investments
-- erp_sales: links to inventory (item_id) and crm_contacts (buyer_id)
CREATE TABLE IF NOT EXISTS public.erp_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
  buyer_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  sale_price NUMERIC(12, 2) NOT NULL,
  cost_price NUMERIC(12, 2),
  profit NUMERIC(12, 2),
  sale_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_sales_user ON public.erp_sales(user_id);
CREATE INDEX IF NOT EXISTS idx_erp_sales_item ON public.erp_sales(item_id);
CREATE INDEX IF NOT EXISTS idx_erp_sales_date ON public.erp_sales(sale_date DESC);

ALTER TABLE public.erp_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erp_sales_select" ON public.erp_sales FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "erp_sales_insert" ON public.erp_sales FOR INSERT WITH CHECK (auth.uid() = user_id);

-- erp_expenses: daily expenses
CREATE TABLE IF NOT EXISTS public.erp_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  expense_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_expenses_user ON public.erp_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_erp_expenses_date ON public.erp_expenses(expense_date DESC);

ALTER TABLE public.erp_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erp_expenses_select" ON public.erp_expenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "erp_expenses_insert" ON public.erp_expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "erp_expenses_update" ON public.erp_expenses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "erp_expenses_delete" ON public.erp_expenses FOR DELETE USING (auth.uid() = user_id);

-- erp_investments: scribe writing projects
CREATE TABLE IF NOT EXISTS public.erp_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scribe_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  item_details TEXT,
  total_agreed_price NUMERIC(12, 2) NOT NULL,
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_investments_user ON public.erp_investments(user_id);
CREATE INDEX IF NOT EXISTS idx_erp_investments_scribe ON public.erp_investments(scribe_id);

ALTER TABLE public.erp_investments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erp_investments_select" ON public.erp_investments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "erp_investments_insert" ON public.erp_investments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "erp_investments_update" ON public.erp_investments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "erp_investments_delete" ON public.erp_investments FOR DELETE USING (auth.uid() = user_id);
