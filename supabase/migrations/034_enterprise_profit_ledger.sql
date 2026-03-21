-- Enterprise cash-basis profit ledger: chronological cost recovery vs realized profit per sale.
-- entity_id = erp_sales.id (not inventory). Cost from erp_sales.cost_price.
-- Payments: only entity_type = 'sale'; amounts signed by direction (incoming/outgoing).

CREATE TABLE IF NOT EXISTS public.erp_profit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.erp_sales(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.erp_payments(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL,
  ledger_type TEXT NOT NULL CHECK (ledger_type IN ('COST_RECOVERY', 'PROFIT')),
  entry_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_profit_ledger_entity ON public.erp_profit_ledger(entity_id);
CREATE INDEX IF NOT EXISTS idx_erp_profit_ledger_user_entry ON public.erp_profit_ledger(user_id, entry_date);

ALTER TABLE public.erp_profit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_profit_ledger_select" ON public.erp_profit_ledger;
CREATE POLICY "erp_profit_ledger_select" ON public.erp_profit_ledger
  FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT ON public.erp_profit_ledger TO authenticated;
GRANT SELECT ON public.erp_profit_ledger TO service_role;

-- p_entity_id = erp_sales.id
CREATE OR REPLACE FUNCTION public.rebuild_sale_ledger(p_entity_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_cost NUMERIC(14, 2);
  v_user_id UUID;
  v_payment RECORD;
  v_signed NUMERIC(14, 2);
  v_total_paid_before NUMERIC(14, 2) := 0;
  v_total_paid_after NUMERIC(14, 2);
  v_cost_left NUMERIC(14, 2);
  v_profit_part NUMERIC(14, 2);
BEGIN
  SELECT COALESCE(s.cost_price, 0), s.user_id
  INTO v_sale_cost, v_user_id
  FROM public.erp_sales s
  WHERE s.id = p_entity_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  DELETE FROM public.erp_profit_ledger WHERE entity_id = p_entity_id;

  FOR v_payment IN
    SELECT *
    FROM public.erp_payments p
    WHERE p.entity_id = p_entity_id
      AND p.entity_type = 'sale'
    ORDER BY p.payment_date ASC, p.created_at ASC
  LOOP
    v_signed :=
      (CASE WHEN COALESCE(v_payment.direction, 'incoming') = 'outgoing' THEN -1 ELSE 1 END)
      * v_payment.amount;

    v_total_paid_after := v_total_paid_before + v_signed;

    IF v_total_paid_before >= v_sale_cost THEN
      INSERT INTO public.erp_profit_ledger (entity_id, user_id, payment_id, amount, ledger_type, entry_date)
      VALUES (
        p_entity_id,
        v_user_id,
        v_payment.id,
        v_signed,
        'PROFIT',
        (v_payment.payment_date)::date
      );
    ELSIF v_total_paid_after <= v_sale_cost THEN
      INSERT INTO public.erp_profit_ledger (entity_id, user_id, payment_id, amount, ledger_type, entry_date)
      VALUES (
        p_entity_id,
        v_user_id,
        v_payment.id,
        v_signed,
        'COST_RECOVERY',
        (v_payment.payment_date)::date
      );
    ELSE
      v_cost_left := v_sale_cost - v_total_paid_before;
      v_profit_part := v_signed - v_cost_left;

      INSERT INTO public.erp_profit_ledger (entity_id, user_id, payment_id, amount, ledger_type, entry_date)
      VALUES (
        p_entity_id,
        v_user_id,
        v_payment.id,
        v_cost_left,
        'COST_RECOVERY',
        (v_payment.payment_date)::date
      );

      INSERT INTO public.erp_profit_ledger (entity_id, user_id, payment_id, amount, ledger_type, entry_date)
      VALUES (
        p_entity_id,
        v_user_id,
        v_payment.id,
        v_profit_part,
        'PROFIT',
        (v_payment.payment_date)::date
      );
    END IF;

    v_total_paid_before := v_total_paid_after;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_rebuild_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.entity_type = 'sale' THEN
      PERFORM public.rebuild_sale_ledger(OLD.entity_id);
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.entity_type = 'sale'
       AND (OLD.entity_id IS DISTINCT FROM NEW.entity_id OR OLD.entity_type IS DISTINCT FROM NEW.entity_type) THEN
      PERFORM public.rebuild_sale_ledger(OLD.entity_id);
    END IF;
    IF NEW.entity_type = 'sale' THEN
      PERFORM public.rebuild_sale_ledger(NEW.entity_id);
    END IF;
    RETURN NEW;
  ELSE
    IF NEW.entity_type = 'sale' THEN
      PERFORM public.rebuild_sale_ledger(NEW.entity_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_ledger ON public.erp_payments;
CREATE TRIGGER trg_payments_ledger
  AFTER INSERT OR UPDATE OR DELETE ON public.erp_payments
  FOR EACH ROW
  EXECUTE PROCEDURE public.trigger_rebuild_ledger();

CREATE OR REPLACE VIEW public.monthly_realized_profit_view
WITH (security_invoker = true) AS
SELECT
  s.user_id,
  DATE_TRUNC('month', l.entry_date)::date AS profit_month,
  SUM(CASE WHEN l.ledger_type = 'PROFIT' THEN l.amount ELSE 0 END) AS total_profit,
  SUM(CASE WHEN l.ledger_type = 'COST_RECOVERY' THEN l.amount ELSE 0 END) AS total_cost_recovery,
  SUM(l.amount) AS total_cash_flow
FROM public.erp_profit_ledger l
INNER JOIN public.erp_sales s ON s.id = l.entity_id
GROUP BY s.user_id, DATE_TRUNC('month', l.entry_date);

GRANT SELECT ON public.monthly_realized_profit_view TO authenticated;
GRANT SELECT ON public.monthly_realized_profit_view TO service_role;

-- Backfill existing sales
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.erp_sales
  LOOP
    PERFORM public.rebuild_sale_ledger(r.id);
  END LOOP;
END $$;
