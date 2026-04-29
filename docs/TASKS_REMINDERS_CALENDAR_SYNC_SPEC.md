# TASKS_REMINDERS_CALENDAR_SYNC_SPEC

Spec for the task / reminder layer and Google Calendar sync architecture
of הידור הסת״ם.

Date: 2026-04-29.
Branch: `codex/tasks-reminders-calendar-sync-spec`.
Issue: #31.
Scope: spec only. No tables, no real Google Calendar event creation, no
secrets exposed, no migrations.

## 1. Audit findings

### 1.1 OAuth + user settings

- `user_settings.gmail_refresh_token` (migration `006_gmail_user_settings`)
  holds a single Gmail OAuth refresh token per user.
- `src/lib/gmail.ts` exposes `getAccessTokenForUser(supabase, userId,
  refreshToken)`; it rotates the refresh token automatically and throws
  `GmailAuthRevokedError` on `invalid_grant`.
- OAuth scopes used today (audited from `app/api/auth/gmail/route.ts`):
  `gmail.send`, `gmail.readonly`, `contacts.readonly`, `userinfo.email`.
  **No `calendar` scope is requested in the live consent screen** even
  though `src/lib/google/calendar.ts` calls Calendar API. This means calendar
  sync only works when the user has granted calendar access manually — which
  the existing token does not. Gap to close in MVP-2.

### 1.2 Existing calendar code

- `src/lib/google/calendar.ts` — writes two all-day events per Torah
  project (QA start, delivery target) to the **primary** calendar, with
  dedupe via `extendedProperties.private.broadcastBuddyTorah=projectId`.
  - `runTorahCalendarSync(supabase, userId, payload)` loads the refresh
    token, calls `getAccessTokenForUser`, then `syncTorahProjectToCalendar`.
  - On every sync the function **deletes existing milestones tagged with
    the project id and re-inserts** — that is the de-facto dedupe + replace
    behavior today.
  - Hard-coded to `primary` calendar; no per-account / per-calendar
    selection; no idempotency table — the dedupe relies entirely on the
    extended property tag.
- `lib/sales/paymentRequest.ts → buildCalendarEventUrl(opts)` — pure URL
  builder for the unauthenticated "add event template" link
  (`https://calendar.google.com/calendar/r/eventedit?...`). Used in
  `app/sales/SalesClient.tsx` to give the user a one-click "open Google
  Calendar with this event prefilled" without OAuth. **This is the safest
  fallback** when sync is not connected.

### 1.3 Tasks / reminders

No `tasks`, `reminders`, `task_reminders`, or similar table exists in
`supabase/migrations/`. No app surface today lists per-entity tasks. The
need is unaddressed end-to-end.

## 2. Internal Task model (proposed — **no migration in this PR**)

```text
table  tasks
-----  ---------------------------------------------------------------
id                  uuid PK
user_id             uuid NOT NULL  (RLS owner)

title               text NOT NULL
notes               text NULL

due_at              timestamptz NULL              -- exact moment if known
due_date            date NULL                     -- when only the day matters
all_day             boolean NOT NULL DEFAULT true
priority            text  CHECK IN ('low','normal','high','urgent') DEFAULT 'normal'
status              text  CHECK IN
                          ('open','snoozed','done','cancelled') DEFAULT 'open'
completed_at        timestamptz NULL

related_type        text  NULL  CHECK IN
                          ('torah_project','torah_qa_batch','crm_contact',
                           'sale','investment','market_torah_book',
                           'broadcast','email_thread','whatsapp_thread')
related_id          uuid NULL                     -- polymorphic — RLS scoped
related_contact_id  uuid NULL  REFERENCES crm_contacts(id)

reminder_channel    text  CHECK IN
                          ('none','app','email','whatsapp','calendar')
                          DEFAULT 'app'
remind_at           timestamptz NULL              -- when to fire the reminder
reminded_at         timestamptz NULL

created_at          timestamptz NOT NULL DEFAULT now()
updated_at          timestamptz NOT NULL DEFAULT now()
```

Indexes: `(user_id, status, due_at)`, `(user_id, related_type, related_id)`,
`(user_id, remind_at) WHERE remind_at IS NOT NULL`.
RLS: owner-only.

`related_*` is intentionally polymorphic (single column pair) — it mirrors
the existing pattern in `erp_payments(entity_type, entity_id)`. We pay
the cost of no FK to gain a single tasks table that covers all 9 surfaces:
Torah projects, QA bags, scribe follow-ups, customer payments, supplier
payments, mediation commission collection, WhatsApp/email follow-ups,
CRM contacts.

## 3. Calendar sync model (proposed)

```text
table  calendar_accounts
-----  ---------------------------------------------------------------
id                 uuid PK
user_id            uuid NOT NULL                 (RLS owner)
provider           text CHECK IN ('google')      -- room to grow
google_email       text NOT NULL                 -- shown in account picker
refresh_token      text NOT NULL                 -- encrypted at rest if vault available;
                                                 -- otherwise stored same way as
                                                 -- user_settings.gmail_refresh_token today
scopes             text[] NOT NULL               -- e.g. {calendar.events,calendar.readonly}
status             text CHECK IN ('active','revoked','error') DEFAULT 'active'
last_error         text NULL
created_at, updated_at  timestamptz
unique (user_id, provider, google_email)


table  calendar_targets
-----  ---------------------------------------------------------------
id                 uuid PK
user_id            uuid NOT NULL                 (RLS owner)
account_id         uuid NOT NULL REFERENCES calendar_accounts(id)
calendar_id        text NOT NULL                 -- e.g. 'primary' or
                                                 -- a Google calendar id
display_name       text NOT NULL
is_default         boolean NOT NULL DEFAULT false -- one default per user
created_at, updated_at  timestamptz
unique (user_id, account_id, calendar_id)


table  calendar_event_links
-----  ---------------------------------------------------------------
id                 uuid PK
user_id            uuid NOT NULL                 (RLS owner)
target_id          uuid NOT NULL REFERENCES calendar_targets(id)
task_id            uuid NULL  REFERENCES tasks(id) ON DELETE CASCADE
related_type       text NULL                     -- mirrors tasks.related_type when no task row
related_id         uuid NULL
external_event_id  text NOT NULL                 -- Google event id
dedupe_key         text NOT NULL                 -- "<related_type>:<related_id>:<role>"
sync_status        text CHECK IN ('synced','out_of_sync','deleted','error')
                          DEFAULT 'synced'
last_synced_at     timestamptz NULL
last_error         text NULL
unique (user_id, target_id, dedupe_key)
unique (user_id, target_id, external_event_id)
```

Why three tables instead of stretching `user_settings`:

1. The user wants to **choose which connected Google account/calendar**
   each push goes to. That requires a list, not a single column.
2. Existing one-account flow lives in `user_settings.gmail_refresh_token`
   — we keep it untouched as the "primary Gmail mailbox" and let
   `calendar_accounts` model the **calendar identity** independently.
   When `calendar_accounts` has zero rows, fall back to today's behavior.
3. `dedupe_key` replaces the implicit
   `extendedProperties.private.broadcastBuddyTorah=<projectId>` trick. We
   keep writing that extended property too so existing events remain
   matchable across the migration.

## 4. MVP roadmap

### MVP-1 — internal reminders only (no Google calls)

- Migration A: `tasks` table + RLS + indexes.
- Server actions in `app/tasks/actions.ts`: `createTask`, `updateTask`,
  `completeTask`, `snoozeTask`, `listMyTasks`.
- UI:
  - `/tasks` dashboard list (filters by status/priority/due window).
  - Per-entity inline task list shown on:
    - `/torah/[id]` (related_type='torah_project')
    - QA batch dialog inside `TorahDetailClient` (related_type='torah_qa_batch')
    - `/crm/[id]` (related_type='crm_contact', also surfaces tasks where
      `related_contact_id = :id` regardless of the polymorphic key)
    - `/sales/[id]` once that page exists; for now show under `SalesClient` table row drawer.
- Reminder fires only **inside the app** (toast / dashboard badge).
  Email/WhatsApp reminder channels are stored but not yet sent.
- No external API calls. Uses the existing
  `lib/sales/paymentRequest.ts → buildCalendarEventUrl(...)` helper for a
  one-click "Add to my Google Calendar" link that opens the user's browser
  — works today without any OAuth scope change.

### MVP-2 — push selected reminders to Google Calendar

- Migration B: `calendar_accounts`, `calendar_targets`,
  `calendar_event_links` (additive).
- Extend OAuth consent (`app/api/auth/gmail/route.ts`) to optionally
  request `https://www.googleapis.com/auth/calendar.events` when the user
  opts in from the Settings page. Existing tokens stay valid for Gmail; a
  separate "Connect calendar" flow stores its own refresh token in
  `calendar_accounts`.
- Settings UI: list connected accounts, list calendars per account, mark
  one as default, allow per-task override (`target_id`).
- Push path: `pushTaskToCalendar(taskId, targetId?)` → upserts an event
  using `dedupe_key`. Idempotent — replays update the same event.
- Reuse existing `src/lib/google/calendar.ts` patterns for the actual API
  calls; refactor to accept a `target` instead of hard-coding `primary`.
- Hard rules in code:
  - No automatic push. The user explicitly clicks "Sync to Calendar" on
    a task, or marks the task with `reminder_channel='calendar'` and a
    target.
  - If `external_event_id` already exists for the dedupe key, **patch**;
    never create a duplicate.
  - On `invalid_grant` from refresh, set `calendar_accounts.status='revoked'`
    and surface a "reconnect" banner — same shape as today's Gmail
    revoked handling.

### MVP-3 — two-way sync / status reconciliation

- A daily cron (extend existing `/api/cron/process-broadcasts` schedule)
  pulls `events.list?syncToken=…` per `calendar_targets` and reconciles:
  - Event deleted on Google → mark
    `calendar_event_links.sync_status='deleted'`; if user opt-in,
    auto-cancel the linked `tasks` row (`status='cancelled'`).
  - Event time changed → update `tasks.due_at` + `remind_at` if the user
    enabled "Calendar is source of truth" per target.
  - Event recreated by user inside Google with the same
    `extendedProperties.private.dedupe=<key>` → re-link.
- Two-way sync is **opt-in per target**; default stays one-way push.

## 5. What this PR is **not** doing

- Not creating any real calendar event.
- Not requesting any new OAuth scope.
- Not adding any table, view, function, RLS policy.
- Not changing `src/lib/google/calendar.ts` behavior.
- Not exposing any token in the doc, logs, or UI.
- Not implementing any task UI.

Implementation work follows in three sequenced PRs (one per MVP stage),
each gated on user approval. Each migration is additive; no
`DROP`/`DELETE` against existing rows.

## 6. Validation

- `npm test` ✅ — no code changes; existing 258 tests unchanged.
- `npm run build` ✅ — Turbopack production build passes.

## 7. Confirmations

- ✅ No real Google Calendar events created.
- ✅ No DB mutation.
- ✅ No new migrations applied.
- ✅ OAuth tokens untouched and not exposed.
- ✅ No duplicate-event risk (dedupe key proposal).
