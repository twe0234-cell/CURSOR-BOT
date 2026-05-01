# Inventory Share AI + Image

Branch: `cursor/inventory-product-share-ai-image`

## Audit summary

- Existing inventory share flow was a static WhatsApp prefilled text from `InventoryClient`.
- Copy was generic and short on details (type/script/price only).
- Product images already exist in inventory (`inventory.images[]`) and are shown in inventory cards/table.
- Communications stack already supports image URL in WhatsApp compose (`BroadcastTab` + `sendFileByUrl` flow).
- AI helper from prior communication work exists (`/api/email/ai-draft` with Gemini guards and short-output constraints).

## What was improved

- Added dedicated AI draft endpoint for inventory sharing:
  - `POST /api/inventory/share-draft`
  - returns very short Hebrew share copy (WhatsApp/email channel aware).
  - uses Gemini when configured and healthy.
  - always falls back to deterministic short template if AI is unavailable.
- Inventory share buttons now generate draft on click (no real send):
  - WhatsApp share draft (`שיתוף WA`)
  - Email draft (mail icon)
- Draft content includes:
  - product type/title
  - supplier/sofer (if available)
  - details/size/script
  - price (if available)
  - status/condition
  - short CTA
- WhatsApp formatting is compact and operation-friendly:
  - bold opening line
  - bullet lines (`•`)

## Image handling

- WhatsApp path:
  - when inventory image exists, it is passed as prefilled image URL to communications (`?image=...`).
  - `BroadcastTab` starts with that image URL prefilled.
- Email path:
  - image attachment is not auto-sent from inventory share draft flow.
  - fallback is a clear image link included in prefilled body.

## Fallback behavior

- If AI provider key/model is missing/unhealthy or generation fails:
  - share still works with deterministic short fallback copy.
- User gets a light info toast that fallback template was used.

## Safety and scope

- No real WhatsApp or email sends in this change (draft/compose only).
- No credential/provider changes.
- No contact-intelligence work.
- No DB migration or schema change.
