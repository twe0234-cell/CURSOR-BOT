-- 098: Wave 3.5 - ledger consistency completion.
--
-- Assumptions:
-- 1. For source_type = 'erp_payment', each erp_payments row maps to exactly one
--    ledger_entries row.
-- 2. For source_type = 'torah_transaction', each torah_project_transactions row
--    maps to exactly one ledger_entries row.
-- 3. We intentionally do not add a broad unique constraint for every source_type,
--    because future source types may legitimately split one source into multiple
--    ledger rows.
-- 4. Torah internal_transfer is mapped as direction 'in' / category 'other_income'
--    because ledger_entries has no neutral transfer category yet. This keeps the
--    row visible without inventing a new enum value.

CREATE OR REPLACE FUNCTION public.ledger_erp_payment_direction(p_direction text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_direction
    WHEN 'outgoing' THEN 'out'
    ELSE 'in'
  END;
$$;

CREATE OR REPLACE FUNCTION public.ledger_erp_payment_category(
  p_entity_type text,
  p_direction text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_entity_type = 'sale' AND p_direction = 'incoming' THEN 'sale_income'
    WHEN p_entity_type = 'sale' AND p_direction = 'outgoing' THEN 'other_expense'
    WHEN p_entity_type = 'investment' THEN 'investment_payment'
    ELSE 'other_expense'
  END;
$$;

CREATE OR REPLACE FUNCTION public.ledger_torah_transaction_key(
  p_transaction_type text,
  p_transaction_type_code text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(NULLIF(p_transaction_type_code, ''), p_transaction_type)
    WHEN 'parchment' THEN 'parchment_purchase'
    WHEN 'parchment_expense' THEN 'parchment_purchase'
    WHEN 'qa' THEN 'qa_payment'
    WHEN 'qa_expense' THEN 'qa_payment'
    WHEN 'tagging' THEN 'tagging_payment'
    ELSE COALESCE(NULLIF(p_transaction_type_code, ''), p_transaction_type, 'other_expense')
  END;
$$;

CREATE OR REPLACE FUNCTION public.ledger_torah_transaction_direction(p_transaction_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_transaction_key
    WHEN 'client_payment' THEN 'in'
    WHEN 'internal_transfer' THEN 'in'
    ELSE 'out'
  END;
$$;

CREATE OR REPLACE FUNCTION public.ledger_torah_transaction_category(p_transaction_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_transaction_key
    WHEN 'client_payment' THEN 'sale_income'
    WHEN 'client_refund' THEN 'other_expense'
    WHEN 'scribe_payment' THEN 'scribe_payment'
    WHEN 'parchment_purchase' THEN 'parchment'
    WHEN 'qa_payment' THEN 'qa_cost'
    WHEN 'tagging_payment' THEN 'tagging_cost'
    WHEN 'sewing_payment' THEN 'sewing_cost'
    WHEN 'internal_transfer' THEN 'other_income'
    ELSE 'other_expense'
  END;
$$;

-- One-to-one duplicate protection for the simple source types only.
-- If a staging/prod database already contains duplicates, skip index creation
-- rather than failing the migration; the manual checks below must then be used
-- to inspect and remediate deliberately.
DO $$
BEGIN
  IF to_regclass('public.ledger_entries') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.ledger_entries
      WHERE source_type = 'erp_payment'
      GROUP BY source_id
      HAVING COUNT(*) > 1
    ) THEN
      EXECUTE
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_entries_unique_erp_payment_source
         ON public.ledger_entries (source_id)
         WHERE source_type = ''erp_payment''';
    ELSE
      RAISE NOTICE 'Skipping unique erp_payment ledger index because duplicate source rows already exist.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.ledger_entries
      WHERE source_type = 'torah_transaction'
      GROUP BY source_id
      HAVING COUNT(*) > 1
    ) THEN
      EXECUTE
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_entries_unique_torah_transaction_source
         ON public.ledger_entries (source_id)
         WHERE source_type = ''torah_transaction''';
    ELSE
      RAISE NOTICE 'Skipping unique torah_transaction ledger index because duplicate source rows already exist.';
    END IF;
  END IF;
END;
$$;

-- Backfill existing Torah project transactions into ledger_entries.
DO $$
BEGIN
  IF to_regclass('public.ledger_entries') IS NOT NULL
     AND to_regclass('public.torah_project_transactions') IS NOT NULL
     AND to_regclass('public.torah_projects') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'torah_projects'
         AND column_name = 'deal_type'
     )
  THEN
    INSERT INTO public.ledger_entries (
      user_id,
      entry_date,
      direction,
      amount,
      category,
      source_type,
      source_id,
      deal_type,
      project_id,
      notes,
      created_at
    )
    SELECT
      tp.user_id,
      tpt.date::date,
      public.ledger_torah_transaction_direction(mapped.transaction_key),
      tpt.amount,
      public.ledger_torah_transaction_category(mapped.transaction_key),
      'torah_transaction',
      tpt.id,
      tp.deal_type,
      tpt.project_id,
      tpt.notes,
      tpt.created_at
    FROM public.torah_project_transactions tpt
    JOIN public.torah_projects tp
      ON tp.id = tpt.project_id
    CROSS JOIN LATERAL (
      SELECT public.ledger_torah_transaction_key(
        tpt.transaction_type,
        to_jsonb(tpt) ->> 'transaction_type_code'
      ) AS transaction_key
    ) mapped
    WHERE tpt.amount > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.ledger_entries le
        WHERE le.source_type = 'torah_transaction'
          AND le.source_id = tpt.id
      )
    ON CONFLICT DO NOTHING;
  ELSE
    RAISE NOTICE 'Skipping Torah ledger backfill because required Wave 1/3 tables or columns are missing.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_ledger_from_erp_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.ledger_entries') IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.ledger_entries (
    user_id,
    entry_date,
    direction,
    amount,
    category,
    source_type,
    source_id,
    deal_type,
    sale_id,
    investment_id,
    notes,
    created_at
  )
  SELECT
    NEW.user_id,
    NEW.payment_date::date,
    public.ledger_erp_payment_direction(NEW.direction),
    NEW.amount,
    public.ledger_erp_payment_category(NEW.entity_type, NEW.direction),
    'erp_payment',
    NEW.id,
    COALESCE(s.deal_type, i.deal_type),
    CASE WHEN NEW.entity_type = 'sale' THEN NEW.entity_id END,
    CASE WHEN NEW.entity_type = 'investment' THEN NEW.entity_id END,
    NEW.notes,
    COALESCE(NEW.created_at, now())
  FROM (SELECT 1) seed
  LEFT JOIN public.erp_sales s
    ON NEW.entity_type = 'sale'
   AND s.id = NEW.entity_id
  LEFT JOIN public.erp_investments i
    ON NEW.entity_type = 'investment'
   AND i.id = NEW.entity_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.ledger_entries le
    WHERE le.source_type = 'erp_payment'
      AND le.source_id = NEW.id
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_ledger_from_torah_project_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_key text;
BEGIN
  IF to_regclass('public.ledger_entries') IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_transaction_key := public.ledger_torah_transaction_key(
    NEW.transaction_type,
    to_jsonb(NEW) ->> 'transaction_type_code'
  );

  INSERT INTO public.ledger_entries (
    user_id,
    entry_date,
    direction,
    amount,
    category,
    source_type,
    source_id,
    deal_type,
    project_id,
    notes,
    created_at
  )
  SELECT
    tp.user_id,
    NEW.date::date,
    public.ledger_torah_transaction_direction(v_transaction_key),
    NEW.amount,
    public.ledger_torah_transaction_category(v_transaction_key),
    'torah_transaction',
    NEW.id,
    tp.deal_type,
    NEW.project_id,
    NEW.notes,
    COALESCE(NEW.created_at, now())
  FROM public.torah_projects tp
  WHERE tp.id = NEW.project_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.ledger_entries le
      WHERE le.source_type = 'torah_transaction'
        AND le.source_id = NEW.id
    )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.erp_payments') IS NOT NULL
     AND to_regclass('public.ledger_entries') IS NOT NULL
     AND to_regclass('public.erp_sales') IS NOT NULL
     AND to_regclass('public.erp_investments') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'erp_payments'
         AND column_name = 'entity_id'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'erp_payments'
         AND column_name = 'entity_type'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'erp_payments'
         AND column_name = 'direction'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'erp_sales'
         AND column_name = 'deal_type'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'erp_investments'
         AND column_name = 'deal_type'
     )
  THEN
    DROP TRIGGER IF EXISTS trg_sync_ledger_from_erp_payment ON public.erp_payments;
    CREATE TRIGGER trg_sync_ledger_from_erp_payment
      AFTER INSERT ON public.erp_payments
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_ledger_from_erp_payment();
  ELSE
    RAISE NOTICE 'Skipping erp_payments ledger trigger because required Wave 1/3 tables or columns are missing.';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.torah_project_transactions') IS NOT NULL
     AND to_regclass('public.torah_projects') IS NOT NULL
     AND to_regclass('public.ledger_entries') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'torah_projects'
         AND column_name = 'deal_type'
     )
  THEN
    DROP TRIGGER IF EXISTS trg_sync_ledger_from_torah_project_transaction ON public.torah_project_transactions;
    CREATE TRIGGER trg_sync_ledger_from_torah_project_transaction
      AFTER INSERT ON public.torah_project_transactions
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_ledger_from_torah_project_transaction();
  ELSE
    RAISE NOTICE 'Skipping Torah transaction ledger trigger because required Wave 1/3 tables or columns are missing.';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.sync_ledger_from_erp_payment() IS
  'Wave 3.5: inserts one ledger_entries row for each new erp_payments row, idempotently keyed by source_type/source_id.';

COMMENT ON FUNCTION public.sync_ledger_from_torah_project_transaction() IS
  'Wave 3.5: inserts one ledger_entries row for each new torah_project_transactions row, resolving user_id/deal_type from torah_projects.';
