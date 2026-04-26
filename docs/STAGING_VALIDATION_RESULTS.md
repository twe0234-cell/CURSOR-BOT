# Staging Validation Results - PR #2 / Issue #3

Date: 2026-04-26  
Branch: `codex/finalize-claude-erp-waves`  
PR: `#2 - Prepare Claude ERP waves for safe review`  
Issue: `#3`  
Status: `BLOCKED` (Supabase staging/clone not provable; no database connectivity)

## Supabase pre-flight (required before any SQL)

| Check | Result |
| --- | --- |
| Supabase project ref (from API URL) | **Unavailable** — `NEXT_PUBLIC_SUPABASE_URL` is present in `.env.local` but **empty** |
| Database host / project ref (from `DATABASE_URL`) | **Unavailable** — `DATABASE_URL` is **empty** |
| Environment variables present by name (values not recorded) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (and other app secrets per `.env.example`) |
| Staging/clone vs production | **Cannot determine.** With no project URL, ref, or Postgres host, the connected project cannot be identified, so it cannot be proven non-production. |
| Migrations 079–098 applied or validated on Supabase | **No** — no connection; **nothing applied** (including production) |

**Safety compliance:** No production database was touched. No migrations were applied anywhere. No destructive SQL was run. PR #2 was not merged and was not converted from Draft. Supabase SQL Editor / CLI was not used because there is no configured staging target.

## Local verification (this workspace)

Commands run on branch `codex/finalize-claude-erp-waves` after `git fetch` / `git pull` (fast-forward to `origin`).

| Command | Result |
| --- | --- |
| `npm test` | **Pass** — 244 tests, 8 files |
| `npm run build` | **Pass** — Next.js 16.1.6 production build completed |
| `npm run audit:migrations` | **Pass** — 102 migrations reported (duplicate filename numbering and historical `drop` findings in older files per script output) |
| `npm run list:surfaces` | **Pass** — Pages 31, API routes 18, server actions 21, migrations 102, tests 8 |

### Second run (post-documentation pass)

| Command | Result |
| --- | --- |
| `npm test` | **Pass** — 244/244 |
| `npm run build` | **Pass** |

## Manual SQL checks (Supabase staging/clone)

**Not executed.** Blocked for the same reason as migrations: no valid `DATABASE_URL` or project URL, so the runbook queries (deal types, Torah status axes, ledger counts, duplicate ledger, `erp_payments` vs ledger, `torah_project_transactions` vs ledger, audit triggers, `business_exceptions`, `get_net_worth_snapshot()`, `monthly_business_dashboard`) were not run.

## Detailed checklist (N/A = blocked)

| Item | Status |
| --- | --- |
| Confirmed Supabase project is staging/clone | **No** |
| Migrations 079–098 applied/validated on staging | **No** |
| SQL checks (aggregate) | **Not run** (blocked) |
| Ledger duplicate status | **Not verified** |
| Audit trigger status | **Not verified** |
| Net worth function status | **Not verified** |
| Business exceptions status | **Not verified** |
| Smoke test (Vercel Preview / staging data) | **Not run** |
| PR #2 can move from Draft to Ready | **No** — staging DB validation and smoke tests are incomplete; production backup not confirmed in this run |

## Blockers (for Ready)

1. **No provable non-production Supabase target:** Local `.env.local` does not set `NEXT_PUBLIC_SUPABASE_URL` or `DATABASE_URL` (empty). Without a project ref and a policy-backed statement that the target is staging/clone (not production), pre-flight fails per `docs/STAGING_VALIDATION_RUNBOOK.md` section A.
2. Migrations 079–098 not applied/validated on any database from this environment.
3. All manual SQL checks from `docs/STAGING_VALIDATION_RUNBOOK.md` are pending.
4. Vercel Preview smoke tests against staging/clone data not performed here.

## What is needed to unblock

1. Configure **staging/clone only** credentials locally or run SQL in the Supabase Dashboard on a project that is **documented and verified** as non-production (e.g. separate project name/ref from production, or internal runbook with production ref vs staging ref).
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `DATABASE_URL` (or use Supabase CLI with a **staging** project ref) for that project only.
3. Apply/validate migrations 079–098 on staging, then re-run this results file and the full SQL + smoke list.

## If validation had passed (policy reminder)

Per operator instructions: still **do not merge** from this process; PR #2 may be considered for **Ready** only after user approval and confirmed production backup — not done in this run.

## Merge Readiness (PR #2)

- **Move from Draft to Ready:** **Not recommended** until Supabase staging proof, migrations, SQL checks, and smoke tests succeed.

## Documentation reviewed

- `docs/STAGING_VALIDATION_RUNBOOK.md`
- `docs/PR_READINESS_CHECKLIST.md`
- `docs/CODEX_MERGE_AUDIT.md`
- `docs/AI_AGENT_SAFETY_RULES.md` (reference)

No production resources were used. This file is the only intended commit for the validation run (documentation/results only).
