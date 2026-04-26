# Codex Merge Audit - Claude ERP Waves

Date: 2026-04-26
Branch: `codex/finalize-claude-erp-waves`

## A. What Claude Implemented

- Wave 1 migrations `079`-`080`: deal type discriminator infrastructure, `sys_deal_types`, ERP/Torah `deal_type`, Torah commercial/production status axes, and `torah_projects_with_financials`.
- Wave 2 migrations `081`-`089`: canonical Torah transaction types, budget-vs-actual reporting, QA/tagging cost links, net worth function, QA movements, payment schedule variance, pace analysis, calculator-vs-actual view, and tagging cost automation.
- Wave 3 migrations `090`-`096`: unified `ledger_entries`, one-time `erp_payments` backfill, monthly dashboard view, deal-type route metadata, user roles, business exceptions view, and broadcast replay queue linkage.
- TypeScript/UI route metadata needed by the waves, including Torah tagging status typing and broadcast replay action support.

## B. What Claude Documented But Did Not Implement

- `docs/WAVE1_RULEBOOK.md` documents a `sys_audit_log` audit trail concept, but no audit log table/function/triggers existed in migrations `079`-`096`.
- `docs/WAVE3_RULEBOOK.md` describes `ledger_entries` as a unified ledger for `erp_payments` and `torah_project_transactions`, but the implemented migration only backfills existing `erp_payments`. No future-write trigger or server-side insert path currently creates `ledger_entries` for new `erp_payments` or `torah_project_transactions`.
- Wave 3 documentation implies coverage for Torah transactions in the unified ledger, but there is no backfill migration for existing `torah_project_transactions`.

## C. What Codex Fixed Now

- Fixed corrupted Hebrew labels in `TAGGING_STATUS_LABELS`:
  - `not_required`: `לא נדרש`
  - `pending`: `ממתין לתיוג`
  - `in_progress`: `בתיוג`
  - `completed`: `תויג`
- Hardened `replayBroadcast` authorization:
  - Authenticates with `supabase.auth.getUser()` before loading data.
  - Loads `broadcast_logs` by both `id` and authenticated `user_id`.
  - Inserts replay queue rows with the authenticated `user.id`.
- Added `097_sys_audit_log.sql`:
  - Creates `public.sys_audit_log` if missing.
  - Enables RLS and adds a safe own-row SELECT policy.
  - Adds indexes for record timeline and user timeline lookups.
  - Creates `public.sys_audit_trigger()`.
  - Conditionally attaches triggers only to existing allowed business tables: `erp_sales`, `erp_payments`, `erp_investments`, `torah_projects`, `torah_project_transactions`.

## D. Remaining Risks Before Merge

- `ledger_entries` is not yet future-consistent. New `erp_payments` inserts from `app/payments/actions.ts`, `app/transactions/actions.ts`, and investment/sales flows do not automatically insert into `ledger_entries`.
- New `torah_project_transactions` inserts from `app/torah/[id]/actions.ts`, `src/services/torah.service.ts`, and DB automation such as tagging cost triggers do not automatically insert into `ledger_entries`.
- Existing `torah_project_transactions` are not backfilled into `ledger_entries`.
- Existing lint baseline fails on tracked code unrelated to this stabilization pass. Do not mass-fix before merge unless explicitly scoped.
- Migration audit tooling reports historical risky operations in older migrations. The new `097` migration is additive, but the full migration history still needs staging validation.

## E. Manual SQL Checks Required In Supabase Staging Before Production

Run on a staging clone before production:

```sql
SELECT COUNT(*) FROM public.sys_audit_log;

SELECT tgrelid::regclass AS table_name, tgname
FROM pg_trigger
WHERE tgname LIKE 'trg_sys_audit_%'
ORDER BY 1, 2;

SELECT COUNT(*) FROM public.erp_payments;

SELECT COUNT(*) FROM public.ledger_entries
WHERE source_type = 'erp_payment';

SELECT COUNT(*) FROM public.torah_project_transactions;

SELECT COUNT(*) FROM public.ledger_entries
WHERE source_type = 'torah_transaction';

SELECT table_name, record_id, action, changed_at
FROM public.sys_audit_log
ORDER BY changed_at DESC
LIMIT 20;
```

Expected staging interpretation:

- Audit trigger count should match the subset of target tables that exist in the environment.
- `ledger_entries` rows for `erp_payment` should match the one-time backfill expectation from migration `091`.
- `ledger_entries` rows for `torah_transaction` are expected to be missing unless a later migration adds Torah transaction backfill/future-write coverage.

## F. Recommended Merge Path

1. Open PR from `codex/finalize-claude-erp-waves` to `main`.
2. Verify Vercel Preview.
3. Run Supabase staging/clone migration test.
4. Take a production DB backup.
5. Merge only after tests, build, preview, and staging migration checks pass.
