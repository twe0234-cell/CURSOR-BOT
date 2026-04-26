# Supabase Migration History Alignment

Date: 2026-04-26

## Scope

This document records a read-only investigation of Supabase production migration bookkeeping after PR #2 and the ERP dashboard follow-up were merged to `main`.

- Supabase production ref: `wohrvtugrzqhxyeerxal`
- PR #2 merge commit: `c09e2d2e82b2d596f015c377ed7bfc901106230a`
- Post-merge verification commit: `418a83839f7019f2b4d218b9da0eb8ef03a0dfef`
- Latest `main` inspected for this document: `ccbe43b63eaa8dedfee34120fb78c91571925c83`
- Hard rule followed: read-only inspection only; no migrations, repairs, schema changes, or production data changes were performed.

## Local Migration Files

Current local files in `supabase/migrations` for the PR #2 range:

| Local version | File |
| --- | --- |
| `079` | `079_add_deal_type_discriminator.sql` |
| `080` | `080_torah_projects_3d_status.sql` |
| `081` | `081_canon_transaction_types.sql` |
| `082` | `082_torah_budget_vs_actual_view.sql` |
| `083` | `083_qa_cost_settlement_tagging.sql` |
| `084` | `084_net_worth_snapshot_fn.sql` |
| `085` | `085_torah_qa_batch_movements.sql` |
| `086` | `086_payment_schedule_variance_view.sql` |
| `087` | `087_project_pace_analysis_view.sql` |
| `088` | `088_calculator_vs_actual_view.sql` |
| `089` | `089_tagging_cost_automation.sql` |
| `090` | `090_ledger_entries.sql` |
| `091` | `091_ledger_backfill_erp_payments.sql` |
| `092` | `092_monthly_dashboard_view.sql` |
| `093` | `093_deal_type_ui_routes.sql` |
| `094` | `094_sys_user_roles.sql` |
| `095` | `095_business_exceptions_view.sql` |
| `096` | `096_broadcast_queue_replay_of_log_id.sql` |
| `097` | `097_sys_audit_log.sql` |
| `098` | `098_ledger_consistency.sql` |

## Production Migration History Observed

Read-only SQL was run inside `begin read only` against `supabase_migrations.schema_migrations`.

The history table exists with primary key `version`. Its columns are:

- `version text not null`
- `statements text[]`
- `name text`
- `created_by text`
- `idempotency_key text`
- `rollback text[]`

Production history includes these rows related to the inspected range:

| Recorded version | Recorded name |
| --- | --- |
| `20260424082714` | `079_add_deal_type_discriminator` |
| `20260424082730` | `080_torah_projects_3d_status` |

No production history rows were found for local versions `081` through `098`.

No production history rows were found with local versions `079` or `080`; those two migrations are present only as timestamped versions with matching names.

## Observed State

- Migrations `081` through `098` were applied directly with `psql` during controlled production validation.
- The SQL objects/data changes from `081` through `098` validated successfully in `docs/STAGING_VALIDATION_RESULTS.md`.
- Supabase CLI bookkeeping does not currently show `081` through `098` as applied.
- Migrations `079` and `080` are recorded by name, but under timestamp versions, while the current local files use numeric prefixes.

## Risk

Future `supabase db push` or Supabase branching/deployment workflows may treat unrecorded local migration versions as pending.

Risk level: high enough to block automated production migration pushes until repaired.

Specific risk:

- `081` through `098` may be considered unapplied and could be re-run, causing duplicate-object errors, duplicate backfill attempts, or idempotency-dependent behavior.
- `079` and `080` may also appear mismatched to the CLI because the current local version prefixes are `079` and `080`, while production history records timestamp versions for the same names.
- If Supabase CLI refuses to push due to remote/local divergence, that is safer than re-running SQL, but still blocks normal migration workflow.

## Safe Remediation Options

Option A, preferred: repair Supabase migration bookkeeping with the Supabase CLI.

This updates only `supabase_migrations.schema_migrations`; it should not apply migration SQL or alter application tables. Run only after operator approval and after confirming the production backup is retained.

```powershell
supabase link --project-ref wohrvtugrzqhxyeerxal
supabase migration list --linked
supabase migration repair 079 080 081 082 083 084 085 086 087 088 089 090 091 092 093 094 095 096 097 098 --status applied --linked
supabase migration list --linked
```

If `supabase migration list --linked` shows that `079` and `080` are already aligned despite their timestamped rows, narrow the repair command to only:

```powershell
supabase migration repair 081 082 083 084 085 086 087 088 089 090 091 092 093 094 095 096 097 098 --status applied --linked
```

Option B: manual SQL repair, only if Supabase CLI is unavailable.

This is less preferred because it bypasses CLI guardrails. If used, perform it in a transaction and insert only bookkeeping rows into `supabase_migrations.schema_migrations`, with `ON CONFLICT (version) DO NOTHING`. Do not run migration SQL.

```sql
begin;

insert into supabase_migrations.schema_migrations (version, name)
values
  ('081', 'canon_transaction_types'),
  ('082', 'torah_budget_vs_actual_view'),
  ('083', 'qa_cost_settlement_tagging'),
  ('084', 'net_worth_snapshot_fn'),
  ('085', 'torah_qa_batch_movements'),
  ('086', 'payment_schedule_variance_view'),
  ('087', 'project_pace_analysis_view'),
  ('088', 'calculator_vs_actual_view'),
  ('089', 'tagging_cost_automation'),
  ('090', 'ledger_entries'),
  ('091', 'ledger_backfill_erp_payments'),
  ('092', 'monthly_dashboard_view'),
  ('093', 'deal_type_ui_routes'),
  ('094', 'sys_user_roles'),
  ('095', 'business_exceptions_view'),
  ('096', 'broadcast_queue_replay_of_log_id'),
  ('097', 'sys_audit_log'),
  ('098', 'ledger_consistency')
on conflict (version) do nothing;

commit;
```

Include `079` and `080` manually only if CLI comparison confirms the current local numeric versions are still considered pending.

## Exact Recommended Fix

Do not execute any future production `supabase db push` until migration history is aligned.

Recommended operator-approved fix:

```powershell
supabase link --project-ref wohrvtugrzqhxyeerxal
supabase migration list --linked
supabase migration repair 079 080 081 082 083 084 085 086 087 088 089 090 091 092 093 094 095 096 097 098 --status applied --linked
supabase migration list --linked
```

If the pre-repair list shows `079` and `080` as aligned, use the narrowed `081` through `098` repair command instead.

Reference: Supabase CLI supports `supabase migration repair [version] ... --status applied` for repairing remote migration history.

## Rollback And Safety Note

Migration-history repair does not restore schema or data; it only marks bookkeeping rows as applied. If an incorrect version is marked applied, use Supabase CLI repair with `--status reverted` for that bookkeeping row after review.

The verified full PostgreSQL logical backup from PR #2 validation should be retained before any bookkeeping repair:

`C:\Users\T590\Documents\Codex\2026-04-26\supabase-github-migrations-db-pr-1\supabase-full-backup-before-pr2.dump`

## Future Migration Workflow Recommendation

- Apply production migrations through Supabase CLI where possible so SQL execution and `supabase_migrations.schema_migrations` stay in sync.
- If emergency `psql` application is required, immediately follow it with an explicit migration-history repair task before any later `db push`.
- Prefer staging or a Supabase branch for validation before production. If no staging project exists, keep the backup-first controlled production flow documented in `docs/STAGING_VALIDATION_RESULTS.md`.
- Keep local migration filenames stable after they have been recorded remotely; renaming prefixes can create remote/local history drift even when SQL objects already exist.
