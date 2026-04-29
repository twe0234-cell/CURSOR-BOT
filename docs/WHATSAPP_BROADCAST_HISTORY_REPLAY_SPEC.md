# WHATSAPP_BROADCAST_HISTORY_REPLAY_SPEC

Spec + safe pure helper for reviewing past WhatsApp broadcasts and
cloning them as drafts.

Date: 2026-04-29.
Branch: `cursor/whatsapp-broadcast-history-replay`.
Issue: #32.
Scope: spec, schema gap analysis, pure clone helper + tests. **No real
sends, no DB writes, no scheduling changes.**

## 1. Audit findings

### 1.1 Tables (existing — no migration in this PR)

| Table | Source | Relevant columns |
| --- | --- | --- |
| `broadcast_logs` | `005`, `009`, `010`, `049`, `065`, `070` | `id, user_id, sent, failed, errors, tags, scribe_code, internal_notes, message_snippet, message_text, created_at` (+ `log_details` jsonb on some flows) |
| `broadcast_queue` | `009`, `010`, `065`, `096` | `id, user_id, payload jsonb, status CHECK IN ('pending','processing','completed','failed'), result, log_details, scheduled_at, replay_of_log_id, created_at, updated_at` |

`broadcast_queue.status` does **not** include a `'draft'` state. Cron
(`app/api/cron/process-broadcasts/route.ts`) picks up rows where
`status='pending'` and sends them. Therefore inserting a "replay" with
`status='pending'` today **is a real send-on-next-cron**, not a draft.

### 1.2 Server actions (existing)

- `app/broadcast/actions.ts → fetchBroadcastLogs()` returns the last 50
  logs per user, ordered by `created_at desc`. Selects all the fields
  required for history display (incl. `tags`, `message_text`,
  `message_snippet`, `scribe_code`, `internal_notes`, `sent`, `failed`,
  `errors`).
- `app/broadcast/actions.ts → fetchBroadcastQueueItems()` returns recent
  queue rows incl. `scheduled_at`, `payload.tags`, `payload.messageText`.
- `app/broadcast/actions.ts → replayBroadcast({ broadcast_log_id })`
  exists. It loads the original log and inserts a new
  `broadcast_queue` row with `status='pending'`, `replay_of_log_id`, and
  payload `{messageText, imageUrl: null, tags, scribeCode, internalNotes}`.
  **Risk:** because `status='pending'` is the cron-eligible state, calling
  this from the UI sends the broadcast at the next cron tick. It does not
  match the "create a new draft" rule from issue #32.
- `app/broadcast/actions.ts → scheduleBroadcastAction(...)` allows
  `scheduled_at` future-dated `pending` rows; cron honors `scheduled_at`.

### 1.3 UI (existing)

- `app/whatsapp/BroadcastTab.tsx` and `app/broadcast/BroadcastClient.tsx`
  both fetch logs + queue and render them. They display `sent`, `failed`,
  `tags`, snippet, and queue status. `imageUrl` from the original is not
  recoverable (not persisted on `broadcast_logs`).
- No "open past broadcast" detail dialog. No clone-to-draft button. No
  "duplicate as draft" entry point.
- `MessageComposer` lives inside `BroadcastTab.tsx`; it accepts initial
  text + tags via component state but has no API for "prefill from log".

### 1.4 Cron / scheduling (existing — must not change)

- `app/api/cron/process-broadcasts/route.ts` — fetches `pending` rows
  (optionally honoring `scheduled_at`), flips to `processing`, sends, then
  marks `completed`/`failed`. We must not alter this loop in this PR.

## 2. What history must show

Per issue #32, each past broadcast row in the history list/dialog needs:

- Message body (`message_text` if present, else `message_snippet`).
- Media indicator — best-effort flag from `log_details` (`imageUrl`,
  `hadImage`); the URL is not persisted, so we surface a notice
  ("השידור המקורי כלל תמונה — נדרשת העלאה מחדש") rather than reuse it.
- `scheduled_at` — surfaced from the matched `broadcast_queue` row when
  available; otherwise omitted.
- `sent_at` — `created_at` from `broadcast_logs` (the row is written
  after the send loop completes, so this is effectively `sent_at`).
- `status` — derived: `sent>0 && failed===0 → "נשלח"`,
  `failed>0 && sent===0 → "נכשל"`, mixed → "חלקי", queue still active →
  `broadcastQueueDisplayStatus(queueRow)`.
- `sent` count, `failed` count.
- Recipient group/filter — `tags[]` from the log row + `scribe_code`. The
  exact recipient list is not stored; tag-based audience is what we have
  and what the replay carries forward.

## 3. Replay / clone behavior (target)

A replay button must produce a **draft**, not a queued or sent broadcast.

This PR adds the pure helper `buildReplayDraft(src)` in
`src/lib/broadcast/replay.ts`:

- **Input:** a fetched `broadcast_logs` row (or any compatible subset).
- **Output:**
  ```ts
  {
    messageText: string;          // text_body || snippet
    tags: string[];               // fresh array, never aliased
    scribeCode: string | null;
    internalNotes: string | null;
    replayOfLogId: string;        // for future audit / queue link
    mediaNotice: string | null;   // hint when original had media
  }
  ```
- **No I/O.** Purely shapes data the compose form already understands.

Wiring (deferred to a follow-up PR — out of scope here):

1. UI: add "שכפל לטיוטה" (Duplicate as draft) button on each history row.
2. On click: call `buildReplayDraft(row)` client-side, then `setMessage`,
   `setSelectedTags`, `setScribeCode`, `setInternalNotes` on the existing
   `BroadcastTab` compose state. The user can edit, choose audience
   (re-resolve via `fetchTargetsByTags` / `fetchTargetsByGroupIds`), and
   only **explicitly** click Send / Schedule.
3. Replace the existing `replayBroadcast()` server action with a
   `buildReplayDraft`-only flow on the client to remove the cron-eligible
   insert. Until that lands, the legacy `replayBroadcast` stays but is
   not surfaced in any new UI in this PR.

## 4. Schema gap — needed for true persisted drafts (additive only)

Persisting drafts on the server is **not** in this PR. If we later want
"saved drafts" instead of compose-form prefill only, the minimal additive
schema is:

```sql
-- broadcast_queue.status today: pending|processing|completed|failed
-- proposed (additive): allow 'draft'

ALTER TABLE public.broadcast_queue
  DROP CONSTRAINT IF EXISTS broadcast_queue_status_check,
  ADD CONSTRAINT broadcast_queue_status_check
    CHECK (status IN ('draft','pending','processing','completed','failed'));
```

Cron stays unchanged because it filters `status='pending'`. Drafts sit at
`'draft'` until the user opens them and clicks "Send" / "Schedule",
which flips to `'pending'` (or `'pending' + scheduled_at`).

This migration is **proposed, not applied**. No SQL is run in this PR.

## 5. Validation

- `npm test` ✅ — adds 9 tests for `buildReplayDraft` / `isReplayable`.
  Total 258 → 267.
- `npm run build` ✅ — Turbopack production build passes.
- `npm run list:surfaces` ✅ — surface counts unchanged (32/18/22/103).

## 6. Confirmations

- ✅ No real WhatsApp messages sent.
- ✅ No DB mutation; no migration applied.
- ✅ No change to `replayBroadcast` server action behavior.
- ✅ Cron loop and scheduling logic untouched.
- ✅ No secrets exposed (helper takes only the loaded row, never tokens).
- ✅ Schema gap (need for `'draft'` status) is documented additively;
  destructive paths explicitly not used.
