## Stabilization Report: Torah + CRM + QA

### Files changed
- `app/globals.css`
- `src/services/crm.logic.ts`
- `app/torah/[id]/TorahOverviewTab.tsx`
- `app/torah/[id]/TorahFinancialsTab.tsx`
- `app/torah/[id]/TorahDetailClient.tsx`
- `app/torah/[id]/qa-actions.ts`
- `app/torah/TorahClient.tsx`
- `app/torah/quick-entry/QuickEntryClient.tsx`
- `app/sales/SalesClient.tsx`
- `app/investments/InvestmentsClient.tsx`
- `app/inventory/InventoryClient.tsx`
- `src/lib/market/parseWhatsAppMarketMessage.ts`
- `docs/WHATSAPP_TEXT_IMAGE_LIMITATION_NOTE.md`

### Numeric UX fields fixed
- Sales form: quantity, unit price, paid-so-far, commission, project sale totals no longer force visible defaults.
- Investments form: quantity and cost-per-unit in create/edit no longer force visible defaults.
- Torah create/edit forms: key numeric fields now initialize blank where possible and use example placeholders.
- Torah quick-entry amount now uses example placeholder instead of forced `0`.
- Inventory save payload now keeps optional `amount_paid` as `null` when empty.

### Torah validations changed
- Payment-before-approval behavior is now warning-only wording:
  - `"שולם לפני אישור/קבלה — ודא שזה מכוון"`
- Added non-blocking warning display style for this scenario in Torah overview.

### Expected profit formula used
- `רווח צפוי לפי תוכנית` = contract total
  - planned scribe cost
  - planned parchment cost
  - planned proofreading/QA cost
  - planned misc/operational costs
  + approved budget deviations (currently `0` until explicit approvals source exists)
- `תזרים בפועל עד עכשיו` = actual cash-in - actual cash-out
- `חריגות תקציב מאושרות` displayed separately.

### Payment-before-approval behavior
- Payment save flow remains allowed.
- Warning message is shown; save is not blocked.

### QA bag behavior (edit/delete/override)
- Added QA batch metadata edit before close (`sent` only): cost + notes.
- Added free-text contact search in QA batch creation selector.
- Added safe cancel/void flow:
  - Normal: can void only when related sheets are still `in_qa`.
  - Emergency override: allowed with required reason.
  - Every void/override writes audit event via `sys_events`.
- No hard delete path was introduced for unsafe cases.

### Remaining limitations
- No new DB migration for additional Torah QA planning columns in this pass.
- Approved budget deviation source is not yet backed by a dedicated approval table; currently exposed as separate value with default `0`.
- WhatsApp text+image grouping remains a documented limitation only (see `docs/WHATSAPP_TEXT_IMAGE_LIMITATION_NOTE.md`).
