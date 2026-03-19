-- SaaS: payments ledger naming (entity_*), method + direction, Hebrew sold, brokerage column

-- 1) erp_payments: rename target_* -> entity_* when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'erp_payments' AND column_name = 'target_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'erp_payments' AND column_name = 'entity_id'
  ) THEN
    ALTER TABLE public.erp_payments RENAME COLUMN target_id TO entity_id;
    ALTER TABLE public.erp_payments RENAME COLUMN target_type TO entity_type;
  END IF;
END $$;

ALTER TABLE public.erp_payments ADD COLUMN IF NOT EXISTS method TEXT;
ALTER TABLE public.erp_payments ADD COLUMN IF NOT EXISTS direction TEXT;
UPDATE public.erp_payments SET direction = 'incoming' WHERE direction IS NULL;
ALTER TABLE public.erp_payments ALTER COLUMN direction SET DEFAULT 'incoming';
ALTER TABLE public.erp_payments ALTER COLUMN direction SET NOT NULL;

ALTER TABLE public.erp_payments DROP CONSTRAINT IF EXISTS erp_payments_direction_check;
ALTER TABLE public.erp_payments ADD CONSTRAINT erp_payments_direction_check
  CHECK (direction IN ('incoming', 'outgoing'));

-- Refresh index name for clarity (optional; old index still valid after column rename)
DROP INDEX IF EXISTS idx_erp_payments_user_target;
CREATE INDEX IF NOT EXISTS idx_erp_payments_user_entity
  ON public.erp_payments(user_id, entity_type, entity_id);

-- 2) Brokerage: explicit actual cash received (keeps commission_received in sync via app)
ALTER TABLE public.erp_sales ADD COLUMN IF NOT EXISTS actual_commission_received NUMERIC(12, 2);

UPDATE public.erp_sales
SET actual_commission_received = commission_received
WHERE actual_commission_received IS NULL AND commission_received IS NOT NULL;

-- 3) Inventory: allow Hebrew "נמכר" as sold marker alongside "sold"
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_status_check;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_status_check
  CHECK (status IN ('available', 'in_use', 'sold', 'reserved', 'נמכר'));
