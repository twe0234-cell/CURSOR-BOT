# Trader Gallery and Checkout Spec

Branch: `codex/trader-gallery-checkout-spec`

## Mission scope

Roadmap/spec only for:

- trader/customer-facing galleries (inventory / market Torah books / Torah projects)
- phased checkout evolution (without implementing payment now)

No public exposure changes, no payment integration, no DB migration.

---

## 1) Audit findings (current system)

## 1.1 Existing public/share routes

- Public inventory page exists: `app/p/[slug]/page.tsx`
  - reads from `inventory` with filters:
    - `public_slug = slug`
    - `is_public = true`
  - intentionally selects a reduced column set in app code (does not request cost fields)
- Public project page exists: `app/project/[slug]/page.tsx`
  - reads from `erp_investments` through `fetchPublicProject(...)`
  - gated by `public_slug` + `is_public`

## 1.2 Existing share/public fields

- `inventory`:
  - `is_public` (boolean)
  - `public_slug` (uuid)
- `erp_investments`:
  - `is_public`
  - `public_slug`
- `market_torah_books`:
  - currently no `is_public` / `public_slug` model
  - RLS is user-owned only (`auth.uid() = user_id`)

## 1.3 RLS and data exposure observations

- Inventory public sharing policy exists (`019_public_sharing_and_settings.sql`):
  - anon `SELECT` allowed when `is_public = true`
- App route for `/p/[slug]` is careful about selected columns, but RLS policy itself is row-level and not column-level.
  - Risk note: if additional client/query paths are introduced, all columns on public rows can be queried unless extra DB hardening (view/RPC/column grants) is added.
- `market_torah_books` remains private by RLS (good baseline).

## 1.4 Image/media model

- Inventory media:
  - `inventory.images` is `text[]` (public URLs from Storage bucket `media`)
- Market Torah media:
  - `market_torah_books.handwriting_image_url` (single URL)
- Storage policies in `033_storage_media_rls_policies.sql` currently allow anon read/write/update/delete on bucket `media`.
  - This is broad and should be treated as high-risk for future public gallery scale.

---

## 2) Visibility model (target)

Define a single visibility enum for future gallery entries:

- `private`
  - owner/internal users only
  - default for all new items (must remain default)
- `unlisted`
  - accessible only via signed/unpredictable share link
  - not indexed or listed in public catalog
- `trader_only`
  - visible to authenticated trader audience (role/tag scoped)
  - not public internet
- `public`
  - open catalog listing
  - explicit publish action required

Recommended safety defaults:

- default create state: `private`
- publish action requires explicit owner confirmation and audit trail
- no automatic transition to `public`

---

## 3) Unified gallery item model (logical)

Canonical gallery entry should normalize sources:

- `source_type`: `inventory` | `market_torah_book` | `torah_project`
- `source_id`
- `visibility`: enum above
- `title`
- `photos`: string[] (primary first)
- `price_mode`: `fixed` | `price_on_request`
- `price_amount` (nullable)
- `status`: `available` | `reserved` | `sold` | `in_progress` | `archived`
- `summary_details` (size/script/parchment/etc.)
- `owner_contact_action` (WhatsApp/email/inquiry form)
- future hooks:
  - `reserve_enabled` (phase 2+)
  - `buy_enabled` (phase 3+)

Source mapping (current):

- inventory:
  - photos from `images[]`
  - price from `target_price`
  - status from `inventory.status`
- market_torah_book:
  - photos from `handwriting_image_url` (single now; extend to array later)
  - price from `asking_price` / `target_brokerage_price`
  - status from `market_stage`
- torah_project:
  - currently progress-oriented public view; commercial listing fields are partial

---

## 4) Recommended MVP (safe)

Phase MVP for trader gallery discovery (no checkout):

1. Keep existing exposure unchanged (`/p/[slug]`, `/project/[slug]`) until hardening is complete.
2. Add internal-only “Gallery Readiness” metadata (private) before any new public listing.
3. Build unified read model (server-only) that merges inventory + market books for owner dashboard preview.
4. Add explicit per-item publish controls in admin UI later, default off.

No new public endpoints in MVP without:

- explicit visibility model rollout
- storage access review
- route-level access tests

---

## 5) Checkout phases (roadmap)

## Phase 1 — Inquiry only

- gallery CTA: WhatsApp/email/inquiry form
- no reserve, no payment action
- manual follow-up in CRM

## Phase 2 — Reservation / deposit (manual marking)

- add “reserve” intent record
- manual status transition by owner (`reserved`, optional deposit received flag)
- no provider integration yet

## Phase 3 — Payment link provider

- create payment link externally via provider API
- store provider reference + status callbacks
- still keep invoice/receipt workflow mostly manual/assisted

## Phase 4 — Integrated checkout + invoice/receipt flow

- full checkout session
- payment webhook reconciliation
- invoice/receipt integration and ledger-safe posting path

---

## 6) Israeli סליקה providers (options only, no implementation)

Potential providers to evaluate:

- Tranzila
- CardCom
- Meshulam
- Pelecard
- Yaad Pay
- Grow (Cardcom ecosystem/merchant-specific offerings)

Evaluation checklist:

- hosted payment links and webhook reliability
- Hebrew/ILS UX support
- tokenization/PCI boundary
- reconciliation exports and ERP compatibility
- fee model + settlement timing
- invoice/receipt integrations (e.g. חשבונית ירוקה / iCount / Morning style systems where relevant)

---

## 7) Visibility risk assessment

Primary risks:

1. Row-level public policy on `inventory` can expose more columns than intended if queried outside curated route selection.
2. Storage `media` bucket policies currently include anon write/update/delete; this is too permissive for scaled public gallery scenarios.
3. Lack of unified visibility enum may cause inconsistent publish behavior across item sources.

Mitigation direction:

- prefer secure read views / RPC for public gallery data contracts
- tighten storage policies before broad public expansion
- keep `private` default and explicit publish workflow

---

## 8) Low-risk UI placeholder / toggle spec

Recommended (not implemented in this mission):

- Add internal admin-only “Gallery Visibility” badge on item cards:
  - `private` / `unlisted` / `trader_only` / `public`
- Keep toggle disabled unless explicit publish module is enabled.
- No behavior change, no exposure change.

---

## 9) Non-goals confirmed for this mission

- No payment provider implementation
- No public publishing-by-default
- No DB migration
- No destructive SQL
