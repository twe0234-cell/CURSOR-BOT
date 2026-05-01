# Sales UI Density Notes

Branch: `cursor/sales-ui-density-go-live`

## Goal

Improve day-to-day desktop usability on `/sales` by using more horizontal space and reducing vertical density overhead, without touching sales business logic.

## What changed

- Expanded page container width:
  - from narrow centered layout to a wider responsive container (`max-w-[1680px]`).
- Reduced top-level spacing:
  - tighter page paddings, header spacing, and tabs spacing.
- Compacted sales card/grid view:
  - smaller card paddings and gaps.
  - tighter badges and action button heights.
  - denser mediation status panel spacing.
- Compacted table view:
  - tighter header/cell paddings.
  - reduced row height.
  - `whitespace-nowrap` on numeric/short columns to preserve scanability.
  - truncated long item/buyer labels to keep important finance/action columns visible.
- Compacted expenses block similarly for visual consistency.

## Usability impact

- Desktop:
  - more rows/cards visible per viewport.
  - less scrolling in operational usage.
  - key operational columns remain directly visible (type, buyer, amounts, status, actions).
- Mobile:
  - still responsive (no forced desktop-only layout).
  - compact classes are applied with responsive safeguards (`sm`/`lg`), so controls remain tappable.

## Out of scope (kept unchanged)

- No DB/schema changes.
- No migrations.
- No sales/commission business logic changes.
- No barcode-related scope.
- No contact-intelligence scope.
