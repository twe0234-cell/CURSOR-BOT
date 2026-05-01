# Branches Requiring Desktop Review

These 18 branches were NOT deleted in the 2026-05-01 phone session.
Each contains unmerged app code, UI changes, or DB migrations.
Action required: desktop session with dev server + npm test.

## HIGH — Contains DB Migrations (do not merge without migration plan)

### claude/local-stabilization-snapshot
- Tip: `95c6cd49`
- Last commit: "Snapshot local stabilization work for review" (2026-04-29)
- Contains: unreviewed stabilization work captured after main diverged
- Action: `git diff origin/main...origin/claude/local-stabilization-snapshot --stat`

### claude/torah-intake-landing
- Tip: `59af5649`
- Last commit: "feat(intake): public Torah/Tefillin/Mezuzah intake landing page" (2026-04-19)
- Contains: migration `073_torah_intake_submissions.sql` + auth/form flows
- Age: 11 days behind main tip — may have conflicts
- Action: rebase check + migration review before merge

### claude/upgrade-to-alpha-1-QNL0O
- Tip: `797491f3`
- Last commit: "feat(market): Kanban pipeline board + market_stage column" (2026-04-04)
- Contains: migration `058` (market_stage column) + new Kanban UI
- Age: 26 days behind main tip — HIGH conflict risk
- Action: check if market_stage is already in main schema before merge

## MEDIUM — Unmerged App Features (need visual/functional testing)

### cursor/contact-business-activity-panel-legacy-20260429
- Tip: `4c5466d3`
- Last commit: "Add contact business activity panel with explicit link coverage" (2026-04-27)
- Contains: earlier variant of business activity panel (merged version is 325db1b6)
- Action: compare diff vs merged version — likely discard

### codex/go-live-final-hardening
- Tip: `ac1ab4a9`
- Last commit: "Go-live UX hardening for numeric fields font and labels" (2026-04-28 12:58)
- Contains: UI hardening — similar work merged at 2026-04-28 13:07 (b7103db4)
- Action: diff vs main — likely already superseded

### claude/fix-whatsapp-emoji-issues-OICS4
- Tip: `161430a3`
- Last commit: "fix: email module audit + market notes/timezone fixes"
- Contains: WhatsApp emoji + email + market fixes
- Action: cherry-pick valuable fixes after review

### claude/review-whatsapp-bugs-RZahw
- Tip: `9d4ac045`
- Last commit: "fix: WhatsApp infinite loop + broadcast bugs + Kanban + merge contacts + email receipts"
- Contains: potentially valuable bug fixes (WhatsApp infinite loop is critical)
- Action: HIGH PRIORITY review — WhatsApp infinite loop fix may not be in main

### cursor/barcode-inventory-lookup-go-live
- Tip: `03bfbbc4`
- Last commit: "Improve barcode-first inventory lookup for sales"
- Action: test with barcode scanner before merge

### cursor/sales-ui-density-go-live
- Tip: `55eb5253`
- Last commit: "Increase sales page density and usable width for go-live"
- Action: visual review on desktop browser

### cursor/inventory-product-share-ai-image
- Tip: `9724fc92`
- Last commit: "Improve inventory product sharing with AI copy and image prefill"
- Action: test share flow before merge

## LOW — Peripheral / Side Projects

### claude/car-assistant-setup-DOYjW
- Tip: `ef4f7d20`
- Last commit: "feat(bt-bridge): caller ID display + UDP broadcast to unit 17 (v1.2)"
- Note: bt-contacts-bridge sub-project — NOT main app. Separate concern.
- Action: decide if bt-contacts-bridge is still active

### claude/connect-vscode-backend-9oEfU
- Tip: `71ce6a5f`
- Last commit: "feat(market): add stage/pipeline UI — badges, inline changer, stats bar, filter"
- Action: check if market stage UI is already in main

### claude/merge-whatsapp-contacts-XpUu4
- Tip: `65e1da23`
- Last commit: "feat: add merge_whatsapp.py — Green API contacts merge script"
- Note: Python utility script. Check if needed.

### claude/review-code-feedback-HzuR9
- Tip: `4cab8afe`
- Last commit: "visual: rebrand login page to navy/gold + add Claude skills & MCP docs"
- Action: check if login rebrand is already in main

### codex/paperclip-governance-bootstrap
- Tip: `76eb8466` (created 2026-04-30 18:35 — AFTER main tip)
- Last commit: "Document current Paperclip agent runtime status"
- Note: governance docs — may contain useful content to merge
- Action: read content and cherry-pick to main docs if unique

### cursor/brand-motion-ui-polish
- Tip: `8b14b7c0`
- Last commit: "Fix brand motion build font fallback"
- Action: visual review — check if font issue is in production

### cursor/niimbot-b1-web-bluetooth-poc
- Tip: `58a580f6`
- Last commit: "Add NIIMBOT B1 Web Bluetooth POC route"
- Note: POC — requires physical printer for testing
- Action: keep for now, review when printer available

### cursor/whatsapp-broadcast-history-replay (HOLD — verify squash merge)
- Tip: `0ae84099` — possibly squash-merged (main has identical content at 1c8c9b14)
- Action: verify before final deletion — `git diff origin/main...origin/cursor/whatsapp-broadcast-history-replay`

## Suggested Desktop Session Order

1. claude/review-whatsapp-bugs-RZahw — potentially critical WhatsApp fix
2. codex/go-live-final-hardening — likely superseded, quick to verify
3. cursor/contact-business-activity-panel-legacy-20260429 — likely discard
4. claude/upgrade-to-alpha-1-QNL0O — check migration 058 vs current schema
5. claude/torah-intake-landing — new feature + migration, needs careful review
6. All others
