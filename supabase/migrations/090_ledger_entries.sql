-- 090: ledger_entries ג€” unified ledger (append-only)

CREATE TABLE IF NOT EXISTS ledger_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id),
  entry_date    DATE NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount        NUMERIC NOT NULL CHECK (amount > 0),
  category      TEXT NOT NULL CHECK (category IN (
    'sale_income', 'cost_recovery', 'profit',
    'scribe_payment', 'parchment', 'qa_cost', 'tagging_cost',
    'sewing_cost', 'investment_payment', 'other_income', 'other_expense'
  )),
  source_type   TEXT NOT NULL CHECK (source_type IN (
    'erp_payment', 'torah_transaction', 'erp_investment'
  )),
  source_id     UUID NOT NULL,
  deal_type     TEXT REFERENCES sys_deal_types(code),
  sale_id       UUID REFERENCES erp_sales(id),
  project_id    UUID REFERENCES torah_projects(id),
  investment_id UUID REFERENCES erp_investments(id),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ledger_entries'
      AND policyname = 'ledger_entries_select_own'
  ) THEN
    CREATE POLICY ledger_entries_select_own ON ledger_entries
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ledger_entries'
      AND policyname = 'ledger_entries_insert_own'
  ) THEN
    CREATE POLICY ledger_entries_insert_own ON ledger_entries
      FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_date_user
  ON ledger_entries (user_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_deal_type
  ON ledger_entries (deal_type, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_source
  ON ledger_entries (source_type, source_id);
