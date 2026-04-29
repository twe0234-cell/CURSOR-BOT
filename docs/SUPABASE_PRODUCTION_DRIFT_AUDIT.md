# Supabase Production Drift Audit

Date: 2026-04-28
Supabase production ref: `wohrvtugrzqhxyeerxal`
Original audit branch: `codex/supabase-production-drift-audit`
Runtime mitigation branch: `codex/fix-erp-dashboard-missing-torah-snapshot`
Base main commit inspected: `719d069`

## Scope And Safety

- Read-only audit only.
- No migrations were applied.
- No `supabase db push` was run.
- No migration repair was run.
- No production data was mutated.
- App code was not changed.

## Migration History State

Production `supabase_migrations.schema_migrations` currently records through:

| Latest recorded version | Latest recorded name |
| --- | --- |
| `20260424082730` | `080_torah_projects_3d_status` |

Result: migration history mismatch = **yes**.

Local migration files `081` through `099` exist, but are not recorded in Supabase CLI migration history.

## Local Migrations 081-099 Vs Production Objects

| Migration | Main objects / changes | Production object state |
| --- | --- | --- |
| `081_canon_transaction_types.sql` | `sys_transaction_types`, `torah_project_transactions.transaction_type` | Present |
| `082_torah_budget_vs_actual_view.sql` | `torah_project_budget_vs_actual` | Present |
| `083_qa_cost_settlement_tagging.sql` | `torah_qa_batches.is_cost_settled`, `settled_at`, `settlement_tx_id`; `torah_projects.tagging_status` | Present |
| `084_net_worth_snapshot_fn.sql` | `get_net_worth_snapshot()` | Present |
| `085_torah_qa_batch_movements.sql` | `torah_qa_batch_movements`, `torah_qa_batch_current_location` | Present |
| `086_payment_schedule_variance_view.sql` | `torah_payment_schedule_variance` | Present |
| `087_project_pace_analysis_view.sql` | `torah_project_pace_analysis` | Present |
| `088_calculator_vs_actual_view.sql` | `torah_calculator_vs_actual` | Present |
| `089_tagging_cost_automation.sql` | `create_tagging_cost_tx()`, `trg_tagging_cost_auto` | Present |
| `090_ledger_entries.sql` | `ledger_entries` | Present |
| `091_ledger_backfill_erp_payments.sql` | one-time ledger backfill from `erp_payments` | Object existence not applicable; history not recorded |
| `092_monthly_dashboard_view.sql` | `monthly_business_dashboard`, `monthly_profit_by_deal_type` | Present |
| `093_deal_type_ui_routes.sql` | `sys_deal_types.ui_route` | Present |
| `094_sys_user_roles.sql` | `sys_user_roles`, `is_admin_user()`, `has_role()` | Present |
| `095_business_exceptions_view.sql` | `business_exceptions` | Present |
| `096_broadcast_queue_replay_of_log_id.sql` | `broadcast_queue.replay_of_log_id` | Present |
| `097_sys_audit_log.sql` | `sys_audit_log`, `sys_audit_trigger()` | Present |
| `098_ledger_consistency.sql` | ledger sync functions and triggers on `erp_payments` / `torah_project_transactions` | Present |
| `099_torah_financial_dashboard_view.sql` | `torah_financial_dashboard_snapshot` | **Missing** |

Exact missing production object found:

- `public.torah_financial_dashboard_snapshot`

## Code References Checked

| Object | Current app code references | Runtime risk |
| --- | --- | --- |
| `torah_financial_dashboard_snapshot` | `app/dashboard/erp/actions.ts`, `app/dashboard/erp/page.tsx` | **Yes**. `/dashboard/erp` queries this view. Missing view is captured as a dashboard error and the Torah snapshot section will be empty/degraded. |
| `torah_project_budget_vs_actual` | `app/torah/[id]/actions.ts`, `components/torah/TorahProjectWorkflowSummary.tsx` | No missing-object risk observed; production object exists. |
| `torah_projects_with_financials` | Docs only; no active app code reference found. | No runtime risk observed. |
| `monthly_business_dashboard` | `app/dashboard/erp/actions.ts`, `app/dashboard/erp/page.tsx` | No missing-object risk observed; production object exists. |
| `business_exceptions` | `app/dashboard/erp/actions.ts`, `app/torah/[id]/actions.ts`, UI/docs references | No missing-object risk observed; production object exists. |
| `ledger_entries` | `app/dashboard/erp/actions.ts`, `app/dashboard/erp/page.tsx` | No missing-object risk observed; production object exists. |
| `broadcast_queue` | `app/api/cron/process-broadcasts/route.ts`, `app/broadcast/actions.ts` | No missing-object risk observed for checked `replay_of_log_id`; production column exists. |

`torah_financial_dashboard_snapshot` is still used: **yes**.

## Runtime Missing Object Risk

Runtime missing object risk = **yes**, limited to `/dashboard/erp` Torah financial snapshot.

The server action `fetchReadOnlyErpDashboard()` queries `torah_financial_dashboard_snapshot`. If the view is missing, the action appends an error string to the dashboard payload and returns `torahFinancialSnapshot: []`. This likely degrades the Torah snapshot panel rather than crashing the entire ERP dashboard.

## Local Uncommitted Changes

Checked:

- `git status --short`
- changed file list
- untracked file list

Result before creating this report: no local uncommitted app/code changes were present on the audit branch.

After this audit, the only intended working-tree change is:

- `docs/SUPABASE_PRODUCTION_DRIFT_AUDIT.md`

## Findings

- Production migration history is behind the actual object state.
- Most objects from migrations `081` through `098` appear to exist in production despite not being recorded in `supabase_migrations.schema_migrations`.
- Migration `099`'s read model view, `public.torah_financial_dashboard_snapshot`, is missing in production.
- Current app runtime still references the missing `torah_financial_dashboard_snapshot` view from `/dashboard/erp`.
- `torah_projects_with_financials` appears to be documentation-only in current app code, so it is not a live missing-object risk.

## Recommended Next Safe Action

Do not run broad `supabase db push` while migration history stops at `080`; it may attempt to replay already-applied migrations `081-098`.

Recommended safe path:

1. Keep production unchanged until reviewed.
2. Create/verify a fresh logical backup before any repair or DDL.
3. Decide between two controlled options:
   - Preferred: mark migration history for `081-098` as applied using Supabase's documented migration repair flow, then apply only missing migration `099`.
   - Alternative: manually create only `public.torah_financial_dashboard_snapshot` from migration `099`, then separately align migration history in a dedicated maintenance window.
4. Before any action, run a dry read-only object check for all `081-099` objects again.
5. After remediation, verify `/dashboard/erp` no longer reports `torah_financial_dashboard_snapshot` errors.

No remediation was executed in this audit.

## Runtime Mitigation Update

Follow-up branch `codex/fix-erp-dashboard-missing-torah-snapshot` removes the `/dashboard/erp` runtime dependency on the missing `public.torah_financial_dashboard_snapshot` view.

Chosen mitigation:

- Query `public.torah_projects` first with explicit `.eq("user_id", user.id)`.
- Build the owned project ID list from that tenant-filtered query.
- Query `public.torah_project_budget_vs_actual` only with `.in("id", ownedProjectIds)`.
- Combine labels/statuses from `torah_projects` with financial fields from `torah_project_budget_vs_actual` in server action code.

This preserves tenant safety without creating the missing production view and without touching production DB state.

Current recommendation after mitigation:

1. Merge the code fallback so `/dashboard/erp` is no longer blocked by missing migration `099`.
2. Keep the separate migration-history alignment task open.
3. Do not run broad `supabase db push` until migration history is repaired or otherwise deliberately handled.
