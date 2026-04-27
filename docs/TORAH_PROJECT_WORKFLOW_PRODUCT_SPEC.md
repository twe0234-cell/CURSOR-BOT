# Torah Project Workflow Product Spec

## Goal

Turn `/torah/[id]` into a practical daily work center for Sefer Torah project management while preserving the existing sheet grid, QA, financial tab, and project actions.

## Current UI Audit

The project detail route already supports:

- Project header, status, contract links, editing, deletion, bulk sheet selection, and label printing.
- Sheet grid with per-sheet status and column tracking.
- QA batches, fixing tasks, batch return, and printing flows.
- Existing financial tab for Torah ledger transactions and schedules.
- Existing overview tab with timeline and derived warnings.

The gap is that the most important daily snapshot is not visible immediately on page load. Financial and workflow signals are spread across tabs and some legacy cards.

## Existing DB Sources Used

- `torah_projects`: project metadata, contract price, legacy paid totals, commercial/production/tagging status.
- `torah_sheets`: sheet status and column progress.
- `torah_project_budget_vs_actual`: contract total, planned costs, actual costs, income, refunds, projected profit, realized profit, cost variance.
- `torah_project_pace_analysis`: writing pace, columns written, expected columns, and pace status.
- `torah_payment_schedule_variance`: expected versus actual payments by party.
- `torah_calculator_vs_actual`: locked calculator quote versus actual project costs.
- `business_exceptions`: project warnings and exceptions detected by ERP views.

No new database view was required for this first pass.

## First-Pass UX Scope

Add a read-only workflow summary near the top of `/torah/[id]` that shows:

- Customer contract total, received amount, and remaining customer balance.
- Actual and planned scribe, parchment/klaf, QA/checking/tagging/sewing, and other costs where available.
- Expected profit versus realized profit.
- Cashflow/profit direction from existing ERP realized profit.
- Commercial, production, and tagging status.
- Sheet/column progress and pace status.
- Payment variance and business exceptions.
- Empty states when a source has no rows.
- Source warnings if an ERP read model is unavailable.

## Component Plan

Add `components/torah/TorahProjectWorkflowSummary.tsx` as a compact, reusable read-only component. It receives already-authorized project data from the server route and does not perform client-side data fetching or mutation.

## Data Safety

`fetchProjectWithSheets` still first verifies the project belongs to the authenticated user through `torah_projects.user_id`. Workflow read models are fetched only after that authorization check and filtered to the same project id. This keeps the first pass aligned with existing RLS plus explicit tenant filtering.

## Migration Decision

No migration was added. PR #2 and PR #10 already introduced the ERP read models needed for the first workflow summary. Adding a migration now would increase production risk without being necessary for Issue #15 acceptance.

## Risks And Gaps

- `torah_project_budget_vs_actual` currently groups QA, tagging, and sewing under actual proofreading-style costs; the UI labels this as a combined bucket.
- The first pass is visibility only; it does not add new workflow actions.
- If a project has no ledger or schedule rows, the component shows empty states rather than inventing totals.
- Some legacy totals on `torah_projects` may differ from ERP ledger-derived views; the summary prefers the ERP views and falls back only when a view row is missing.

## Rollback Plan

Revert the UI component, the `fetchProjectWithSheets` workflow summary additions, and the page prop wiring. No database rollback is required because this pass adds no migrations and performs no database writes.

## Future Workflow Recommendation

Keep financial truth in database views/functions. Future productization can add focused actions, but each write should reuse existing server actions or add a narrowly scoped action with tests and explicit tenant filtering.
