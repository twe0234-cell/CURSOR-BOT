# Staging Validation Runbook - ERP Waves 079-098

This runbook is for validating PR #2 before it can move from Draft to Ready. It is written for an operator who does not need to understand the full codebase.

Do not run these checks on production. Use only a Supabase staging or clone database.

## A. Pre-Flight

Before running any SQL or opening the app, confirm all of these:

- You are connected to a staging or clone database, not production.
- A recent production database backup exists and is accessible.
- The code branch is `codex/finalize-claude-erp-waves`.
- PR #2 Vercel Preview/build is green.
- You have not applied these migrations directly to production.
- You have permission to stop and ask for help if any query fails or returns unexpected results.

If you are unsure whether the database is production, stop. Do not continue.

## B. Migration Sequence

This PR includes migrations `079` through `098`.

Important sequence:

- `079`-`080`: Wave 1 deal types and Torah status axes.
- `081`-`089`: Wave 2 Torah budget, QA, tagging, and reporting foundations.
- `090`-`096`: Wave 3 ledger, dashboard, roles, exceptions, and broadcast replay infrastructure.
- `097`: Codex audit trail migration.
- `098`: Wave 3.5 ledger consistency completion.

Production must not be touched before staging succeeds. The staging clone should receive the migrations first, then the checks below should be run and saved in the PR notes.

## C. Manual SQL Checks

Run each SQL block in the Supabase SQL editor connected to the staging/clone project.

### 1. Deal Types

```sql
SELECT code, label_he, profit_method
FROM public.sys_deal_types
ORDER BY code;
```

### 2. Torah Status Axes

```sql
SELECT commercial_status, production_status, COUNT(*)
FROM public.torah_projects
GROUP BY commercial_status, production_status
ORDER BY commercial_status, production_status;
```

### 3. Ledger Counts

```sql
SELECT source_type, COUNT(*)
FROM public.ledger_entries
GROUP BY source_type
ORDER BY source_type;
```

### 4. Duplicate Ledger Check

```sql
SELECT source_type, source_id, category, COUNT(*)
FROM public.ledger_entries
GROUP BY source_type, source_id, category
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;
```

### 5. ERP Payments Vs Ledger

```sql
SELECT
  (SELECT COUNT(*) FROM public.erp_payments) AS erp_payments_count,
  (SELECT COUNT(*) FROM public.ledger_entries WHERE source_type = 'erp_payment') AS ledger_erp_payment_count;
```

### 6. Torah Transactions Vs Ledger

```sql
SELECT
  (SELECT COUNT(*) FROM public.torah_project_transactions WHERE amount > 0) AS torah_tx_count,
  (SELECT COUNT(*) FROM public.ledger_entries WHERE source_type = 'torah_transaction') AS ledger_torah_tx_count;
```

### 7. Audit Triggers

```sql
SELECT tgrelid::regclass AS table_name, tgname
FROM pg_trigger
WHERE tgname LIKE 'trg_sys_audit_%'
ORDER BY 1, 2;
```

### 8. Business Exceptions

```sql
SELECT exception_type, severity, COUNT(*)
FROM public.business_exceptions
GROUP BY exception_type, severity
ORDER BY severity, exception_type;
```

### 9. Net Worth

```sql
SELECT public.get_net_worth_snapshot();
```

### 10. Monthly Dashboard

```sql
SELECT *
FROM public.monthly_business_dashboard
ORDER BY month DESC
LIMIT 20;
```

## D. Pass/Fail Interpretation

Use this section to decide whether the staging validation passed.

Acceptable results:

- Deal types query returns rows, including the expected ERP deal type codes.
- Torah status axes query returns zero or more grouped rows. Zero rows is acceptable only if the clone has no Torah projects.
- Ledger counts query returns rows for source types that exist in the clone data.
- ERP payment count equals `ledger_erp_payment_count`.
- Positive Torah transaction count equals `ledger_torah_tx_count`.
- Duplicate ledger check returns no rows.
- Audit trigger query returns triggers for the target tables that exist in the clone.
- Business exceptions query may return zero rows if no current exceptions exist.
- Net worth and monthly dashboard queries complete without SQL errors.

Blockers:

- Any migration fails.
- SQL says a required table, view, function, or column does not exist after all migrations are applied.
- `erp_payments_count` does not equal `ledger_erp_payment_count`.
- `torah_tx_count` does not equal `ledger_torah_tx_count`.
- Duplicate ledger check returns any rows.
- `get_net_worth_snapshot()` fails.
- `monthly_business_dashboard` fails.
- Expected app pages crash after migration.

If duplicate ledger rows appear:

- Do not merge.
- Save the duplicate query output.
- Check whether duplicates are for `erp_payment` or `torah_transaction`.
- Ask engineering to inspect the duplicated source rows and decide whether to clean staging data or add a corrective migration.
- Do not manually delete production data.

If unique indexes were skipped:

- Migration `098` intentionally skips a partial unique index if existing duplicate ledger rows are found.
- Check whether these indexes exist:

```sql
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'ledger_entries'
  AND indexname IN (
    'idx_ledger_entries_unique_erp_payment_source',
    'idx_ledger_entries_unique_torah_transaction_source'
  )
ORDER BY indexname;
```

- If one is missing, run the duplicate ledger check above and escalate before merge.

If RLS blocks expected reads:

- Confirm whether the SQL was run as a Supabase project owner/service context or as an authenticated app user.
- Admin SQL checks should work in the Supabase SQL editor.
- App-level reads should work only for the logged-in user's own rows.
- If own rows are blocked in the app, do not merge; capture the page, user, and error.

If `get_net_worth_snapshot()` fails:

- Do not merge.
- Save the exact SQL error.
- Confirm migrations through `084_net_worth_snapshot_fn.sql` were applied.
- Confirm required tables such as `erp_payments`, `erp_sales`, `erp_investments`, and `torah_projects` exist.

## E. Smoke Test Checklist

Run these checks in the Vercel Preview connected to staging/clone data.

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

If a page crashes, save the URL, screenshot, console error, and user account used for the test.

## F. Merge Decision

Only convert PR #2 from Draft to Ready after all of these are true:

- `npm test` passed.
- `npm run build` passed.
- Vercel Preview works.
- Staging clone migrations pass.
- Manual SQL checks pass.
- Smoke tests pass.
- Production DB backup is ready.

If any item fails, keep the PR as Draft and document the blocker in the PR.
