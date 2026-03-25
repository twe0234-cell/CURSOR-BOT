-- Multi-installment cash flow + brokerage commission_received
CREATE TABLE IF NOT EXISTS public.erp_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('sale', 'investment')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index only when legacy target_* columns exist (DB may already have entity_* from 030)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'erp_payments' AND column_name = 'target_type'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_erp_payments_user_target
      ON public.erp_payments(user_id, target_type, target_id);
  END IF;
END $$;

ALTER TABLE public.erp_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erp_payments_select" ON public.erp_payments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "erp_payments_insert" ON public.erp_payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "erp_payments_update" ON public.erp_payments
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "erp_payments_delete" ON public.erp_payments
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.erp_sales
  ADD COLUMN IF NOT EXISTS commission_received NUMERIC(12, 2);

-- Allow marking investments delivered to inventory (pipeline)
ALTER TABLE public.erp_investments DROP CONSTRAINT IF EXISTS erp_investments_status_check;
ALTER TABLE public.erp_investments ADD CONSTRAINT erp_investments_status_check
  CHECK (status IN ('active', 'completed', 'cancelled', 'delivered_to_inventory'));
