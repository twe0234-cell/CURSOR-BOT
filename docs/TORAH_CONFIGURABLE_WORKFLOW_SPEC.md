# Torah Configurable Workflow First Pass

## Current Schema Audit

- `torah_projects` already stores project-level workflow configuration: `gavra_qa_count`, `computer_qa_count`, `requires_tagging`, and `tagging_status`.
- `torah_projects` also stores planned cost fields used by the financial summary: `planned_scribe_budget`, `planned_parchment_budget`, `planned_proofreading_budget`, and `estimated_expenses_total`.
- `torah_sheets.status` already supports the core sheet lifecycle: `not_started`, `written`, `reported_written`, `received`, `in_qa`, `needs_fixing`, `approved`, and `sewn`.
- `torah_qa_batches` already stores QA bag metadata: `project_id`, `magiah_id`, `checker_id`, `qa_kind`, `cost_amount`, `report_url`, `vendor_label`, `status`, `sent_date`, `returned_date`, and `notes`.
- `torah_batch_sheets` links sheets to QA bags.
- `torah_fix_tasks` supports correction tasks after QA.
- Existing QA bag status is currently limited in TypeScript to `sent` and `returned`. The requested richer statuses (`draft`, `corrections_needed`, `closed`, `cancelled`) are not fully modeled yet.

## First Pass Implemented

- No migration was added.
- The project page now exposes a read-only/default workflow plan derived from existing project config.
- The displayed default flow is:
  1. Reported written / דווח כנכתב
  2. Received by me / warehouse / התקבל אצלי / במחסן
  3. Tagging / תיוג, only when `requires_tagging` is true
  4. Human QA rounds based on `gavra_qa_count`
  5. Computer QA rounds based on `computer_qa_count`
- The QA bag tab now makes bag metadata clearer: QA type, destination/checker, current round cost, sent/returned dates, report link, sheet IDs, and notes.
- Safe correction visibility was added as guidance. Existing supported operations remain create bag, mark returned, resolve sheets, and create/complete fix tasks.

## What Is Not Implemented Yet

- Per-project ordered QA sequence beyond the existing `gavra_qa_count` and `computer_qa_count` counts.
- Editable workflow configuration UI on the project page.
- `draft`, `closed`, `cancelled`, and `corrections_needed` QA bag statuses.
- Editing QA bag metadata after creation.
- Removing one sheet from an existing QA bag.
- Dissolving/cancelling/rebuilding a bag with typed confirmation.
- Expected return date on QA bags.
- Historical auto-backfill. This PR intentionally does not mutate existing projects.

## Safe Next Schema Option

If the next PR needs true operational editing, add one additive migration with:

```sql
-- Do not execute from this document.
CREATE TABLE public.torah_project_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.torah_projects(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  step_type text NOT NULL CHECK (step_type IN ('reported_written', 'received', 'tagging', 'qa_gavra', 'qa_computer', 'other')),
  label text,
  required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.torah_qa_batches
  ADD COLUMN IF NOT EXISTS expected_return_date date,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS correction_reason text;
```

Then update the status model with explicit server actions for edit/cancel/rebuild, each writing audit events and requiring typed confirmation in the UI.

## Rollback

This first pass is UI/helper/docs only. Rollback is a normal git revert. No database objects or production data are changed.

