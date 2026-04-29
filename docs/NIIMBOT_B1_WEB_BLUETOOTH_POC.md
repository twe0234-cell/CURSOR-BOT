# NIIMBOT B1 Web Bluetooth POC

Branch: `cursor/niimbot-b1-web-bluetooth-poc`

## Goal

Isolated, client-only proof-of-concept for NIIMBOT B1 printing using Web Bluetooth and `@mmote/niimbluelib`, without changing existing print flows.

## Existing print audit

Checked:

- `components/inventory/BarcodePrint.tsx`
- `components/labels/LabelCode.tsx`
- `components/torah/QaBatchLabel.tsx`
- `components/torah/TorahSheetRollLabel.tsx`
- `app/torah/[id]/print-labels/page.tsx`
- `app/torah/[id]/print-batch/[batchId]/page.tsx`

Findings:

- Current flows render HTML/SVG labels and use browser/OS print dialog.
- No existing direct BLE communication with NIIMBOT.
- POC can be safely added as a separate debug route without regression risk to current buttons.

## Dependency

- Added: `@mmote/niimbluelib@0.0.1-alpha.38`
- Installed with exact pin (`npm install -E`) as recommended by the library.

## Browser support matrix

- Android Chrome: expected yes (Web Bluetooth supported)
- Windows Chrome: expected yes
- Windows Edge: expected yes
- iOS Safari: no (Web Bluetooth unsupported)

## B1 target specs

- Print head width: `384px`
- DPI: `203`
- POC canvas output: black/white test label in width `384px`

## POC route

- Route: `/debug/niimbot`
- Client-only behavior:
  - show browser support status
  - render 384px test label preview
  - `התחבר למדפסת` button (manual connect only)
  - `הדפס בדיקה` button
  - `ייצא PNG` + download fallback

No server-side BLE calls are used.

## How to test on Windows

1. Open app in Chrome or Edge.
2. Navigate to `/debug/niimbot`.
3. Turn printer on and ensure Bluetooth is enabled.
4. Click `התחבר למדפסת`.
5. Choose NIIMBOT device in browser picker.
6. Click `הדפס בדיקה`.
7. If print fails, click `ייצא PNG` and download for manual print fallback.

## How to test on Android

1. Open app in Android Chrome (HTTPS context).
2. Go to `/debug/niimbot`.
3. Tap `התחבר למדפסת`, pick NIIMBOT device.
4. Tap `הדפס בדיקה`.
5. Use `ייצא PNG` if direct print fails.

## Known risks

- Windows pairing conflicts (OS paired state can block/interrupt browser BLE session).
- Alpha library API changes/regressions are possible.
- BLE chunking/timing can fail intermittently on some adapters/devices.
- iOS Safari unsupported for Web Bluetooth.

## Fallback plan

1. Export 384px PNG for manual print path.
2. If Web Bluetooth remains unreliable in production environments:
   - evaluate a local bridge approach later with `niimblue-node` (out of current scope).

## Out of scope (confirmed)

- No replacement of current production print buttons.
- No DB changes.
- No migrations.
- No native app changes.
- No local bridge implementation in this PR.
