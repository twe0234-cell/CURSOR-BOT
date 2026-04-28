# Barcode Operational Navigation Plan

Branch: `cursor/barcode-inventory-lookup-go-live`

## Existing barcode/label assets found

- `components/inventory/BarcodePrint.tsx`
  - Inventory SKU barcode + QR printing for Nimbot B1 labels.
- `components/labels/LabelCode.tsx`
  - Shared CODE128 barcode + optional QR renderer.
- `components/torah/QaBatchLabel.tsx`
  - QA batch label with batch barcode and QR payload.
- `components/torah/TorahSheetRollLabel.tsx`
  - Torah sheet roll label per sheet with barcode and QR payload.
- `app/torah/[id]/print-labels/PrintTorahRollClient.tsx`
  - Roll printing entry for 62 Torah sheet labels.
- `app/torah/[id]/print-batch/[batchId]/PrintBatchClient.tsx`
  - Single QA batch label print entry.
- `src/lib/labels/codePayload.ts`
  - Unified payload format (`BB|kind|...`) for future scan parsing.

## Identifiers available today

- SKU: inventory (`inventory.sku`) and fallback usages in labels/lookups.
- Barcode:
  - No dedicated top-level `inventory.barcode` field in current read path.
  - Optional barcode-like value can exist in `inventory.category_meta` keys (e.g. `barcode`, `bar_code`, `barcode_value`).
- Item id: `inventory.id`
- Sheet id / sheet number:
  - Torah sheets (`torah_sheets.id`, `torah_sheets.sheet_number`)
- QA batch id:
  - `torah_qa_batches.id`

## Where plain-text "scan" already works today

- Sales from inventory:
  - Search box now supports matching by SKU, barcode metadata (if present), product category, scribe/supplier name, and size.
  - This allows scanner keyboard-wedge input directly into the search field.
- Inventory label print:
  - Existing labels print machine-readable barcode + QR payload, usable by scanner apps.

## What is missing for true scan workflows

- No central scan parser/router UI that accepts scanned string and navigates to entity page automatically.
- No dedicated barcode column on inventory normalized in the main schema/read model.
- No explicit scan entry points in:
  - inventory list (open specific item)
  - QA send/return flows (open specific batch)
  - Torah sheet workflow transitions (receive/move-to-QA by scan)
- No stateful scan event/audit model for operational traceability.

## Recommended next steps (roadmap)

### 1) Inventory
- Add global scan input on inventory page.
- Parse scanned token (`BB|inventory|...` / raw SKU / raw barcode).
- Resolve to item and open edit/details drawer directly.

### 2) Sale from inventory
- Keep current search-as-scan (implemented here).
- Add autofocus scan mode toggle ("מצב סריקה") to avoid manual clicks during checkout.

### 3) QA bag out/in
- Add scan field in QA tab:
  - scan batch label to load batch card.
  - actions: mark sent / mark returned with confirmation.

### 4) Torah sheet receive / move to QA
- Add scan field in Torah sheet grid workflow:
  - scan sheet label to open exact sheet row.
  - quick actions: received, in QA, approved.

### 5) Labels/printing
- Keep existing label components as source of truth.
- Standardize payload keys across inventory/QA/sheet labels for deterministic parsing.

## Go-live pass scope in this PR

- Focused lookup improvements only:
  - richer inventory selector label
  - scan-friendly search fields
  - no full scan workflow implementation yet
- No migration, no schema change, no barcode print flow breakage.
