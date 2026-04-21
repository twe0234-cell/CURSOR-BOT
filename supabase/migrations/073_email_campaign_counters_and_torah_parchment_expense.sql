-- 073: harden email campaign counters + allow parchment expense in Torah ledger
-- (Renumbered from 072_* to avoid duplicate 072 prefix alongside 072_crm_merge_soft_delete.)

-- Some environments were created before migration 064 and still miss these columns.
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS sent_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Expand allowed Torah ledger transaction types to include parchment expense.
ALTER TABLE public.torah_project_transactions
  DROP CONSTRAINT IF EXISTS torah_project_transactions_transaction_type_check;

ALTER TABLE public.torah_project_transactions
  ADD CONSTRAINT torah_project_transactions_transaction_type_check
  CHECK (
    transaction_type IN (
      'client_payment',
      'scribe_payment',
      'fix_deduction',
      'qa_expense',
      'parchment_expense',
      'other_expense'
    )
  );
