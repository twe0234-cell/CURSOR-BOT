# GO LIVE OPERATIONAL UX FIXES

Branch: `cursor/go-live-operational-ux-fixes`

Scope of this PR is intentionally limited to:

1. Torah workflow/editing/payment-warning usability.
2. Search/create UX in mediation owner/customer/contact selectors.

## Part A — Torah workflow and QA operational clarity

- Workflow summary now states clearly where QA round count/order comes from:
  - `gavra_qa_count`
  - `computer_qa_count`
  - `requires_tagging`
- Workflow summary now states what is editable now and what is not:
  - Editable now: QA counts and tagging requirement (via "ערוך פרויקט").
  - Not editable yet: custom per-round ordering/naming persisted in a dedicated workflow table.
- QA tab now includes an explicit "supported vs not supported yet" note.
- QA bag actions that are not implemented are explicitly labeled "לא זמין עדיין".
- No historical workflow rows were deleted or rewritten.

## Part A — Payment warning wording

The strict warning text was changed to a softer review notice:

`יש תשלומים לסופר לפני אישור/תפירה מלאה. ודא שהתשלום תואם להסכם, קצב כתיבה או מקדמה מתוכננת.`

This keeps visibility while allowing legitimate advance/partial payment flows.

## Part B — Mediation deal owner/customer/contact selector UX

- Added in-form search filters for:
  - mediation original owner selector (`בעלים מקורי`)
  - buyer selector (`קונה`)
- Added explicit "צור איש קשר חדש" action near both selectors.
- New contact creation reuses existing `AddClientModal` and returns selection back to the relevant field.
- No deal/business calculation logic was changed.

## Safety / non-goals

- No DB migrations.
- No SQL changes.
- No data mutation outside existing UI/server actions.
- No contact intelligence/entity merge.
- No bulk contact import.
