# TORAH_LISTING_SEARCH_AND_INTAKE

Spec for a review-first candidate extractor that surfaces ready Sefer Torah
listings from WhatsApp + Gmail and gates them behind human approval before
any record reaches `market_torah_books`.

Date: 2026-04-29.
Branch: `codex/torah-listing-search-plan`.
Scope: spec + one safe pure helper (`classifyTorahListingSignal`) + tests.
**No** new tables, edge functions, schedulers, or live behavior changes.

## 1. Audit — current code

| Surface | Behavior today | Gap vs goal |
| --- | --- | --- |
| `src/lib/market/parseWhatsAppMarketMessage.ts` | Pure parser. Extracts `script_type`, `torah_size`, `owner_name`, `ready_date`, `asking_price` from a Hebrew line-format message. `parsedMessageIsActionable` requires only `price > 0`. | No `condition`, `mugah`, `gavra`, `computer-checked`, `hidur`, `sheet count`, `images`, `confidence`, `evidence`. |
| `app/api/whatsapp-webhook/route.ts` | Green API webhook. Auth by `WEBHOOK_SECRET`. For configured `wa_market_group_id`: image-only → `market_stage='image_pending'`; text → parses; if a recent `image_pending` from same `sender_wa_id` exists, **merges** text into it; otherwise **inserts directly into `market_torah_books`**. Reacts ✅/❌ on the WA message. | Auto-creates final rows. Same-sender merge only — no chat-id+time-window grouping. No confidence/evidence. No human-review surface. |
| `app/email/import/actions.ts` → `importMarketTorahFromEmailMessage(rawText, sourceEmail?)` | User pastes an email body; runs same parser; if actionable, **inserts directly into `market_torah_books`** with `notes = first 5000 chars`. | Same gap — direct insert, no candidate buffer. |
| `app/email/import/actions.ts` → `fetchGmailTriageContacts`, `saveGmailTriageToCrm`, `mergeCrmContactEmail`, `ignoreEmail` | Existing CRM-side Gmail triage (contacts only, not listings). Writes `sys_events` for traceability. | Reuse the **pattern** (manual triage + audit event), **not** the merge logic. |
| `app/api/email/ai-draft/route.ts` | Outbound AI draft. | Out of scope. |
| `app/market/MarketClient.tsx` + `app/market/kanban/MarketKanbanClient.tsx` | List/kanban over `market_torah_books`. | Will need a "candidates" tab/queue (spec §8). |

### Schema audit — `market_torah_books`

Built across migrations 035, 037, 043, 051, 056, 058, 063, 068. Columns the
extractor cares about:

| Column | Source migration | Notes |
| --- | --- | --- |
| `id, user_id, sku, sofer_id, dealer_id, external_sofer_name, script_type, torah_size, parchment_type, influencer_style, asking_price, target_brokerage_price, currency, expected_completion_date, notes, last_contact_date, negotiation_notes, handwriting_image_url` | 035, 037, 043, 051 | Live commercial fields. |
| `source_message_id` (UNIQUE partial idx) | 056 | Idempotency anchor for WA. |
| `market_stage` CHECK IN `('image_pending','new','contacted','negotiating','deal_closed','archived')` | 058 | No `candidate`/`reviewed`/`approved`/`rejected`/`promoted` set. |
| `sender_wa_id` | 068 | Same-sender merge anchor. |

Hard takeaway: the live table can be reused as the **promotion target**, but
must not be the inbound write target until the user approves the candidate.

## 2. Listing signals — `classifyTorahListingSignal`

Pure deterministic classifier added in this PR
(`src/lib/market/torahListingSignal.ts`). Returns
`{ kind: 'listing'|'wanted'|'unrelated', score: 0..1, hits[] }`.

### Strong (any one ⇒ likely a listing)

- `ספר תורה`, `ס"ת` / `ס״ת`, `הכנסת ספר תורה`, `ספר תורה למכירה`
- `sefer torah`, `torah scroll`
- `sefer toyre`, `toyre` (Yiddish)

### Support (need ≥ 2 to flag a listing on its own)

- Readiness — `מוכן/מוכנה/זמין/available`
- Mugah — `מוגה/מוגהת/mugah/proofread`
- Computer-checked — `בדוק מחשב`
- Gavra — `גברא`
- Script — `בית יוסף`, `ב"י`, `אר"י`, `ארי`, `ari`, `ספרדי`, `וועליש`, `welish`
- Sheets — `יריעות`, `sheets`, column counts `24|30|36|42|48|56`
- Price — `מחיר`, `price`, `nis`, `usd`, `₪`, `ש"ח`
- Images — `תמונה(ות)`, `pic(s)`, `photo(s)`, `images`
- Condition — `תיקונים`, `תיקון`, `מצב`, `condition`, `repairs`

### Anti-signals (downgrade)

- Wanted: `מבקש`, `מחפש`, `wanted`, `looking for`, `searching` ⇒ `wanted`
- Off-topic: `מזוזה`, `תפילין`, `tefillin`, `מגילה`, `megillah`, `ת"ת` ⇒ `unrelated` (unless strong term present)

### Score formula

```
strongScore  = min(1, strongCount) * 0.5
supportScore = min(5, supportCount) * 0.1
score = min(1, strongScore + supportScore)
```

Tests for the classifier ship in
`src/lib/market/torahListingSignal.test.ts` (positive, wanted, off-topic,
empty, English, "support-only ≥ 2" cases).

## 3. WhatsApp grouping rule

### 3.1 Grouping key

`(user_id, chatId, sender_wa_id)` within a rolling **5-minute window**
(`MARKET_GROUP_WINDOW_SECONDS`, default 300, min 60, max 900). Window is
anchored on the earliest message and extended by each new message; once it
expires, the bucket seals.

### 3.2 Bucket states

```
open      — accepting more text/image from same key
sealed    — window elapsed; can be promoted to candidate
candidate — written into the candidate buffer; no more grouping
```

Promotion triggers:
- Bucket has at least one text message classified as `listing` (§2) **and**
  parser deems it `actionable` (price present), **or**
- User flushes the bucket manually from the review UI.

Image-only buckets never auto-promote — they wait for accompanying text up
to the window horizon, then become a candidate with `needs_text` flag in
`evidence` so the user decides.

### 3.3 Idempotency

`grouped_message_ids` — every `idMessage` is unique across the candidate
table for the user. Replays update the existing candidate, never duplicate.

### 3.4 Hard rule

The bucket → candidate transition writes to the candidate buffer **only**.
`market_torah_books` is touched only on user Approve.

## 4. Candidate schema recommendation

New logical type — **`torah_listing_candidates`** — sits between raw
message and `market_torah_books`. Suggested columns (no migration in this
PR):

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid (FK auth.users) | RLS owner. |
| `source_type` | text CHECK IN (`'whatsapp'`,`'gmail'`,`'manual'`) | Origin channel. |
| `source_ref` | jsonb | WA: `{idMessage, chatId, instanceId}`. Gmail: `{messageId, threadId, gmailFrom}`. Manual: `{enteredBy}`. |
| `sender_handle` | text | Raw — WA id `…@c.us` or email. **Never auto-merged** into CRM. |
| `sender_display_name` | text | Best-effort name. |
| `linked_contact_id` | uuid nullable | Set only if user explicitly links during review. |
| `grouped_message_ids` | text[] | All ids rolled up. Unique per element per user. |
| `media_refs` | jsonb[] | `[{kind:'image', url, idMessage, captured_at}]`. |
| `extracted_fields` | jsonb | Parser output frozen at extract time + per-field evidence index. |
| `confidence` | numeric(3,2) | See §5. |
| `evidence` | jsonb[] | `[{field, source_kind, source_idMessage, span:[start,end], matched_signal, rule}]`. |
| `status` | text CHECK IN (`'candidate'`,`'reviewed'`,`'approved'`,`'rejected'`,`'promoted'`) | Lifecycle. |
| `promoted_book_id` | uuid nullable | FK → `market_torah_books.id`. Set on promotion only. |
| `created_at`, `updated_at`, `reviewed_at`, `reviewed_by`, `rejection_reason` | audit | Required on `rejected`. |

Indexes: `(user_id, status, created_at desc)`, GIN on `grouped_message_ids`.
RLS: owner-only.

## 5. Confidence formula (deterministic)

```
confidence =
   0.40 * has(asking_price)
 + 0.20 * (has(script_type) || has(torah_size))
 + 0.10 * has(owner_name)
 + 0.10 * has(ready_date)
 + 0.10 * has(image)
 + 0.10 * (signal_score >= 0.5 ? 1 : 0)
```

Cap at 1.00. Persisted on the candidate. Drives review-screen sort/filter:
`>= 0.70` ready to approve, `0.40–0.69` needs review, `< 0.40` hidden by default.

## 6. Sequenced rollout (each in its own PR)

1. **M-A** — `CREATE TABLE torah_listing_candidates` + RLS + indexes.
   Additive only. No drop, no destructive backfill.
2. **M-B** — `market_torah_books` adds `promoted_from_candidate_id uuid`.
3. **M-C** — extend `market_stage` CHECK to include `candidate` (legacy
   values keep working).
4. **Code-PR-1** — switch `app/api/whatsapp-webhook/route.ts` to write
   candidates instead of books, behind `MARKET_INTAKE_REVIEW_FIRST=true`
   feature flag (default off — production unchanged until flag flips).
5. **Code-PR-2** — switch `importMarketTorahFromEmailMessage` to candidates.
6. **Code-PR-3** — review UI under `/admin/torah-listings/candidates` with
   per-field evidence and Approve/Reject/Edit actions.
7. **Code-PR-4** — opt-in Gmail polling (cron) for label-tagged threads.

## 7. What this PR is **not** doing

- No CRM merge / dedupe.
- No automatic `sender_wa_id → crm_contacts` linking.
- No LLM extraction in v1.
- No image OCR in v1.
- No retroactive backfill of historical messages.
- No production DB changes.

## 8. Validation

- `npm test` ✅ — 258 → 265 (+7 classifier tests).
- `npm run build` ✅ — Turbopack production build passes.

## 9. Confirmations

- ✅ No auto-create in `market_torah_books`.
- ✅ No automatic CRM contact merge.
- ✅ No production DB mutation.
- ✅ Classifier is pure (zero I/O).
