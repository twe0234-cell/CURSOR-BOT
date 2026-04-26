# PR Readiness Checklist

Branch: `codex/finalize-claude-erp-waves`  
Target: `main`

## PR Summary

This branch prepares Claude's ERP waves for production-safe review. It includes ERP/Torah schema infrastructure, reporting views, ledger groundwork, broadcast replay hardening, audit trail infrastructure, and local QA tooling/documentation needed before merge.

Suggested PR title:

```text
Stabilize Claude ERP waves for production review
```

Suggested PR body:

```text
## Summary
- Adds Claude ERP waves migrations 079-097.
- Adds ERP/Torah reporting, deal-type, dashboard, ledger, audit-log, and broadcast replay infrastructure.
- Fixes corrupted Hebrew Torah tagging labels.
- Hardens broadcast replay authorization to authenticated user-owned logs.
- Adds Codex QA tooling and merge audit documentation.

## Validation
- npm test
- npm run build
- npm run audit:migrations
- npm run list:surfaces

## Production Safety
- Do not apply migrations directly to production before a staging clone migration test.
- Validate all SQL checks in docs/CODEX_MERGE_AUDIT.md and this checklist before merge.
- Known ledger consistency gaps are documented and intentionally not fixed in this PR.
```

## What Changed

- Added ERP/Torah migrations `079`-`097`.
- Added deal type and Torah 3D status infrastructure.
- Added Wave 2 budget, QA, tagging, pacing, payment variance, calculator-vs-actual, and net-worth reporting primitives.
- Added Wave 3 `ledger_entries`, dashboard, route metadata, user roles, business exceptions, broadcast replay queue linkage, and audit-log migration.
- Fixed corrupted Hebrew labels for Torah tagging status.
- Hardened `replayBroadcast` so replay loads only the authenticated user's `broadcast_logs` row and queues under the authenticated `user.id`.
- Added local QA tooling and documentation for Codex-driven review.

## What Was Tested

- `npm test`
- `npm run build`
- `npm run audit:migrations`
- `npm run list:surfaces`

## Included Migrations

- `079_add_deal_type_discriminator.sql`
- `080_torah_projects_3d_status.sql`
- `081_canon_transaction_types.sql`
- `082_torah_budget_vs_actual_view.sql`
- `083_qa_cost_settlement_tagging.sql`
- `084_net_worth_snapshot_fn.sql`
- `085_torah_qa_batch_movements.sql`
- `086_payment_schedule_variance_view.sql`
- `087_project_pace_analysis_view.sql`
- `088_calculator_vs_actual_view.sql`
- `089_tagging_cost_automation.sql`
- `090_ledger_entries.sql`
- `091_ledger_backfill_erp_payments.sql`
- `092_monthly_dashboard_view.sql`
- `093_deal_type_ui_routes.sql`
- `094_sys_user_roles.sql`
- `095_business_exceptions_view.sql`
- `096_broadcast_queue_replay_of_log_id.sql`
- `097_sys_audit_log.sql`

## Staging DB Validation Required

Do not apply migrations directly to production before a staging clone test.

Required staging checks:

```sql
SELECT COUNT(*) FROM public.erp_payments;

SELECT COUNT(*) FROM public.ledger_entries
WHERE source_type = 'erp_payment';

SELECT COUNT(*) FROM public.torah_project_transactions;

SELECT COUNT(*) FROM public.ledger_entries
WHERE source_type = 'torah_transaction';

SELECT tgrelid::regclass AS table_name, tgname
FROM pg_trigger
WHERE tgname LIKE 'trg_sys_audit_%'
ORDER BY 1, 2;

SELECT table_name, record_id, action, changed_at
FROM public.sys_audit_log
ORDER BY changed_at DESC
LIMIT 20;
```

Expected interpretation:

- `ledger_entries` rows with `source_type = 'erp_payment'` should match the intended one-time backfill from migration `091`.
- `ledger_entries` rows with `source_type = 'torah_transaction'` are expected to be missing until Wave 3.5 is implemented.
- Audit triggers should exist for each available target table from `097`: `erp_sales`, `erp_payments`, `erp_investments`, `torah_projects`, `torah_project_transactions`.

## Known Risks

- `ledger_entries` is not future-consistent yet.
- `torah_project_transactions` are not backfilled to `ledger_entries`.
- New `erp_payments` and `torah_project_transactions` do not automatically create future `ledger_entries`.
- Lint baseline still has pre-existing failures unrelated to the stabilization commits.
- Historical migrations contain risky operations reported by `npm run audit:migrations`; validate on staging clone before production.

## Required Next Task

Do not fix ledger consistency in this PR. The exact next task is:

```text
Wave 3.5 — Ledger Consistency Completion
```

Wave 3.5 scope:

- Backfill `torah_project_transactions` to `ledger_entries`.
- Add future sync for new `erp_payments`.
- Add future sync for new `torah_project_transactions`.
- Add tests for no duplicate ledger entries.
- Add staging SQL checks for ledger counts, source coverage, and duplicate prevention.

## PR Readiness Decision

Ready to open PR for review after the local checks pass, with the explicit condition that migrations must be tested on a Supabase staging clone before production deployment or merge-to-production workflow.
