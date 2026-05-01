# Local Repo Inventory

Scope: only the user-approved paths were scanned.

- `C:\Users\T590\פיתוחי AI ועוד- כללי`
- `C:\Users\T590\Documents\Codex`
- `C:\Dev`

No cleanup, reset, delete, merge, stash-pop, or app feature edit was performed during inventory.

## Findings Summary

- Canonical local anchor: `C:\Dev\CURSOR-BOT`
- GitHub source-of-truth repo: `https://github.com/twe0234-cell/CURSOR-BOT.git`
- Same GitHub repo appears in three major local working copies:
  - `C:\Dev\CURSOR-BOT`
  - `C:\Users\T590\פיתוחי AI ועוד- כללי\CURSOR-BOT`
  - `C:\Users\T590\פיתוחי AI ועוד- כללי\broadcast-buddy`
- One active dirty Codex worktree exists:
  - `C:\Users\T590\Documents\Codex\2026-04-26\post-merge-main-verification`
- Multiple copied or broken worktree directories exist and should not be used as task bases.
- Tool/plugin repos also exist under `.claude`, `.codex`, `.cursor`, and `.supabase`; most are unrelated to CURSOR-BOT feature development.

## Repo / Worktree Table

| Classification | Clean | CURSOR-BOT | Branch | HEAD | Upstream | Path | Origin | Notes |
|---|---:|---:|---|---|---|---|---|---|
| `SOURCE_OF_TRUTH_CANDIDATE` | No | Yes | `codex/paperclip-governance-bootstrap` | `011a2c3` | `(none)` | `C:\Dev\CURSOR-BOT` | `https://github.com/twe0234-cell/CURSOR-BOT.git` | Canonical local anchor in preferred location. |
| `DIRTY_UNCOMMITTED` | No | Yes | `main` | `011a2c3` | `origin/main` | `C:\Users\T590\פיתוחי AI ועוד- כללי\CURSOR-BOT` | `https://github.com/twe0234-cell/CURSOR-BOT.git` | Duplicate local copy with untracked agent files and prunable worktree registry. |
| `DIRTY_UNCOMMITTED` | No | Yes | `main` | `9cc294f` | `origin/main` | `C:\Users\T590\פיתוחי AI ועוד- כללי\broadcast-buddy` | `https://github.com/twe0234-cell/CURSOR-BOT.git` | Dirty duplicate local copy with many app and migration changes. |
| `DIRTY_UNCOMMITTED` | No | Yes | `codex/niimbot-printing-feasibility` | `719d069` | `(none)` | `C:\Users\T590\Documents\Codex\2026-04-26\post-merge-main-verification` | `https://github.com/twe0234-cell/CURSOR-BOT.git` | Active dirty Codex worktree. |
| `STALE_COPY` | Yes | Yes | `claude/analyze-business-structure-RZImz` | `ad082a8` | `(unavailable)` | `C:\Users\T590\Documents\Codex\2026-04-24-erp-crm-next-js-16-supabase` | `indirect via broadcast-buddy worktree registry` | Copied worktree dir; local `.git` points to missing `C:\Users\T590\Documents\broadcast-buddy`. |
| `STALE_COPY` | Yes | Yes | `codex/finalize-claude-erp-waves` | `9b69a29` | `(unavailable)` | `C:\Users\T590\Documents\Codex\cursor-bot-finalize-claude-erp-waves` | `indirect via broadcast-buddy worktree registry` | Copied worktree dir; local `.git` points to missing `C:\Users\T590\Documents\broadcast-buddy`. |
| `STALE_COPY` | Yes | Yes | `cursor/contact-business-activity-panel` | `325db1b` | `(unavailable)` | `C:\Users\T590\Documents\Codex\cursor-contact-business-activity-panel` | `indirect via broadcast-buddy worktree registry` | Copied worktree dir; local `.git` points to missing `C:\Users\T590\Documents\broadcast-buddy`. |
| `STALE_COPY` | Yes | Yes | `cursor/barcode-inventory-lookup-go-live` | `03bfbbc` | `(unavailable)` | `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\barcode-inventory-lookup-go-live` | `indirect via CURSOR-BOT worktree registry` | Copied worktree dir; local `.git` points to missing `C:\Users\T590\CURSOR-BOT`. |
| `STALE_COPY` | Yes | Yes | `cursor/go-live-operational-ux-fixes` | `27d4687` | `(unavailable)` | `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\go-live-operational-ux-fixes` | `indirect via CURSOR-BOT worktree registry` | Copied worktree dir; local `.git` points to missing `C:\Users\T590\CURSOR-BOT`. |
| `STALE_COPY` | Yes | Yes | `cursor/inventory-product-share-ai-image` | `9724fc9` | `(unavailable)` | `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\inventory-product-share-ai-image` | `indirect via CURSOR-BOT worktree registry` | Copied worktree dir; local `.git` points to missing `C:\Users\T590\CURSOR-BOT`. |
| `STALE_COPY` | Yes | Yes | `cursor/mediation-commission-receipt-flow` | `122ebe9` | `(unavailable)` | `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\mediation-commission-receipt-flow` | `indirect via CURSOR-BOT worktree registry` | Copied worktree dir; local `.git` points to missing `C:\Users\T590\CURSOR-BOT`. |
| `STALE_COPY` | Yes | Yes | `cursor/niimbot-b1-web-bluetooth-poc` | `58a580f` | `(unavailable)` | `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\niimbot-b1-web-bluetooth-poc` | `indirect via CURSOR-BOT worktree registry` | Copied worktree dir; local `.git` points to missing `C:\Users\T590\CURSOR-BOT`. |
| `STALE_COPY` | Yes | Yes | `cursor/sales-ui-density-go-live` | `55eb525` | `(unavailable)` | `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\sales-ui-density-go-live` | `indirect via CURSOR-BOT worktree registry` | Copied worktree dir; local `.git` points to missing `C:\Users\T590\CURSOR-BOT`. |
| `STALE_COPY` | Yes | Yes | `codex/trader-gallery-checkout-spec` | `63e05f2` | `(unavailable)` | `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\trader-gallery-checkout-spec` | `indirect via CURSOR-BOT worktree registry` | Copied worktree dir; local `.git` points to missing `C:\Users\T590\CURSOR-BOT`. |
| `STALE_COPY` | Yes | Yes | `codex/verify-broadcast-cron-setup` | `d38a297` | `(unavailable)` | `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\verify-broadcast-cron-setup` | `indirect via CURSOR-BOT worktree registry` | Copied worktree dir; local `.git` points to missing `C:\Users\T590\CURSOR-BOT`. |
| `DRAFT_DOCS` | No | No | `crm-service-refactor` | `(invalid)` | `(none)` | `C:\Users\T590\פיתוחי AI ועוד- כללי\.cursor` | `(none)` | Local Cursor metadata repo with untracked plans/plugins/projects. |
| `UNRELATED` | No | No | `(detached)` | `3d9d9cd` | `(none)` | `C:\Users\T590\פיתוחי AI ועוד- כללי\.cursor\plugins\cache\cursor-public\vercel\3d9d9cd0fe5d1bdaedb891135a5c45f19190b83f` | `https://github.com/vercel/vercel-plugin` | Cached Cursor plugin repo. |
| `UNRELATED` | No | No | `main` | `0326cac` | `origin/main` | `C:\Users\T590\פיתוחי AI ועוד- כללי\.supabase\Projects\bt-contacts-bridge` | `https://github.com/twe0234-cell/bt-contacts-bridge.git` | Separate project; dirty due local docs/logs. |
| `UNRELATED` | Yes | No | `main` | `84cc3c1` | `origin/main` | `C:\Users\T590\פיתוחי AI ועוד- כללי\.claude\plugins\marketplaces\caveman` | `https://github.com/JuliusBrussee/caveman.git` | Claude plugin marketplace repo. |
| `UNRELATED` | Yes | No | `main` | `7a71d56` | `origin/main` | `C:\Users\T590\פיתוחי AI ועוד- כללי\.codex\.tmp\plugins` | `https://github.com/openai/plugins.git` | Codex temporary plugin repo. |
| `UNRELATED` | Yes | No | `main` | `84cc3c1` | `origin/main` | `C:\Users\T590\פיתוחי AI ועוד- כללי\.codex\plugins\caveman-repo` | `https://github.com/JuliusBrussee/caveman.git` | Codex plugin vendor repo. |
| `UNRELATED` | Yes | No | `main` | `fb7b56d` | `origin/main` | `C:\Users\T590\פיתוחי AI ועוד- כללי\.codex\vendor_imports\skills` | `https://github.com/openai/skills.git` | Vendor-imported skill library. |
| `STALE_COPY` | Yes | No | `master` | `(invalid)` | `(none)` | `C:\Users\T590\פיתוחי AI ועוד- כללי\New project` | `(none)` | Placeholder repo-like folder with invalid HEAD. |

## Details

### C:\Dev\CURSOR-BOT

- Classification: `SOURCE_OF_TRUTH_CANDIDATE`
- Origin remote URL: `https://github.com/twe0234-cell/CURSOR-BOT.git`
- Current branch: `codex/paperclip-governance-bootstrap`
- HEAD SHA: `011a2c31df35104f8e60bb4eb9a0bf1fdd90b07f`
- Upstream branch: `(none configured)`
- `git status --short`:

```text
?? docs/ai-control/
```

- `git diff --stat`:

```text
(none; current changes are untracked docs)
```

- `git worktree list`:

```text
C:/DEV/CURSOR-BOT 011a2c3 [codex/paperclip-governance-bootstrap]
```

- Points to `twe0234-cell/CURSOR-BOT`: `yes`
- Appears old/duplicate/unrelated: `no`
- Clean or dirty: `dirty because bootstrap docs are untracked`

### C:\Users\T590\פיתוחי AI ועוד- כללי\CURSOR-BOT

- Classification: `DIRTY_UNCOMMITTED`
- Origin remote URL: `https://github.com/twe0234-cell/CURSOR-BOT.git`
- Current branch: `main`
- HEAD SHA: `011a2c31df35104f8e60bb4eb9a0bf1fdd90b07f`
- Upstream branch: `origin/main`
- `git status --short`:

```text
?? .agents/
?? skills-lock.json
```

- `git diff --stat`:

```text
(none)
```

- `git worktree list`:

```text
C:/Users/T590/פיתוחי AI ועוד- כללי/CURSOR-BOT 011a2c3 [main]
C:/Users/T590/AppData/Local/Temp/intake-feature 59af564 [claude/torah-intake-landing] prunable
C:/Users/T590/Documents/CursorWorktrees/barcode-inventory-lookup-go-live 03bfbbc [cursor/barcode-inventory-lookup-go-live] prunable
C:/Users/T590/Documents/CursorWorktrees/go-live-operational-ux-fixes 27d4687 [cursor/go-live-operational-ux-fixes] prunable
C:/Users/T590/Documents/CursorWorktrees/inventory-product-share-ai-image 9724fc9 [cursor/inventory-product-share-ai-image] prunable
C:/Users/T590/Documents/CursorWorktrees/mediation-commission-receipt-flow 122ebe9 [cursor/mediation-commission-receipt-flow] prunable
C:/Users/T590/Documents/CursorWorktrees/niimbot-b1-web-bluetooth-poc 58a580f [cursor/niimbot-b1-web-bluetooth-poc] prunable
C:/Users/T590/Documents/CursorWorktrees/sales-ui-density-go-live 55eb525 [cursor/sales-ui-density-go-live] prunable
C:/Users/T590/Documents/CursorWorktrees/trader-gallery-checkout-spec 63e05f2 [codex/trader-gallery-checkout-spec] prunable
C:/Users/T590/Documents/CursorWorktrees/verify-broadcast-cron-setup d38a297 [codex/verify-broadcast-cron-setup] prunable
```

- Points to `twe0234-cell/CURSOR-BOT`: `yes`
- Appears old/duplicate/unrelated: `duplicate local copy, not the preferred anchor`
- Clean or dirty: `dirty`

### C:\Users\T590\פיתוחי AI ועוד- כללי\broadcast-buddy

- Classification: `DIRTY_UNCOMMITTED`
- Origin remote URL: `https://github.com/twe0234-cell/CURSOR-BOT.git`
- Current branch: `main`
- HEAD SHA: `9cc294f16690ba1ebaee613e8a74be4fe3bc8487`
- Upstream branch: `origin/main`
- `git status --short`:

```text
 M app/actions/scribe.ts
 M app/api/cron/process-broadcasts/route.ts
 M app/broadcast/BroadcastClient.tsx
 M app/crm/[id]/page.tsx
 M app/crm/actions.ts
 M app/crm/page.tsx
 M app/inventory/InventoryClient.tsx
 M app/investments/InvestmentsClient.tsx
 M app/market/actions.ts
 M app/sales/SalesClient.tsx
 M app/sales/actions.ts
 M app/soferim/actions.ts
 M app/whatsapp/BroadcastTab.tsx
 M components/payments/PaymentModal.tsx
 M lib/broadcast/imageFile.ts
 M lib/inventory/sku.ts
 M lib/validations/marketTorah.ts
 M lib/whatsapp/greenApi.ts
 M supabase/migrations/029_erp_payments_and_sales_commission.sql
 M supabase/migrations/035_soferim_and_market_torah.sql
?? START_HERE.md
?? dev-logs/
?? src/services/torah.productivity.test.ts
?? src/services/torah.productivity.ts
?? supabase/migrations/073_torah_qa_unique_constraints.sql
?? supabase/migrations/074_torah_qa_finalize_atomic.sql
```

- `git diff --stat`:

```text
(none captured from unstaged diff; many modified files exist per status)
```

- `git worktree list`:

```text
C:/Users/T590/פיתוחי AI ועוד- כללי/broadcast-buddy 9cc294f [main]
C:/Users/T590/Documents/Codex/2026-04-24-erp-crm-next-js-16-supabase ad082a8 [claude/analyze-business-structure-RZImz]
C:/Users/T590/Documents/Codex/cursor-bot-finalize-claude-erp-waves 9b69a29 [codex/finalize-claude-erp-waves]
C:/Users/T590/Documents/Codex/cursor-contact-business-activity-panel 325db1b [cursor/contact-business-activity-panel]
```

- Points to `twe0234-cell/CURSOR-BOT`: `yes`
- Appears old/duplicate/unrelated: `duplicate local copy with substantial uncommitted work`
- Clean or dirty: `dirty`

### C:\Users\T590\Documents\Codex\2026-04-26\post-merge-main-verification

- Classification: `DIRTY_UNCOMMITTED`
- Origin remote URL: `https://github.com/twe0234-cell/CURSOR-BOT.git`
- Current branch: `codex/niimbot-printing-feasibility`
- HEAD SHA: `719d0693aa0f5cfe56f3ed8f2e4bd3b74115a824`
- Upstream branch: `(none configured)`
- `git status --short`:

```text
 M app/torah/[id]/print-batch/[batchId]/PrintBatchClient.tsx
 M app/torah/[id]/print-labels/PrintTorahRollClient.tsx
 M components/inventory/BarcodePrint.tsx
?? docs/NIIMBOT_PRINTING_FEASIBILITY.md
```

- `git diff --stat`:

```text
 app/torah/[id]/print-batch/[batchId]/PrintBatchClient.tsx | 3 +++
 app/torah/[id]/print-labels/PrintTorahRollClient.tsx      | 3 +++
 components/inventory/BarcodePrint.tsx                     | 3 +++
 3 files changed, 9 insertions(+)
```

- `git worktree list`:

```text
C:/Users/T590/Documents/Codex/2026-04-26/post-merge-main-verification 719d069 [codex/niimbot-printing-feasibility]
```

- Points to `twe0234-cell/CURSOR-BOT`: `yes`
- Appears old/duplicate/unrelated: `active worktree, not canonical`
- Clean or dirty: `dirty`

### Broken or copied worktree directories

The following directories have `.git` pointer files but do not behave like healthy standalone working copies. They should be treated as `STALE_COPY` until rebuilt from a clean canonical worktree:

- `C:\Users\T590\Documents\Codex\2026-04-24-erp-crm-next-js-16-supabase`
  - Registered branch/SHA from parent repo: `claude/analyze-business-structure-RZImz` / `ad082a8`
  - Local `.git` points to missing `C:\Users\T590\Documents\broadcast-buddy`
- `C:\Users\T590\Documents\Codex\cursor-bot-finalize-claude-erp-waves`
  - Registered branch/SHA from parent repo: `codex/finalize-claude-erp-waves` / `9b69a29`
  - Local `.git` points to missing `C:\Users\T590\Documents\broadcast-buddy`
- `C:\Users\T590\Documents\Codex\cursor-contact-business-activity-panel`
  - Registered branch/SHA from parent repo: `cursor/contact-business-activity-panel` / `325db1b`
  - Local `.git` points to missing `C:\Users\T590\Documents\broadcast-buddy`
- `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\barcode-inventory-lookup-go-live`
  - Registered branch/SHA from parent repo: `cursor/barcode-inventory-lookup-go-live` / `03bfbbc`
  - Local `.git` points to missing `C:\Users\T590\CURSOR-BOT`
- `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\go-live-operational-ux-fixes`
  - Registered branch/SHA from parent repo: `cursor/go-live-operational-ux-fixes` / `27d4687`
  - Local `.git` points to missing `C:\Users\T590\CURSOR-BOT`
- `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\inventory-product-share-ai-image`
  - Registered branch/SHA from parent repo: `cursor/inventory-product-share-ai-image` / `9724fc9`
  - Local `.git` points to missing `C:\Users\T590\CURSOR-BOT`
- `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\mediation-commission-receipt-flow`
  - Registered branch/SHA from parent repo: `cursor/mediation-commission-receipt-flow` / `122ebe9`
  - Local `.git` points to missing `C:\Users\T590\CURSOR-BOT`
- `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\niimbot-b1-web-bluetooth-poc`
  - Registered branch/SHA from parent repo: `cursor/niimbot-b1-web-bluetooth-poc` / `58a580f`
  - Local `.git` points to missing `C:\Users\T590\CURSOR-BOT`
- `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\sales-ui-density-go-live`
  - Registered branch/SHA from parent repo: `cursor/sales-ui-density-go-live` / `55eb525`
  - Local `.git` points to missing `C:\Users\T590\CURSOR-BOT`
- `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\trader-gallery-checkout-spec`
  - Registered branch/SHA from parent repo: `codex/trader-gallery-checkout-spec` / `63e05f2`
  - Local `.git` points to missing `C:\Users\T590\CURSOR-BOT`
- `C:\Users\T590\פיתוחי AI ועוד- כללי\CursorWorktrees\verify-broadcast-cron-setup`
  - Registered branch/SHA from parent repo: `codex/verify-broadcast-cron-setup` / `d38a297`
  - Local `.git` points to missing `C:\Users\T590\CURSOR-BOT`

For all broken copies above:

- Origin remote URL: `indirect CURSOR-BOT or broadcast-buddy parent registry`
- Upstream branch: `(unavailable from copied dir)`
- `git status --short`: `(unavailable; copied dir does not resolve as healthy worktree)`
- `git diff --stat`: `(unavailable)`
- `git worktree list`: `(unavailable from copied dir; use parent registry instead)`
- Clean or dirty: `unknown in practice; do not use`

### Other local Git roots

- `C:\Users\T590\פיתוחי AI ועוד- כללי\.cursor`
  - Classification: `DRAFT_DOCS`
  - Branch: `crm-service-refactor`
  - Status: dirty with untracked `plans/`, `plugins/`, `projects/`, `skills-cursor/`
  - Notes: local Cursor metadata repo, not an app workspace
- `C:\Users\T590\פיתוחי AI ועוד- כללי\.cursor\plugins\cache\cursor-public\vercel\3d9d9cd0fe5d1bdaedb891135a5c45f19190b83f`
  - Classification: `UNRELATED`
  - Origin: `https://github.com/vercel/vercel-plugin`
  - Branch: detached HEAD at `3d9d9cd`
  - Status: `?? .cache-complete`
- `C:\Users\T590\פיתוחי AI ועוד- כללי\.supabase\Projects\bt-contacts-bridge`
  - Classification: `UNRELATED`
  - Origin: `https://github.com/twe0234-cell/bt-contacts-bridge.git`
  - Branch: `main`
  - HEAD: `0326cac`
  - Status: dirty with untracked `START_HERE.md` and `dev-logs/`
- `C:\Users\T590\פיתוחי AI ועוד- כללי\.claude\plugins\marketplaces\caveman`
  - Classification: `UNRELATED`
  - Origin: `https://github.com/JuliusBrussee/caveman.git`
  - Branch: `main`
  - HEAD: `84cc3c1`
- `C:\Users\T590\פיתוחי AI ועוד- כללי\.codex\.tmp\plugins`
  - Classification: `UNRELATED`
  - Origin: `https://github.com/openai/plugins.git`
  - Branch: `main`
  - HEAD: `7a71d56`
- `C:\Users\T590\פיתוחי AI ועוד- כללי\.codex\plugins\caveman-repo`
  - Classification: `UNRELATED`
  - Origin: `https://github.com/JuliusBrussee/caveman.git`
  - Branch: `main`
  - HEAD: `84cc3c1`
- `C:\Users\T590\פיתוחי AI ועוד- כללי\.codex\vendor_imports\skills`
  - Classification: `UNRELATED`
  - Origin: `https://github.com/openai/skills.git`
  - Branch: `main`
  - HEAD: `fb7b56d`
- `C:\Users\T590\פיתוחי AI ועוד- כללי\New project`
  - Classification: `STALE_COPY`
  - Branch: `master`
  - HEAD: `(invalid)`
  - Notes: repo-like placeholder, not a usable workspace

## Recommended Interpretation

- Use `C:\Dev\CURSOR-BOT` as the canonical local anchor.
- Use `C:\Dev\worktrees` for new controlled worktrees.
- Do not start tasks from `broadcast-buddy`, `פיתוחי AI ועוד- כללי\CURSOR-BOT`, or any copied worktree folder.
- Treat copied worktree directories and prunable entries as historical evidence, not execution bases.
