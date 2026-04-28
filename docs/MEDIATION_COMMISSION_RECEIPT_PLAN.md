# Mediation Commission Receipt Flow

Branch: `cursor/mediation-commission-receipt-flow`

## Audit summary

### Where expected commission is stored

- Mediation deals are stored in `erp_sales` with `sale_type = "תיווך"`.
- Expected commission is represented by `total_price` (and mirrored in legacy commission fields by existing logic).
- Relevant existing write path:
  - `app/sales/actions.ts` → `createSale(...)` with mediation type.
  - `src/services/crm.logic.ts` → `computeSaleFinancialPatch(...)`.

### Where actual receipt is stored

- Actual received money is already representable through existing payments ledger:
  - `erp_payments` rows with:
    - `entity_type = "sale"`
    - `entity_id = <sale_id>`
    - `direction = "incoming"`
- Existing write path already available:
  - `components/payments/PaymentModal.tsx`
  - `app/sales/actions.ts` → `addSalePayment(...)`
  - `app/payments/actions.ts` → `recordLedgerPayment(...)`

### Read path used for received amount

- `app/sales/actions.ts` (`fetchSales`) aggregates `erp_payments` for sale rows and computes:
  - `total_paid`
  - `remaining_balance`

Therefore no schema change is required for go-live receipt tracking.

## Implemented go-live UX (no migration)

- Added mediation-specific action label in sales list/cards:
  - `רשום קבלת עמלה`
- Reused existing safe payment flow (no duplicate ledger logic).
- For mediation rows, UI now shows:
  - expected commission
  - received commission
  - remaining receivable
  - status:
    - `לא שולם`
    - `שולם חלקית`
    - `שולם במלואו`
- Payment modal title for mediation now clarifies context and shows payer name when available.

## Safety and scope notes

- No DB migration.
- No schema change.
- No new payment table logic.
- No barcode, no sales-density redesign, no contact intelligence changes.
