export const TORAH_LEDGER_TRANSACTION_TYPES = [
  "client_payment",
  "scribe_payment",
  "fix_deduction",
  "qa_expense",
  "parchment_expense",
  "other_expense",
] as const;

export type TorahLedgerTransactionType = (typeof TORAH_LEDGER_TRANSACTION_TYPES)[number];
