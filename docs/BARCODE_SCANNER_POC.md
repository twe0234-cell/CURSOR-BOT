# BARCODE_SCANNER_POC

POC: browser-camera barcode/QR scanning for inventory and Torah workflows.

Date: 2026-04-29.
Branch: `cursor/barcode-camera-scan-poc`.
Scope: small, additive, single entry point. No DB migrations. No replacement of
existing barcode UI.

## Existing label format (audited)

- Library on labels: `react-barcode` ^1.6.1 with `format="CODE128"` (see
  `components/labels/LabelCode.tsx`).
- QR alongside barcode via `qrcode.react`'s `QRCodeSVG`.
- QR payload format defined in `src/lib/labels/codePayload.ts`:
  `BB|<kind>|key1=value1|key2=value2|...` where `kind ∈ {inventory, torah-sheet, qa-batch}`.
- SKU format from `lib/sku.ts`: `${PREFIX}-XXXXXXXX` (8 uppercase hex). Prefixes:
  `HD` (inventory), `MKT` (market torah book), `CRM` (contact).
- Print template: Nimbot B1 50mm × 30mm landscape (see `components/inventory/BarcodePrint.tsx`,
  `components/torah/QaBatchLabel.tsx`, `components/torah/TorahSheetRollLabel.tsx`).

The scanner therefore must read **CODE128** (primary, bar) and **QR**
(secondary, structured payload). EAN/UPC/CODE39 are nice-to-have for
non-app barcodes the user may already own (e.g. third-party stock).

## Library

`@zxing/browser@^0.2.0` — maintained TS port of ZXing, ~120KB gzipped, ESM,
no native deps. Wraps `getUserMedia` and exposes `BrowserMultiFormatReader`
which auto-detects format per frame. Picked over `html5-qrcode` because it
ships ESM + types and integrates cleanly with `next/dynamic`.

Bundle impact contained via `dynamic(() => import(...), { ssr: false })`
in `app/sales/SalesClient.tsx` — scanner code is split out and loaded only
when the user clicks the scan button.

## First scan entry point

`/sales` → "מכירה חדשה" dialog → "פריט ממלאי" section.

Why this and not `/inventory`:
- `/inventory` does not have a free-text search box today (only category
  filter). Adding one alongside the scanner doubles the surface.
- `/sales` already has `inventorySearch` state matching name + SKU
  (`SalesClient.tsx:139–148`). Scanner just needs to set the same state.
- This is the highest-frequency lookup-by-SKU flow in the live business
  ("scan tag → choose item → record sale"), so it is the most useful first
  POC location.

UI:
- New "סרוק" button to the right of the existing search input (RTL).
- Click → fullscreen overlay with live camera, viewfinder rectangle, close
  button.
- On first decode, the overlay closes and the search input is filled with
  the decoded token (auto-extracted SKU when payload is the QR `BB|...`
  form, otherwise the raw barcode value).
- A `toast.success` confirms the scan. The user must still pick the item
  in the existing `<select>`. **Nothing destructive auto-fires.**

## Supported barcode formats

`BrowserMultiFormatReader` auto-decodes any of these with the default
hints set:

- CODE128 (primary, used by app labels)
- QR (label payload — auto-extracts the `sku=` field via
  `extractScannedToken`)
- EAN-8, EAN-13
- UPC-A, UPC-E
- CODE39
- ITF (Interleaved 2 of 5)
- DATA_MATRIX, AZTEC, PDF_417 (best-effort — works on most devices)

CODE128 + QR are the only ones we depend on; the rest are bonus.

## Decoded payload handling

```ts
extractScannedToken(raw)
  raw = "HD-A1B2C3D4"                                  → "HD-A1B2C3D4"
  raw = "BB|inventory|sku=HD-A1B2C3D4"                 → "HD-A1B2C3D4"
  raw = "BB|torah-sheet|projectId=...|cellId=A1"       → raw (no sku key) → caller decides
  raw = "1234567890128"                                → "1234567890128" (raw EAN)
```

Caller (sales selector) plugs the result into the existing inventory
search filter. No DB hit specific to scanning.

## Permissions / privacy

- Uses `navigator.mediaDevices.getUserMedia` with
  `video: { facingMode: { ideal: "environment" } }`.
- `NotAllowedError` shows a Hebrew message asking the user to enable camera
  in browser settings; nothing else happens.
- Stream is stopped on first successful decode and on component unmount.
- No frames are persisted, uploaded, or logged.

## Files added / changed

| File | Why |
| --- | --- |
| `components/scanner/BarcodeScanner.tsx` | New reusable scanner component. |
| `app/sales/SalesClient.tsx` | Wired scanner button beside `inventorySearch` Input. Lazy import. Helper `extractScannedToken`. |
| `package.json` / `package-lock.json` | Added `@zxing/browser`. |
| `docs/BARCODE_SCANNER_POC.md` | This document. |

No migrations. No changes to label rendering, SKU generation, or any
server action.

## Next use cases (not implemented)

Same `BarcodeScanner` component plus a per-flow `onDecoded` handler:

1. **Scan QA bag out** — open scanner from
   `app/torah/[id]/TorahDetailClient.tsx` QA-batch list; on QR `kind='qa-batch'`,
   pre-fill the "החזר/הוצא שקית" dialog with `batchId`. No auto-state-change.
2. **Scan QA bag returned** — same surface, action button = "סמן כחזרה";
   user still confirms.
3. **Scan Torah sheet received** — from `quick-entry` or sheet detail; QR
   `kind='torah-sheet'` payload includes `cellId` so the row pre-selects.
4. **Scan inventory sold** — from `/sales` (current entry) or from a
   future `/inventory` search box.

Each follow-up will reuse `extractScannedToken` (extended with new kind
keys) and the same scanner component.

## Validation

```
npm test            ✅ 258 passed
npm run build       ✅ Turbopack production build
npm run list:surfaces ✅ no new orphan surfaces
```

(see PR description for the actual run output)

## Confirmations

- ✅ No DB migrations.
- ✅ No mutation of existing barcode rendering.
- ✅ Manual search untouched — scanner fills the same input.
- ✅ POC is a single entry point.
- ✅ Library is maintained (`@zxing/browser` 0.2.0, last release tracked).
