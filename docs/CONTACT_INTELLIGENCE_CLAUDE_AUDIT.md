# Contact Intelligence / Claude Work Audit

Date: 2026-04-26
Branch: `codex/contact-intelligence-claude-audit`
Issue: `#13`

## Scope And Safety

This was a discovery-only audit of existing repository and local workspace artifacts related to contact intelligence, contact matching, entity resolution, Gmail/WhatsApp parsing, transaction parsing, review exports, and Claude-generated work.

No ingestion was run. No contacts were merged. No CRM production data was mutated. No raw files were overwritten. No destructive scripts were executed.

Inspected locations:

- Current repo checkout: `C:\Users\T590\Documents\Codex\2026-04-26\post-merge-main-verification`
- Sibling workspace root: `C:\Users\T590\Documents\Codex\2026-04-26`
- Older/local checkout if present: `C:\Users\T590\Documents\broadcast-buddy`

## Existing Files, Scripts, And Docs Found

| Artifact | What it appears to do | Safety / reversibility | Data sources | Counts / metrics found |
| --- | --- | --- | --- | --- |
| `src/services/contactMatching.logic.ts` | Pure contact matching utility. Normalizes phone/email/name and returns a best existing CRM contact match. Priority: phone/WhatsApp chat id, email, then exact normalized name. | Safe to run in tests; no I/O and no mutation. Good reusable core. | In-memory candidates supplied by caller. | Unit test coverage exists in `contactMatching.logic.test.ts`. |
| `src/services/contactMatching.ts` | Authenticated server helper that loads current user's `crm_contacts` and calls pure matching logic. | Read-only DB query when called. Safe if used only as lookup. | `crm_contacts` for authenticated user. | No persisted metrics. |
| `src/services/contactMatching.logic.test.ts` | Unit tests for phone normalization, email matching, WhatsApp chat id matching, name fallback, and priority behavior. | Safe. | Synthetic test fixtures only. | Several deterministic cases; no production data. |
| `src/services/crm.service.ts` | Main CRM service. Contains Gmail import, duplicate detection, merge contacts, soft merge/archive, and bulk delete code paths. | Mixed. Read/list operations are safe; `importGmailContacts`, `mergeCrmContacts`, and delete paths mutate CRM data and must not be run during audit. | Gmail People API, `crm_contacts`, `crm_contact_identities`, `crm_merge_suggestions`, related CRM/ERP tables. | Gmail import uses `pageSize=1000`; duplicate groups are computed on demand, not persisted. |
| `app/crm/actions.ts` and `app/crm/CrmClient.tsx` | UI/server-action wrappers for Gmail import, duplicate detection, and merge dialog. | Duplicate detection is read-only; import and merge mutate CRM. | User-triggered CRM UI. | UI shows imported count / duplicate groups at runtime only. |
| `supabase/migrations/050_crm_identity_layer.sql` | Creates `crm_contact_identities` and `crm_merge_suggestions` tables with tenant RLS. Intended foundation for external IDs and future AI/heuristic dedupe queue. | Schema already exists from earlier migration. Safe conceptually, but not a runtime pipeline. | Gmail, WhatsApp, system/manual/import identifiers are supported by schema. | No row counts inspected during this audit. |
| `supabase/migrations/071_crm_phase3_identity_arrays_community.sql` | Adds CRM identity/address/community fields and backfills from legacy columns/profiles. Documents legacy compatibility. | Migration is historical. Do not re-run manually. | Existing CRM contacts and sofer profiles. | No audit counts in file. |
| `supabase/migrations/061_crm_extra_contacts.sql` | Adds `extra_phones` and `extra_emails` JSONB fields to CRM contacts. | Historical additive schema. | CRM contacts. | No counts. |
| `supabase/migrations/072_crm_merge_soft_delete.sql` | Adds soft-merge / archive fields used by contact merge flow. | Historical schema. Merge flow is reversible only by careful manual repair; do not automate. | CRM contacts. | No counts. |
| `src/lib/gmail.ts` | Gmail OAuth helper: token refresh, revoked-token cleanup, and send email via Gmail API. | Token refresh is network I/O; revoked-token cleanup mutates `user_settings`. Not an ingestion pipeline by itself. | Gmail OAuth / Gmail send API. | No counts. |
| `app/email/import/actions.ts` | Gmail triage import flow. Fetches Gmail People API contacts, filters existing CRM/ignored emails, lets user create/link contacts, append notes, and write `sys_events`. Also parses market Torah text from pasted email content. | Fetch/triage is mostly read-only; create/link/ignore/save mutate CRM/sys tables. Manual review-oriented, not batch entity resolution. | Gmail People API, `crm_contacts`, `sys_ignored_emails`, `sys_events`, pasted email text. | Gmail contacts request uses `pageSize=1000`; triage count returned at runtime only. |
| `app/email/import/TriageTable.tsx` and `app/email/import/page.tsx` | Review UI for Gmail triage contacts and manual save/link actions. | Safe to view; actions can mutate when user submits. | Gmail triage rows from server action. | No persisted metrics. |
| `app/email/actions.ts` | Email audience/contact actions, including Gmail contact import to `email_contacts` and CRM-to-email sync. | Mutating when import/sync actions are called. | Gmail People API, `email_contacts`, `crm_contacts`. | Gmail import uses `pageSize=1000`; returns imported count at runtime. |
| `app/api/admin/import-contacts-csv/route.ts` | Token-protected CSV contact import endpoint. Parses raw CSV/text with name/phone and inserts new `crm_contacts`, skipping existing phone matches. | Mutating endpoint. Do not call during audit. Reversibility depends on tags/logs and manual cleanup. | Raw CSV request body. | Runtime response includes parsed/imported/skipped/errors. |
| `app/api/admin/import-wa-contacts/route.ts` | Token-protected one-time WhatsApp contact import. Pulls Green API chats, skips groups, filters active individual chats in last 18 months, inserts missing contacts. | Mutating endpoint. Do not call during audit. | Green API `getChats`, `user_settings`, `crm_contacts`, `sys_logs`. | Runtime response includes total chats, active individual, imported, skipped, errors. |
| `scripts/extract_green_api.py` | Local extraction prototype. Pulls Green API contacts, normalizes phones, skips groups, writes `scripts/wa_contacts_dump.json`. | Read from Green API/Supabase settings and writes a local JSON dump. Not destructive, but creates raw-ish local data and should not be run without data handling rules. | Green API contacts; optionally Supabase `user_settings` for credentials. | Logs `total_raw`, `total_clean`, skipped groups when run. No dump file currently found in repo. |
| `scripts/inject_to_supabase.py` | Local injection prototype. Reads `wa_contacts_dump.json` and upserts contacts into Supabase `crm_contacts`; has `--dry-run`. | Mutating unless `--dry-run` is used. Do not run against production without review/export/rollback. | Local JSON dump, Supabase REST, `crm_contacts`. | Logs valid rows, batch count, total ok/error at runtime. |
| `app/audience/actions.ts` and `app/whatsapp/GroupManagementTab.tsx` | WhatsApp audience/group import and sync using Green API. | Fetch is read-only; save/sync/delete/tag actions mutate `audience`. Related but not contact entity resolution. | Green API contacts/groups, `audience`. | Runtime counts for selected/imported groups only. |
| `src/lib/market/parseWhatsAppMarketMessage.ts` and test | Parses structured WhatsApp/email market Torah messages into market book fields: size, script, owner, ready date, asking price. | Pure parser is safe. The webhook/import callers can mutate market tables. | Text messages / pasted email content. | Unit tests exist; no production metrics. |
| `app/api/whatsapp-webhook/route.ts` | Green API webhook for market Torah messages. Parses text/images, creates or updates `market_torah_books`, logs debug rows, handles duplicate SKU. | Mutating live webhook. Do not replay during audit. | Green API webhook payloads, `market_torah_books`, `sys_logs`. | Debug logs and runtime insert/update outcomes only. |
| `scripts/debug-webhook.mjs` and `scripts/debug-webhook-groups.mjs` | Debug scripts that query webhook config/logs and recent market rows/group mismatch counts. | Read-only SQL, but connects to DB and may expose operational metadata in console. Safe only in controlled diagnostic mode. | `user_settings`, `sys_logs`, `market_torah_books`. | Recent 30 logs / last 5 books / last 7 day group mismatch counts when run. Not run in this audit. |
| `components/crm/ContactSysEventsBlock.tsx` | Displays contact-related `sys_events` on contact detail page. | Read-only UI. | `sys_events` already written by app flows. | No aggregate metrics. |
| `app/crm/[id]/ContactDetailClient.tsx` | Contact detail UI includes source/channel display for WhatsApp/Gmail/history. | UI can include edit actions elsewhere; source display itself is safe. | CRM contact detail data. | No counts. |
| `CLAUDE.md`, `AGENTS.md`, `.cursor/*`, `.codex/README.md` | Agent rules and architecture notes. Mention Gmail, WhatsApp, Claude/Cursor workflow. | Documentation only. | N/A. | No contact-intelligence metrics. |
| `C:\Users\T590\Documents\broadcast-buddy\חלוקת_עמודים_רמה11.xlsx` and `.csv` | Local Excel/CSV artifacts found outside current repo checkout. Filename suggests Torah page/layout division, not contact intelligence or transactions. | Raw/local files; not opened or processed during audit. | Unknown. | File sizes found: CSV `5,931` bytes, XLSX `18,456` bytes. |

## Search Results By Target Area

Gmail parsing / import:

- Existing work is centered around Gmail OAuth, Gmail People API contact import, email-contact audience sync, and manual Gmail triage into CRM.
- No large Gmail mailbox parser or message-level entity-resolution pipeline was found.
- `app/email/import/actions.ts` can manually save triage rows to CRM and `sys_events`, but it is not a batch candidate-review export pipeline.

WhatsApp parsing / import:

- Green API integration exists in broadcast/audience/webhook areas.
- WhatsApp market message parsing is implemented as a pure parser plus a mutating webhook.
- WhatsApp contact import exists in two forms: a token-protected admin endpoint and local extract/inject scripts.
- No review CSV export for WhatsApp candidate matches was found.

Excel transaction parsing:

- No dedicated Excel transaction parser was found in the current repo.
- The app has transaction UI and ERP transaction migrations, but no discovered `xlsx` transaction ingestion pipeline.
- The only local `.xlsx/.csv` artifacts found appear unrelated by filename.

Contact matching / duplicate detection / entity resolution:

- A small pure matching core exists and is worth keeping.
- Duplicate detection exists in `crm.service.ts` using phone/email/name grouping/fuzzy-ish comparison.
- A future-facing identity table and merge-suggestion queue exist in schema.
- No full candidate-scoring pipeline was found that writes reviewable match suggestions into `crm_merge_suggestions`.

Raw data tables / local DB prototypes:

- Schema exists for CRM identities and merge suggestions.
- No tracked SQLite/DuckDB/local DB prototype files were found.
- No tracked review CSV/JSONL exports were found.
- No current `scripts/wa_contacts_dump.json` output file was found.

Business event extraction:

- `sys_events` is used for CRM/Gmail contact events and contact detail display.
- Market webhook logs operational/debug events to `sys_logs`.
- No generalized business-event extraction pipeline from Gmail/WhatsApp/Excel was found.

Claude-generated scripts/docs/reports:

- Claude/Cursor agent docs exist, but no specific Claude-generated contact-intelligence report/export was found.
- The local Python Green API extract/inject scripts look prototype-like and may have been agent-generated, but they are not safe as-is for production use except `--dry-run`.

## Gaps And Unknowns

- No known inventory of previously processed raw datasets was found.
- No persisted candidate-match review artifact was found.
- No counts were available for actual duplicate groups, imported Gmail contacts, imported WhatsApp contacts, or merge suggestions without querying production data.
- No offline SQLite/DuckDB prototype was found.
- No Excel transaction parser was found.
- Existing import paths are action-oriented and mutate production tables when invoked; they are not audit-first pipelines.
- Encoding artifacts appear in several Hebrew comments/files, which may make future parser/report work harder to review.
- Existing matching is deterministic and simple; it does not yet model aliases, multiple phones/emails beyond direct fields, confidence evidence, or human review queues.

## Recommendation

Recommendation: refactor and continue selectively, not start completely clean.

Keep and reuse:

- `contactMatching.logic.ts` as the pure normalization/matching seed.
- `crm_contact_identities` and `crm_merge_suggestions` as the right storage direction for identifiers and review queues.
- Gmail/WhatsApp adapters as source-specific fetchers, but behind explicit dry-run/export modes.
- `sys_events` as business-event provenance once reviewed actions are accepted.

Do not continue as-is:

- Do not run existing import endpoints/scripts directly against production for the next phase.
- Do not use `mergeCrmContacts` automatically from a new pipeline.
- Do not write raw ingestion directly into `crm_contacts` before producing a review artifact.

Recommended next implementation step:

1. Build a read-only local audit/export command that reads existing CRM contacts and selected source inputs, then emits a review CSV/JSON file with candidate matches and evidence.
2. Normalize all identifiers into a shared pure module: email, phone, WhatsApp chat id, names, aliases.
3. Populate `crm_merge_suggestions` only after a human-reviewed dry run and explicit approval.
4. Keep raw source files immutable; write derived outputs to timestamped `artifacts/contact-intelligence/<timestamp>/` or another ignored audit folder.
5. Add tests before any production write path: phone/email normalization, duplicate scoring, conflict cases, and no-cross-user behavior.

## Audit Commands Run

```powershell
git grep -n -i -E "gmail|whatsapp|excel|xlsx|transaction parsing|contact matching|duplicate|dedupe|entity resolution|candidate match|raw data|sqlite|business event|review csv|claude"
Get-ChildItem ... -Include *.db,*.sqlite,*.csv,*.xlsx,*.jsonl
```

No ingestion scripts, migration commands, merge actions, or production mutation commands were run.
