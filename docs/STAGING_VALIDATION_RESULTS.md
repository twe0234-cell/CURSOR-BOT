# Staging Validation Results - PR #2 / Issue #3

Date: 2026-04-26
Branch: `codex/finalize-claude-erp-waves`
PR: `#2 - Prepare Claude ERP waves for safe review`
Issue: `#3`
Status: `PASSED_WITH_NOTES`

## Controlled Production Validation Decision

No Supabase staging project is available. Per operator instruction on 2026-04-26, controlled production migration validation was used after a verified full backup.

Production project ref: `wohrvtugrzqhxyeerxal`
Migration range: `079` through `098`

## Backup Pre-Flight

| Check | Result |
| --- | --- |
| Backup file | `C:\Users\T590\Documents\Codex\2026-04-26\supabase-github-migrations-db-pr-1\supabase-full-backup-before-pr2.dump` |
| Backup size | `3,150,294` bytes |
| Backup type | Full PostgreSQL logical backup, custom format |
| `pg_restore --list` verification | Pass, exit code `0` |
| `pg_dump` version used for backup | PostgreSQL `17.9` |
| Database version reported by dump | PostgreSQL `17.6` |

## Safety Gate

Forbidden destructive SQL scan for migrations `079`-`098` found no:

- `DROP TABLE`
- `DROP SCHEMA`
- `TRUNCATE`
- executable `DELETE FROM`

Operator clarification allowed `DROP TRIGGER IF EXISTS` for this validation because it recreates PR-defined triggers idempotently and does not delete table data.

## Migration Application

Migrations `079` and `080` were already present in `supabase_migrations.schema_migrations` before this run:

| Migration | Version |
| --- | --- |
| `079_add_deal_type_discriminator` | `20260424082714` |
| `080_torah_projects_3d_status` | `20260424082730` |

Migrations `081` through `098` were applied in order on production using `psql 17.9`, `ON_ERROR_STOP=1`, and one transaction per migration file.

| Migration | Result |
| --- | --- |
| `081_canon_transaction_types.sql` | Applied |
| `082_torah_budget_vs_actual_view.sql` | Applied |
| `083_qa_cost_settlement_tagging.sql` | Applied |
| `084_net_worth_snapshot_fn.sql` | Applied |
| `085_torah_qa_batch_movements.sql` | Applied |
| `086_payment_schedule_variance_view.sql` | Applied |
| `087_project_pace_analysis_view.sql` | Applied |
| `088_calculator_vs_actual_view.sql` | Applied |
| `089_tagging_cost_automation.sql` | Applied |
| `090_ledger_entries.sql` | Applied |
| `091_ledger_backfill_erp_payments.sql` | Applied |
| `092_monthly_dashboard_view.sql` | Applied |
| `093_deal_type_ui_routes.sql` | Applied |
| `094_sys_user_roles.sql` | Applied |
| `095_business_exceptions_view.sql` | Applied |
| `096_broadcast_queue_replay_of_log_id.sql` | Applied |
| `097_sys_audit_log.sql` | Applied |
| `098_ledger_consistency.sql` | Applied |

Migration log artifact: `C:\Users\T590\Documents\Codex\2026-04-26\supabase-github-migrations-db-pr-1\pr2-production-migration-081-098.log`

Note: because `081`-`098` were applied directly via `psql`, they were not inserted into `supabase_migrations.schema_migrations` by Supabase CLI. The SQL objects and data changes were applied successfully; migration-history bookkeeping should be considered before any future automated production migration run.

## SQL Checks From Runbook

SQL result artifact: `C:\Users\T590\Documents\Codex\2026-04-26\supabase-github-migrations-db-pr-1\pr2-production-sql-checks.json`

| Check | Result |
| --- | --- |
| Deal types | Pass, 5 rows: `brokerage_book`, `brokerage_scribe`, `inventory_sale`, `managed_torah_project`, `writing_investment` |
| Torah commercial/production status axes | Pass, 1 row: `contract_signed` / `writing` = `2` |
| Ledger counts | Pass, 1 row: `erp_payment` = `8` |
| Duplicate ledger check | Pass, `0` rows |
| ERP payments vs ledger | Pass, `erp_payments_count=8`, `ledger_erp_payment_count=8` |
| Torah transactions vs ledger | Pass, `torah_tx_count=0`, `ledger_torah_tx_count=0` |
| Audit triggers | Pass, 5 triggers |
| Business exceptions | Pass, `0` rows |
| `public.get_net_worth_snapshot()` | Pass |
| `public.monthly_business_dashboard` | Pass, 4 rows |
| Ledger unique indexes | Pass, 2 expected indexes present |

Audit triggers found:

| Table | Trigger |
| --- | --- |
| `erp_investments` | `trg_sys_audit_erp_investments` |
| `erp_payments` | `trg_sys_audit_erp_payments` |
| `erp_sales` | `trg_sys_audit_erp_sales` |
| `torah_project_transactions` | `trg_sys_audit_torah_project_transactions` |
| `torah_projects` | `trg_sys_audit_torah_projects` |

Net worth snapshot result:

| Field | Value |
| --- | ---: |
| `net_worth_estimate` | `292781` |
| `inventory_cost_value` | `93781` |
| `open_sales_receivable` | `0` |
| `realized_profit_total` | `4000` |
| `open_projects_receivable` | `195000` |

Monthly dashboard returned 4 rows:

| Month | Deal type | Income | Expenses | Net cash flow | Entry count |
| --- | --- | ---: | ---: | ---: | ---: |
| `2026-03-31T21:00:00.000Z` | `writing_investment` | `0` | `11800.00` | `-11800.00` | `4` |
| `2026-02-28T22:00:00.000Z` | `writing_investment` | `0` | `3200.00` | `-3200.00` | `2` |
| `2026-02-28T22:00:00.000Z` | `brokerage_book` | `2400.00` | `0` | `2400.00` | `1` |
| `2026-02-28T22:00:00.000Z` | `inventory_sale` | `10800.00` | `0` | `10800.00` | `1` |

## Required Status Fields

| Item | Result |
| --- | --- |
| Ledger duplicate status | Pass, no duplicates |
| Audit trigger status | Pass, 5 audit triggers present |
| `get_net_worth_snapshot` result | Pass |
| `business_exceptions` result | Pass, 0 rows |
| Smoke checks | Not run in browser during this production DB validation |
| PR #2 can move from Draft to Ready | Yes, from migration, SQL, test, and build validation; still requires user approval |

## Local Verification

| Command | Result |
| --- | --- |
| `npm test` | Pass, 244 tests / 8 files |
| `npm run build` | Pass, Next.js production build completed |
| `npm run audit:migrations` | Pass, exit code `0`; reports 102 migrations and historical findings in older migrations |
| `npm run list:surfaces` | Pass, Pages 31, API routes 18, server actions 21, migrations 102, tests 8 |

## Safety Compliance

Production was used only for the controlled validation authorized on 2026-04-26. No migrations outside `079`-`098` were applied. No `DROP TABLE`, `DROP SCHEMA`, `TRUNCATE`, destructive `DELETE`, DB reset, unrelated destructive SQL, PR merge, or Draft-to-Ready conversion was performed.
