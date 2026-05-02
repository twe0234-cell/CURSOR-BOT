# TORAH_LISTING_INTELLIGENCE_PLAN

Issue: #30 — Go-live data: smart WhatsApp/Gmail search and intake for Torah listings.
Status: **plan-only** (no code changes, no DB mutations).
Date: 2026-04-29.

## 1. Goal

Design a controlled, **review-first** pipeline that surfaces ready Sefer Torah
listings from inbound WhatsApp and Gmail messages, groups related text + media,
extracts evidence-backed candidate listings, and lets the user approve before
any record reaches `market_torah_books` or any other live commercial table.

This document is informational. It does not introduce new tables, edge
functions, schedulers, or auto-merge logic. Implementation work will be
sequenced in follow-up PRs after this plan is approved.

## 2. Hard rules

- No full contact intelligence / entity resolution.
- No automatic CRM contact merging.
- No blanket Gmail / WhatsApp ingestion.
- No automatic creation of final `market_torah_books` records (current
  webhook is the exception that this plan proposes to gate behind a draft
  state — see §6).
- No production DB mutation in this PR.
- No destructive SQL anywhere in the rollout.
- Plan + audit only in PR #1; safe parser/UX additions only in later PRs once
  approved.

## 3. Audited code (existing surface)

| File | Behavior today | Gap vs goal |
| --- | --- | --- |
| `src/lib/market/parseWhatsAppMarketMessage.ts` | Pure parser. Extracts `script_type`, `torah_size`, `owner_name`, `ready_date`, `asking_price`. Hebrew-only, fixed line-format-ish. Returns `parsedMessageIsActionable` if price > 0. | No `condition`, `mugah`, `hidur`, `location`, `images`, `confidence`, `evidence`, `sender` fields. No multi-line free-text mode. No Yiddish/English. |
| `app/api/whatsapp-webhook/route.ts` | Green API webhook. Auth via `WEBHOOK_SECRET`. For configured `wa_market_group_id`: image-only → inserts `market_stage='image_pending'`; text → parses; if a recent `image_pending` from same `sender_wa_id` exists, **merges** text into it and flips stage to `new`; otherwise inserts a new row directly into `market_torah_books`. **Auto-creates final rows.** Also reacts ✅/❌ on the WA message. | (a) Inserts **directly** into the live `market_torah_books` instead of a candidate table. (b) Same-sender merge only — no chat-id+time-window grouping. (c) No confidence/evidence captured. (d) No human-review surface. |
| `app/api/whatsapp-webhook/status/route.ts` | Operational health route only. | Out of scope. |
| `app/email/import/actions.ts` → `importMarketTorahFromEmailMessage(rawText, sourceEmail?)` | Server action. User pastes an email body; runs same parser; if actionable, **directly inserts** a `market_torah_books` row with `notes = first 5000 chars`. | Inserts into the live table — no candidate buffer, no evidence other than `notes`, no confidence, no images. |
| `app/email/import/actions.ts` → `fetchGmailTriageContacts`, `saveGmailTriageToCrm`, `createCrmContactFromTriage`, `mergeCrmContactEmail`, `ignoreEmail` | Existing CRM-side Gmail triage flow (contacts only, not listings). Writes `sys_events` for traceability. | Reuse the *pattern* (manual triage + audit event) for listings; **do not** reuse the CRM merge logic for listing intelligence. |
| `app/api/email/ai-draft/route.ts` | Outbound AI email drafting. | Not relevant to inbound listing intake. |
| `app/market/actions.ts` (full file not re-read) — referenced by grep as a primary user of `market_torah_books`. | UI flows for market table CRUD. | Will need a "candidate review" surface added (plan §8). |
| `supabase/migrations/056_market_whatsapp_sync.sql` | Adds `source_message_id` (unique partial index) + `wa_market_group_id`. | No `sender_wa_id` time index for grouping queries (added later in 068). |
| `supabase/migrations/058_market_stage.sql` | `market_stage CHECK IN ('image_pending','new','contacted','negotiating','deal_closed','archived')`. | Does **not** include a `candidate` / `reviewed` / `approved` / `rejected` set — current pipeline treats `new` as the post-parse state. |
| `supabase/migrations/059_market_contact_log.sql` | `market_contact_logs` exists for outreach tracking. | Reusable audit pattern; not a candidate buffer. |
| `supabase/migrations/068_market_torah_books_sender_wa_id.sql` | Adds/uses `sender_wa_id`. | Already enables same-sender lookups; needed for grouping. |
| `erp_torah_intake_submissions` | **Not present on `origin/main` at the audited commit.** Memory referenced this table; it does not exist in the migration set at HEAD. | Treat as future migration; do not assume it exists. |

Hard takeaway: the system **already auto-creates `market_torah_books` rows
from WhatsApp**, and the email path does the same on user paste. Both must be
gated behind a candidate buffer before this plan is implemented.

## 4. Candidate listing model

A new logical type — **`torah_listing_candidate`** — sits between the raw
message and `market_torah_books`. No row reaches `market_torah_books` until
the user approves the candidate.

### 4.1 Conceptual fields

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK. |
| `user_id` | uuid | RLS owner. |
| `source_type` | text CHECK IN (`'whatsapp'`,`'gmail'`,`'manual'`) | Origin channel. |
| `source_ref` | jsonb | Channel-specific anchor: `{idMessage, chatId, instanceId}` for WA; `{messageId, threadId, gmailFrom}` for Gmail; `{enteredBy}` for manual. |
| `sender_handle` | text | Raw handle: WA id (`972…@c.us`) or email address. **No CRM merge**; we only store the string. |
| `sender_display_name` | text | Best-effort name from WA pushName / Gmail `From` display. |
| `linked_contact_id` | uuid nullable | If — and only if — the user explicitly links during review. Default null. |
| `grouped_message_ids` | text[] | All `idMessage` values rolled up into this candidate. |
| `media_refs` | jsonb[] | `[{kind:'image', url, idMessage, captured_at, sha256?}]`. URLs are Green API/Gmail attachment links; we do **not** mirror to Storage in v1. |
| `extracted_fields` | jsonb | Parser output frozen at extract time: `{script_type, torah_size, owner_name, ready_date, asking_price_ils, condition?, hidur?, mugah?, location?}`. Each value carries its own `evidence` index — see §4.2. |
| `confidence` | numeric(3,2) | 0.00–1.00. Computed (not stored) elsewhere; persisted for audit. Formula in §7. |
| `evidence` | jsonb | Array of snippets, each `{field, source_idMessage, span:[start,end], matched_signal}`. The user sees this on the review screen. |
| `status` | text CHECK IN (`'candidate'`,`'reviewed'`,`'approved'`,`'rejected'`,`'promoted'`) | Lifecycle. `promoted` = user clicked Approve and a `market_torah_books` row was created from this candidate. |
| `promoted_book_id` | uuid nullable | FK → `market_torah_books.id`. Set only on promotion. |
| `created_at`, `updated_at`, `reviewed_at`, `reviewed_by` | timestamps + uuid | Audit trail. |
| `rejection_reason` | text nullable | Required when `status='rejected'`. |

### 4.2 `evidence` schema (per field)

Each extracted field carries:

```jsonc
{
  "field": "asking_price_ils",
  "source_kind": "whatsapp_text",
  "source_idMessage": "ABC...",
  "span": [42, 47],
  "matched_signal": "165",
  "rule": "parsePrice"
}
```

This makes the review screen explainable ("we set price = 165,000 because line
3 said `165` and rule `parsePrice` multiplies values < 1000 by 1000").

## 5. WhatsApp text + image grouping rule

### 5.1 Inputs

For each inbound WA event we have: `chatId`, `senderId` (or `instanceWid`
fallback for outgoing), `idMessage`, optional `text`, optional `imageUrl`,
event timestamp.

### 5.2 Grouping key

`(user_id, chatId, sender_handle)` within a **rolling 5-minute window**.
Bound: configurable env `MARKET_GROUP_WINDOW_SECONDS` (default 300, min 60,
max 900). Window is anchored on the **earliest** message in the bucket and
extended by each new message; once it expires, the bucket is sealed.

### 5.3 Bucket states

```
open       — accepting more text/image from same key
sealed     — window elapsed; can be promoted to candidate
candidate  — written into the candidate table; no more grouping
```

Promotion to **candidate** happens when (a) the bucket has at least one text
message that the parser deems actionable, **and** (b) the bucket either
sealed or the user manually flushed it via the review UI. Image-only buckets
never auto-promote — they wait for accompanying text up to the window
horizon, then become `candidate` with `status='candidate'` + a `needs_text`
flag in `evidence` so the user can decide.

### 5.4 Never auto-finalize

Unlike today's webhook, the bucket → candidate transition writes to the
**candidate table only**. `market_torah_books` is not touched until the user
clicks Approve in the review UI. The current image-pending merge inside
`app/api/whatsapp-webhook/route.ts` is rewritten to target the candidate
table; the existing `market_stage='image_pending'` row type becomes obsolete
(kept readable for backward compatibility — no destructive drop).

### 5.5 Idempotency

`grouped_message_ids` is `UNIQUE` per element across the candidate table for
the user. If a webhook replays a message id, the existing candidate is
updated, never duplicated.

## 6. Search signals (Hebrew / Yiddish / English)

The parser stays pure. A new **signal layer** (no DB) decides whether a
message is even a *Torah listing*. Only messages flagged as Torah-listing
candidates enter the bucket.

### 6.1 Strong signals (any one is sufficient)

- `ספר תורה` (full term)
- `ס"ת` / `ס״ת` / `ס''ת`
- `הכנסת ספר תורה`
- `ספר תורה למכירה`
- English: `sefer torah`, `torah scroll`
- Yiddish (Latinized commonly seen on WA): `sefer toyre`, `toyre`

### 6.2 Supporting signals (need ≥ 2 to flag a listing)

- `מוכן` / `מוכנה` / `זמין` / `available`
- `מוגה` / `mugah` / `proofread`
- `כתב בית יוסף` / `ב"י` / `בי` / `ari` / `אר"י` / `ספרדי` / `וועליש` / `welish`
- `יריעות` / `sheets` / `column count`: `24|30|36|42|48|56`
- `מחיר` / `price` / `₪` / `ש"ח` / `nis` / `usd`
- `תיקונים` / `corrections` / `repairs`
- `תמונות` / `pics` / `photos`
- Location terms: any city name from `crm_contacts.address` distinct list +
  `ירושלים` / `ב"ב` / `בני ברק` / `אשדוד` / `מודיעין עילית` / `ביתר` / etc.

### 6.3 Anti-signals (downgrade — do not flag)

- `מבקש` / `מחפש` / `wanted` / `looking for` (these are buyer messages, not
  listings)
- `מזוזה` / `tefillin` / `מגילה` / `megillah` / `ת"ת` (other product)
- Off-topic chat, jokes, group meta

Implementation: a single `classifyTorahListingSignal(text)` pure function
returning `{ kind: 'listing'|'wanted'|'unrelated', score, hits[] }`. **No
LLM in v1** — keyword + regex only. Future versions may add an LLM scoring
layer behind a feature flag, but v1 must be deterministic and offline.

## 7. Confidence formula (deterministic)

```
confidence =
   0.40 * has(asking_price)       -- price is the floor for actionable
 + 0.20 * (has(script) || has(size))
 + 0.10 * has(owner_name)
 + 0.10 * has(ready_date)
 + 0.10 * has(image)
 + 0.10 * (signal_score >= strong ? 1 : 0)
```

Capped at 1.00. Persisted on the candidate. Surfaces sort/filter in the
review UI: `>= 0.70` = ready to approve; `0.40–0.69` = needs review;
`< 0.40` = likely junk, hidden by default.

## 8. UI plan (later PRs)

- `/admin/torah-listings/candidates` — list + filter by status/confidence.
  Each row shows source link, parsed values with editable inline cells, the
  `evidence` snippets, and the original message text/image.
- Approve button → server action `promoteCandidateToBook(id, edits)` that
  inserts into `market_torah_books` and writes `sys_events` row for audit.
- Reject button → sets `status='rejected'` with required reason; never
  deletes the candidate (audit retention).
- "Manual entry" form for paste-from-anywhere flows; replaces today's
  `importMarketTorahFromEmailMessage` direct-insert path.

UI work is **out of scope** for this PR; only the design is captured.

## 9. Migrations & rollout (later PRs)

Each step ships in its own PR; each is additive (`CREATE TABLE IF NOT
EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`). No drops, no destructive
backfills.

1. `M-A`: `CREATE TABLE torah_listing_candidates` + RLS policies + indexes.
2. `M-B`: extend `market_torah_books` with `promoted_from_candidate_id uuid
   nullable`.
3. `M-C`: extend `market_stage` CHECK to include `candidate` (still backward
   compatible with legacy `image_pending`/`new`).
4. Code-PR-1: switch webhook to write candidates instead of books, behind
   `MARKET_INTAKE_REVIEW_FIRST=true` flag — old behavior is the default
   until the flag is flipped, so production is never live-broken.
5. Code-PR-2: switch email paste path to candidates.
6. Code-PR-3: review UI under `/admin/torah-listings/candidates`.
7. Code-PR-4: Gmail polling job (cron) that scans labeled threads and
   creates candidates. Off by default; opt-in per user via
   `user_settings.gmail_listing_label`.

## 10. What is intentionally **not** in this plan

- No CRM contact merge / dedupe pipeline.
- No automatic linking of `sender_wa_id` → `crm_contacts`.
- No LLM-based field extraction in v1.
- No image OCR in v1 — `media_refs` are stored, not analyzed.
- No multi-tenant cross-user queries; every step is RLS-scoped to
  `user_id`.
- No retroactive backfill of historical WA/Gmail messages — v1 starts
  capturing from the day the flag flips.

## 11. Validation hooks for the implementation PRs

When code lands:

- `npm test` must pass; new pure-logic tests for `classifyTorahListingSignal`
  and the bucket state machine are mandatory.
- `npm run build` must pass on Turbopack.
- Migrations run on a Supabase branch first (per
  `docs/STAGING_VALIDATION_RUNBOOK.md`), never directly on production.

## 12. Open questions for the user

These are not blockers for the plan PR; they will be answered before
Code-PR-1 ships:

1. Where should media live long-term? Green API URLs expire; do we mirror
   to the existing `media` Storage bucket under `market-listings/{candidateId}/...`?
2. Should the review UI live under `/admin/...` (auth-gated, single user) or
   under `/market/candidates` for parity with existing market screens?
3. Default value for `MARKET_GROUP_WINDOW_SECONDS` — 300s a good fit, or do
   recent WA flows need 600s because suppliers send images on slow
   connections?
4. For Gmail: do we use a label-based opt-in (`Listing/Torah`), or scan all
   threads matching the §6 strong signals? Label-based is safer.

---

This plan is review-only. No DB / contact / market_torah_books mutations
were made in producing it. No migrations were run. The repository on
`codex/torah-listing-intelligence-plan` differs from `origin/main` solely by
the addition of this document.
