# ERP Dashboard Product Spec

Issue: #6, ERP Dashboard productization

Branch: `codex/erp-dashboard-productization`

## Goal

Create a first read-only ERP dashboard that turns the merged ERP foundation into an operator-friendly business view for Hidur HaSTaM.

## Route

Use `/dashboard/erp` for the first pass. The existing `/` dashboard remains the general home dashboard, while the ERP dashboard is a focused read-only financial surface.

## DB Sources

- `public.get_net_worth_snapshot()` for net worth, inventory value, receivables, and realized profit.
- `public.monthly_business_dashboard` for monthly income, expenses, net cashflow, deal type, and entry counts.
- `public.business_exceptions` for current business exception alerts.
- `public.ledger_entries` for recent ledger traceability.

## Deferred Source

`public.torah_project_budget_vs_actual` exists, but the first pass does not render it directly because the view does not expose `user_id` for explicit tenant filtering at the UI query layer. A later dashboard pass should add a safe read model or approved view shape before showing a Torah project financial table.

## UI Requirements

- Hebrew-first, read-only dashboard.
- Use existing brand dashboard components from Issue #4.
- Empty states should be calm and useful.
- No edit, delete, sync, repair, or destructive controls.
- Show data source labels so financial cards remain traceable to DB functions/views.

## Safety

This pass must not add migrations, change schema, modify auth, mutate production data, or reimplement financial truth in React. Aggregation is limited to display-level totals over rows already returned by existing DB views.
