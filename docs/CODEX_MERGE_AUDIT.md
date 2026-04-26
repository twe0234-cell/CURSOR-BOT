# Codex Merge Audit - Claude ERP Waves

Date: 2026-04-26  
Branch: `codex/finalize-claude-erp-waves`

## A. What Claude Implemented

- Wave 1 migrations `079`-`080`: deal type discriminator infrastructure, `sys_deal_types`, ERP/Torah `deal_type`, Torah commercial/production status axes, and `torah_projects_with_financials`.
- Wave 2 migrations `081`-`089`: canonical Torah transaction types, budget-vs-actual reporting, QA/tagging cost links, net worth function, QA movements, payment schedule variance, pace analysis, calculator-vs-actual view, and tagging cost automation.
- Wave 3 migrations `090`-`096`: unified `ledger_entries`, one-time `erp_payments` backfill, monthly dashboard view, deal-type route metadata, user roles, business exceptions view, and broadcast replay queue linkage.
- TypeScript/UI route metadata needed by the waves, including Torah tagging status typing and broadcast replay action support.

## B. What Claude Documented But Did Not Implement

- `docs/WAVE1_RULEBOOK.md` documented a `sys_audit_log` audit trail concept, but no audit log table/function/triggers existed in migrations `079`-`096`.
- `docs/WAVE3_RULEBOOK.md` described `ledger_entries` as a unified ledger for `erp_payments` and `torah_project_transactions`, but the original Wave 3 implementation only backfilled existing `erp_payments`. Codex Wave 3.5 completes this with migration `098`.

## C. What Codex Fixed Now

- Fixed corrupted Hebrew labels in `TAGGING_STATUS_LABELS`: `לא נדרש`, `ממתין לתיוג`, `בתיוג`, `תויג`.
- Hardened `replayBroadcast` authorization:
  - Authenticates with `supabase.auth.getUser()` before loading data.
  - Loads `broadcast_logs` by both `id` and authenticated `user_id`.
  - Inserts replay queue rows with the authenticated `user.id`.
- Added `097_sys_audit_log.sql`:
  - Creates `public.sys_audit_log` if missing.
  - Enables RLS and adds a safe own-row SELECT policy.
  - Adds indexes for record timeline and user timeline lookups.
  - Creates `public.sys_audit_trigger()`.
  - Conditionally attaches triggers only to existing allowed business tables.
- Added `098_ledger_consistency.sql`:
  - Adds one-to-one duplicate protection for `erp_payment` and `torah_transaction` ledger sources when no duplicates already exist.
  - Backfills existing `torah_project_transactions` to `ledger_entries`.
  - Adds future sync for new `erp_payments`.
  - Adds future sync for new `torah_project_transactions`.
  - Documents mapping assumptions in SQL comments.

## D. Remaining Risks Before Merge

- Wave 3.5 ledger consistency is implemented, but must be verified on a Supabase staging clone before production.
- If staging already contains duplicate `ledger_entries` rows for the same `erp_payment` or `torah_transaction`, migration `098` intentionally skips creating that partial unique index and raises a notice; inspect duplicates manually before production.
- Existing lint baseline fails on tracked code unrelated to this stabilization pass. Do not mass-fix before merge unless explicitly scoped.
- Migration audit tooling reports historical risky operations in older migrations. The new `097` and `098` migrations are additive, but the full migration history still needs staging validation.

## E. Manual SQL Checks Required In Supabase Staging Before Production

Do not apply migrations directly to production before a staging clone test.

```sql
SELECT COUNT(*) FROM public.sys_audit_log;

SELECT tgrelid::regclass AS table_name, tgname
FROM pg_trigger
WHERE tgname LIKE 'trg_sys_audit_%'
ORDER BY 1, 2;

SELECT COUNT(*) FROM public.erp_payments;

SELECT COUNT(*)
FROM public.ledger_entries
WHERE source_type = 'erp_payment';

SELECT COUNT(*) FROM public.torah_project_transactions;

SELECT COUNT(*)
FROM public.ledger_entries
WHERE source_type = 'torah_transaction';

SELECT source_type, COUNT(*)
FROM public.ledger_entries
GROUP BY source_type
ORDER BY source_type;

SELECT source_type, source_id, COUNT(*)
FROM public.ledger_entries
WHERE source_type IN ('erp_payment', 'torah_transaction')
GROUP BY source_type, source_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

SELECT table_name, record_id, action, changed_at
FROM public.sys_audit_log
ORDER BY changed_at DESC
LIMIT 20;
```

Expected staging interpretation:

- Audit trigger count should match the subset of target tables that exist in the environment.
- `ledger_entries` rows for `erp_payment` should match the one-time backfill expectation from migration `091`.
- `ledger_entries` rows for `torah_transaction` should match positive-amount `torah_project_transactions` after migration `098`.
- Duplicate query should return zero rows for `erp_payment` and `torah_transaction`.

## F. Recommended Merge Path

1. Open PR from `codex/finalize-claude-erp-waves` to `main`.
2. Verify Vercel Preview.
3. Run Supabase staging/clone migration test.
4. Take a production DB backup.
5. Merge only after tests, build, preview, and staging migration checks pass.
