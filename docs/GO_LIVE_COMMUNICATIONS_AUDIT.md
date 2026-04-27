# Go-Live Communications Audit

## Scope

This audit targets the real go-live communications blockers only:

- AI email composer quality and template discipline.
- WhatsApp broadcast scheduling reliability.

Out of scope: contact intelligence, entity resolution, CRM redesign, production data changes, broad database changes, and any real email/WhatsApp sending during validation.

## Current Implementation Reviewed

- AI email draft route: `app/api/email/ai-draft/route.ts`
- Email campaign UI: `app/email/campaigns/CampaignsClient.tsx`
- Email composer: `app/email/campaigns/EmailComposer.tsx`
- Gmail send action/session behavior: `app/email/campaigns/actions.ts`, `src/lib/gmail`
- WhatsApp broadcast actions: `app/broadcast/actions.ts`
- WhatsApp broadcast UI used by `/communications`: `app/whatsapp/BroadcastTab.tsx`
- Legacy broadcast UI: `app/broadcast/BroadcastClient.tsx`
- Broadcast cron processor: `app/api/cron/process-broadcasts/route.ts`
- Broadcast schedule schema already present: `supabase/migrations/065_broadcast_schedule.sql`
- Existing tests around email/WhatsApp parsing and wrapping.

## Part A - AI Email Composer

### Findings

- The AI draft route used a broad marketing-copy prompt that encouraged longer, more persuasive copy.
- Default body generation allowed large token budgets, which made long essays more likely.
- There was no explicit template mode, so short offer, quote, follow-up, reply, and supplier-message use cases were all treated similarly.
- The UI collected useful business brief fields, but did not let the user choose a business template.
- Gmail session behavior was already guarded: Gmail connection is checked before composing/sending, revoked refresh tokens are handled in the send action, and actual sending still requires a confirmation dialog.

### Fixes Implemented

- Added `src/lib/email/aiDraftContract.ts` as a small, testable prompt contract.
- Added supported template modes:
  - `short_offer`
  - `price_quote`
  - `follow_up`
  - `friendly_reply`
  - `formal_supplier_message`
- Changed default body generation to short, Hebrew-first, business-focused output.
- Reduced default AI token budget and lowered temperature for more disciplined drafts.
- Added explicit prompt rules for:
  - preserving the user's actual business point
  - clear call to action
  - short paragraphs
  - avoiding vague marketing fluff
  - not inventing missing details
  - not duplicating app-level signature text
- Added a template selector to the campaign AI dialog.
- Added tests for template normalization, prompt constraints, subject constraints, and default short length.

### Remaining Notes

The email body generator still returns body HTML separately from subject generation because the existing composer has separate subject/body flows. The configured signature is appended by the send pipeline, so the AI prompt explicitly avoids duplicating signature text.

## Part B - WhatsApp Scheduling

### Findings

- `/broadcast` redirects to `/whatsapp`, and `/whatsapp` redirects to `/communications?ch=wa`.
- The active WhatsApp UI is `app/whatsapp/BroadcastTab.tsx`.
- The old `app/broadcast/BroadcastClient.tsx` had scheduling controls, but the active communications tab did not expose scheduling.
- Scheduled rows were inserted as `pending` with `scheduled_at`, but `fetchBroadcastQueueItems` only returned `completed` and `failed`, so scheduled/pending/processing jobs were not visible in the active UI.
- The cron processor selected one `pending` due row and then updated it to `processing`. Two overlapping cron invocations could theoretically select the same due row before either update completed.
- Failure reasons were generally recorded in `result` and `log_details`, but the catch-path recovery for stuck processing jobs did not include `log_details`.

### Fixes Implemented

- Added scheduling controls to the active WhatsApp communications UI.
- Scheduled sends now preserve selected tags/groups, message text, image URL, scribe code, and internal notes.
- `scheduleBroadcastAction` now validates:
  - future scheduled time
  - public image URL
  - image size limit
  - non-empty target list
- `fetchBroadcastQueueItems` now returns `pending`, `processing`, `completed`, and `failed` rows, including `scheduled_at`.
- Added UI status mapping:
  - future pending row => scheduled
  - due pending row => pending
  - processing => processing
  - completed => sent
  - failed => failed
- The cron processor now conditionally claims a job with `id + status = pending` before sending, reducing duplicate-send risk from overlapping cron requests.
- Stuck-job recovery now writes a `log_details` error entry as well as `result.error`.
- Added tests for scheduling display status helpers.

### No Database Migration

No migration was added. The existing database already has `broadcast_queue.scheduled_at`, `status`, `result`, and `log_details`. The DB enum/check currently supports `pending`, `processing`, `completed`, and `failed`; the UI maps these into clearer product labels without changing schema.

## Validation

- No real Gmail sends were triggered.
- No real WhatsApp sends were triggered.
- No import/contact merge scripts were run.
- No production data was changed.
- `npm test` passed locally after the first implementation pass.
- `npm run build` passed locally after the first implementation pass.

## Remaining Go-Live Risks

- Cron reliability still depends on the external scheduler calling `/api/cron/process-broadcasts` frequently with the correct `CRON_SECRET`.
- The best long-term duplicate-send protection is a database-side claim function or queue lock, but this PR avoids new database changes per scope.
- AI draft quality should still be manually reviewed before sending, and the existing send confirmation flow remains required.
