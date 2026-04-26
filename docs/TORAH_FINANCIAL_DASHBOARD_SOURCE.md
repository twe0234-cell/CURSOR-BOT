# Torah Financial Dashboard Source

## Goal
Provide a tenant-safe Torah project financial snapshot for `/dashboard/erp` without duplicating financial calculations in React.

## Source of truth
- DB read model: `public.torah_financial_dashboard_snapshot`
- Defined in migration: `supabase/migrations/099_torah_financial_dashboard_view.sql`
- Based on existing financial view: `public.torah_project_budget_vs_actual`
- Enriched with tenant scope and labels via:
  - `public.torah_projects` (`user_id`, `client_id`)
  - `public.crm_contacts` (`customer_label`)

## Why this was needed
`torah_project_budget_vs_actual` did not expose `user_id`, so `/dashboard/erp` could not apply explicit tenant filtering in server action code.

## Exposed fields
- `user_id`
- `project_id`
- `project_label`
- `customer_label`
- `commercial_status`
- `production_status`
- `contract_amount`
- `received_amount`
- `actual_cost`
- `expected_profit`
- `realized_profit`
- `cashflow_status` (`collected` / `partial_collection` / `uncollected` / `no_contract`)

## Tenant-safety model
- View is created with `WITH (security_invoker = true)`.
- Server action applies explicit filter: `.eq("user_id", user.id)`.
- No cross-tenant aggregation is exposed in UI.

## UI integration
- File: `app/dashboard/erp/actions.ts`
  - Reads `torah_financial_dashboard_snapshot` with explicit `user_id` filter.
- File: `app/dashboard/erp/page.tsx`
  - Renders compact Torah snapshot table in ERP dashboard.

## Non-goals
- No DB destructive SQL.
- No business logic recalculation in React.
- No auth logic changes.
