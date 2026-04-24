-- 081: canonicalize torah_project_transactions.transaction_type

CREATE TABLE IF NOT EXISTS sys_transaction_types (
  code           TEXT PRIMARY KEY,
  label_he       TEXT NOT NULL,
  direction      TEXT NOT NULL CHECK (direction IN ('income', 'expense')),
  affects_profit BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO sys_transaction_types (code, label_he, direction, affects_profit) VALUES
  ('client_payment',     'תשלום מלקוח',    'income',  TRUE),
  ('client_refund',      'החזר ללקוח',     'expense', TRUE),
  ('scribe_payment',     'תשלום לסופר',    'expense', FALSE),
  ('parchment_purchase', 'קניית קלף',      'expense', FALSE),
  ('qa_payment',         'תשלום למגיה',    'expense', FALSE),
  ('tagging_payment',    'תשלום לתיוג',    'expense', FALSE),
  ('sewing_payment',     'תשלום לתפירה',   'expense', FALSE),
  ('other_expense',      'הוצאה אחרת',     'expense', FALSE),
  ('internal_transfer',  'העברה פנימית',   'income',  FALSE)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE torah_project_transactions
  ADD COLUMN IF NOT EXISTS transaction_type_code TEXT
    REFERENCES sys_transaction_types(code);

UPDATE torah_project_transactions
SET transaction_type_code = CASE
  WHEN transaction_type IN (
    'client_payment',
    'client_refund',
    'scribe_payment',
    'qa_payment',
    'tagging_payment',
    'sewing_payment',
    'other_expense',
    'internal_transfer',
    'parchment_purchase'
  ) THEN transaction_type
  WHEN transaction_type = 'parchment' THEN 'parchment_purchase'
  WHEN transaction_type = 'qa' THEN 'qa_payment'
  WHEN transaction_type = 'tagging' THEN 'tagging_payment'
  ELSE 'other_expense'
END
WHERE transaction_type_code IS NULL
  AND transaction_type IS NOT NULL;
