# Branch Cleanup And Rescue Plan

This is a planning document only.

No branches were deleted. No PRs were merged. No app code was edited. No Supabase command was run.

## Scope

- Repository: `https://github.com/twe0234-cell/CURSOR-BOT`
- Canonical local repo: `C:\Dev\CURSOR-BOT`
- Baseline used for reachability: `origin/main`
- Data sources: `git branch -r --merged origin/main`, `git branch -r --no-merged origin/main`, `gh pr list --state all`, and local inventory notes.

## Category Summary

| Category | Count | Meaning |
|---|---:|---|
| `MERGED_SAFE_TO_DELETE_LATER` | 25 | Branch head is reachable from `origin/main` or has a merged PR. Delete only after user approval. |
| `OPEN_PR_ACTIVE` | 4 | Open non-draft PRs that still need review or merge decision. |
| `DOCS_DRAFT_KEEP` | 3 | Draft/spec PR branches to keep until roadmap decision. |
| `CODE_PR_REVIEW` | 5 | Code/value branches without safe-delete evidence; review before any action. |
| `RESCUE_REQUIRED` | 6 | May contain useful local or remote work; rescue into clean PRs or snapshots. |
| `DANGEROUS_DO_NOT_TOUCH` | 3 | Production/main or high-risk bulk branch; do not delete or merge during cleanup. |
| `UNKNOWN_REVIEW_REQUIRED` | 1 | Insufficient context; inspect in isolated worktree first. |

## MERGED_SAFE_TO_DELETE_LATER

Only delete these later after explicit user approval.

| Branch | Evidence | Notes |
|---|---|---|
| `claude/analyze-business-structure-RZImz` | commit `ad082a8` reachable from `origin/main` | no open PR found |
| `claude/audit-and-fix-sync-YMbhe` | commit `6c65c85` reachable from `origin/main` | no open PR found |
| `claude/audit-finance-tracker-m8BeU` | commit `b5b7938` reachable from `origin/main` | no open PR found |
| `claude/code-review-audit-LdjBC` | commit `89d05fd` reachable from `origin/main` | no open PR found |
| `claude/connect-vscode-backend-9oEfU` | commit `71ce6a5` reachable from `origin/main` | no open PR found |
| `claude/review-code-feedback-HzuR9` | commit `4cab8af` reachable from `origin/main` | no open PR found |
| `claude/review-whatsapp-bugs-RZahw` | commit `9d4ac04` reachable from `origin/main` | no open PR found |
| `claude/upgrade-to-alpha-1-QNL0O` | commit `797491f` reachable from `origin/main` | no open PR found |
| `codex/brand-motion-ui-polish` | PR `#8` merged, merge commit `9fe9de3` | safe later |
| `codex/contact-intelligence-claude-audit` | PR `#14` merged, merge commit `ab16606` | safe later |
| `codex/erp-dashboard-productization` | PR `#9` merged, merge commit `ccbe43b` | safe later |
| `codex/finalize-claude-erp-waves` | PR `#2` merged, merge commit `c09e2d2` | safe later |
| `codex/fix-erp-dashboard-missing-torah-snapshot` | PR `#35` merged, merge commit `c5cfca6` | safe later |
| `codex/go-live-communications-stabilization` | PR `#19` merged, merge commit `148d342` | safe later |
| `codex/go-live-final-hardening` | PR `#22` merged, merge commit `b7103db` | priority candidate checked; no rescue needed unless local notes disagree |
| `codex/supabase-migration-history-alignment` | PR `#12` merged, merge commit `f3f6724` | priority candidate checked; no rescue needed unless local notes disagree |
| `codex/torah-configurable-workflow-first-pass` | PR `#23` merged, merge commit `6e4e10f` | safe later |
| `codex/torah-financial-dashboard-source` | PR `#10` merged, merge commit `009fe66` | safe later |
| `codex/torah-project-workflow-productization` | PR `#16` merged, merge commit `b40e139` | safe later |
| `cursor/barcode-camera-scan-poc` | PR `#38` merged, merge commit `8b7d91b` | safe later |
| `cursor/brand-polish-second-pass` | PR `#11` merged, merge commit `04fa78e` | safe later |
| `cursor/contact-business-activity-panel` | PR `#42` merged, merge commit `cb283c4` | safe later |
| `cursor/go-live-operational-ux-fixes` | PR `#25` merged, merge commit `c5976a5` | safe later |
| `cursor/mediation-commission-receipt-flow` | PR `#26` merged, merge commit `719d069` | safe later |
| `cursor/development-environment-setup-2f08` | PR `#1` merged, merge commit `ad52145` | remote branch not currently listed, but PR evidence exists |

## OPEN_PR_ACTIVE

| Branch | PR | Recommended action |
|---|---|---|
| `docs/paperclip-governance-bootstrap` | `#49` Add PaperclipAI governance and local development inventory | This is the current governance PR. Review and merge first when checks pass. |
| `codex/paperclip-governance-bootstrap` | `#46` Bootstrap PaperclipAI governance and local repo inventory | Superseded by `#49`; close later after `#49` is accepted. |
| `cursor/whatsapp-broadcast-history-replay` | `#45` Add WhatsApp broadcast replay helpers and spec | Review as code/spec PR after governance lands. |
| `codex/torah-listing-search-plan` | `#43` Add Torah listing search and intake signal parser | Review as code/spec PR after production-status audit. |

## DOCS_DRAFT_KEEP

| Branch | PR | Recommended action |
|---|---|---|
| `codex/tasks-reminders-calendar-sync-spec` | draft PR `#44` | Keep as roadmap/spec until P2 scheduling work is approved. |
| `codex/trader-gallery-checkout-spec` | draft PR `#39` | Keep as P3 roadmap/spec. |
| `codex/torah-listing-intelligence-plan` | draft PR `#37` | Keep as P3 intelligence roadmap/spec. |

## CODE_PR_REVIEW

These are not safe-delete candidates yet.

| Branch | Why review | Recommended action |
|---|---|---|
| `cursor/barcode-inventory-lookup-go-live` | no PR found; diff includes barcode navigation and sales action changes | inspect in clean worktree; likely create focused PR if still valuable |
| `cursor/inventory-product-share-ai-image` | no PR found; diff includes share-draft API and inventory share helpers | inspect and extract a small PR if still desired |
| `cursor/niimbot-b1-web-bluetooth-poc` | no PR found; diff includes NIIMBOT debug page and Web Bluetooth docs | likely create draft PR snapshot for NIIMBOT POC |
| `cursor/sales-ui-density-go-live` | no PR found; diff includes sales UI density changes | inspect against current sales UI before rescue |
| `codex/verify-broadcast-cron-setup` | no PR found; diff includes `docs/BROADCAST_CRON_SETUP.md` plus older app churn | cherry-pick docs only or create draft PR snapshot |

## RESCUE_REQUIRED

| Branch or workspace | Why it may contain value | Recommended action |
|---|---|---|
| `claude/local-stabilization-snapshot` | large stabilization diff includes Torah QA, CRM, sales, and report docs; also removes many already-current docs | inspect in isolated worktree; cherry-pick only confirmed improvements into new small PRs |
| `cursor/contact-business-activity-panel-legacy-20260429` | legacy copy of contact business panel work; PR `#42` is already merged but this branch may contain stray details | compare with current `main`; ignore unless a missing detail is found |
| dirty `broadcast-buddy` local workspace | local status shows many uncommitted app changes plus migrations `073` and `074` | do not commit as-is; create rescue inventory, then split into safe PRs or discard by explicit approval only |
| `post-merge-main-verification` local worktree | local status shows NIIMBOT print-label additions and `docs/NIIMBOT_PRINTING_FEASIBILITY.md` | create draft PR snapshot or cherry-pick doc plus the 9 lines of UI changes after review |
| `claude/torah-intake-landing` | branch is not merged and has no PR in the current list | inspect in clean worktree; create draft PR only if product value remains |
| `cursor/brand-motion-ui-polish` | closed draft PR `#7`, while similar Codex PR `#8` was merged | compare against `main`; likely ignore, but verify before deletion |

## DANGEROUS_DO_NOT_TOUCH

| Branch or target | Reason |
|---|---|
| `main` / `origin/main` | production source of truth; no direct edits or cleanup actions |
| `claude/fix-whatsapp-emoji-issues-OICS4` | enormous diff touches app code, generated Android/build files, finance-tracker, migrations, and many deletions; inspect only in isolated rescue context |
| `claude/merge-whatsapp-contacts-XpUu4` | branch name implies contact merge work, which is explicitly high-risk; do not merge or run without a dedicated review |

## UNKNOWN_REVIEW_REQUIRED

| Branch | Why unknown | Recommended action |
|---|---|---|
| `claude/car-assistant-setup-DOYjW` | not merged, no PR found, likely unrelated or experimental | inspect branch metadata only; probably archive later |

## Recommended Cleanup Order

1. Merge or close governance PRs first: keep `#49`, then close superseded `#46`.
2. Review active PRs `#45` and `#43` one at a time.
3. Convert draft specs `#44`, `#39`, and `#37` into roadmap decisions.
4. Create rescue snapshots for NIIMBOT, barcode, sales density, and dirty local workspace if still valuable.
5. Only after rescue decisions, ask for explicit approval to delete safe merged branches.
