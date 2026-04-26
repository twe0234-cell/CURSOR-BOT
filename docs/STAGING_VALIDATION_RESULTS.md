# Staging Validation Results - PR #2 / Issue #3

Date: 2026-04-26  
Branch: `codex/finalize-claude-erp-waves`  
PR: `#2 - Prepare Claude ERP waves for safe review`  
Issue: `#3`  
Status: `BLOCKED`

## Summary

Supabase staging validation did not run because staging/clone database access is not available in this local environment.

No production database was touched. No migrations were applied. No destructive database commands were run.

## What Was Checked Locally

- Current branch is `codex/finalize-claude-erp-waves`.
- Required documentation was reviewed:
  - `docs/STAGING_VALIDATION_RUNBOOK.md`
  - `docs/PR_READINESS_CHECKLIST.md`
  - `docs/CODEX_MERGE_AUDIT.md`
- Local env files were checked:
  - `.env.example` exists.
  - No local `.env`, `.env.local`, or staging env file is present.
- Relevant environment variable names were checked:
  - No `SUPABASE`, `POSTGRES`, `DATABASE`, `DB_`, or `VERCEL` variables are available in the shell environment.
- Local project links were checked:
  - `.vercel` project link is not present.
  - `supabase/migrations` exists locally.

## Missing Access / Credentials

Validation requires one of the following staging-only access paths:

- Supabase staging/clone project URL and project ref.
- A staging-only Postgres connection string or database URL with permission to apply migrations and run the SQL checks.
- OR Supabase CLI access for the staging/clone project, including access token/project ref/database password as required by the CLI.
- Confirmation that the target Supabase project is a staging/clone database and not production.
- Confirmation that a recent production backup exists before any staging migration rehearsal.
- Vercel Preview URL or confirmation that PR #2 preview/build is green and connected to staging/clone data.

Do not provide production credentials for this validation.

## Required Supabase Steps Before Validation Can Continue

1. Create or identify the Supabase staging/clone project.
2. Confirm the project is not production.
3. Confirm a recent production database backup exists and is accessible.
4. Provide staging-only connection access using one approved method:
   - Supabase SQL Editor access for the staging/clone project, or
   - staging Postgres connection string, or
   - Supabase CLI credentials/project ref for the staging/clone project.
5. Apply migrations `079` through `098` to staging/clone only.
6. Run every SQL block in `docs/STAGING_VALIDATION_RUNBOOK.md`.
7. Record the query outputs in this file or in the PR notes.
8. Run the smoke test checklist from `docs/STAGING_VALIDATION_RUNBOOK.md`.
9. Keep PR #2 as Draft until all staging checks pass.

## SQL Checks Not Yet Run

The following checks are still pending on staging:

- Deal types.
- Torah commercial/production status axes.
- Ledger counts by `source_type`.
- Duplicate ledger rows.
- `erp_payments` count vs `ledger_entries` count.
- positive `torah_project_transactions` count vs `ledger_entries` count.
- Audit triggers.
- Business exceptions.
- `public.get_net_worth_snapshot()`.
- `public.monthly_business_dashboard`.

## Local Verification Results

These checks were run locally on the branch after recording the staging blocker:

- `npm test`: passed, 244/244 tests.
- `npm run build`: passed.
- `npm run audit:migrations`: passed; 102 migrations detected. Historical duplicate numbering and risky findings remain in older migrations.
- `npm run list:surfaces`: passed; Pages 31, API routes 18, server actions 21, migrations 102, tests 8.

## Smoke Tests Not Yet Run

The following app-level checks are still pending on the Vercel Preview connected to staging/clone data:

- Login works.
- CRM list opens.
- Contact detail opens.
- Torah list opens.
- Torah project detail opens.
- Broadcast page opens.
- `replayBroadcast` works only for own broadcasts.
- Dashboard pages do not crash.
- Transactions page opens.
- Investments page opens.

## Merge Readiness

PR #2 cannot move from Draft to Ready yet.

Required before Ready:

- `npm test` passes.
- `npm run build` passes.
- Vercel Preview works.
- Staging/clone migrations `079`-`098` apply successfully.
- Manual SQL checks pass.
- Smoke tests pass.
- Production DB backup is ready.
