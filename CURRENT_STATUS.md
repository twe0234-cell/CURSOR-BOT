# CURRENT STATUS — הידור הסת"ם ERP/CRM

Last updated: 2026-05-01 (phone session via Claude Code)

## Production

| Item | Value |
|------|-------|
| Main tip | `011a2c31` (2026-04-30 10:50) |
| Vercel project | `prj_sfsCBHf5yax7yqzsVSVMdJ2MamGx` |
| Supabase | `wohrvtugrzqhxyeerxal` (ap-northeast-2) |
| Tests | 57 passing (last verified on main) |
| Cron | `/api/cron/process-broadcasts` — daily 00:00 |

## Branch State (post-cleanup 2026-05-01)

| Category | Count | Notes |
|----------|-------|-------|
| main | 1 | Production branch |
| Cleaned up (deleted) | 26 | Merged or docs-only |
| Awaiting desktop review | 18 | See docs/DESKTOP_REVIEW_REQUIRED.md |

## Active Development Areas

| Area | Status |
|------|--------|
| Torah project workflow | In main — configurable workflow live |
| Contact business activity panel | Merged (PR 42) |
| Barcode inventory lookup | Branch pending review |
| WhatsApp broadcast | Core in main; bug-fix branch pending review |
| ERP dashboard | Live |
| Mediation commission receipts | Merged |
| Sales UI density | Branch pending review |

## Known Issues / Pending

- [ ] broadcast-buddy external workspace (`C:\Users\T590\פיתוחי AI ועוד- כללי\broadcast-buddy`) — rescue audit pending (requires local access)
- [ ] claude/review-whatsapp-bugs-RZahw — WhatsApp infinite loop fix may not be in main (HIGH priority desktop review)
- [ ] claude/torah-intake-landing — intake landing page + migration 073 unmerged (11 days old)
- [ ] claude/upgrade-to-alpha-1-QNL0O — Kanban + market_stage migration (26 days old, HIGH conflict risk)
- [ ] 3 known ESLint react-hooks errors (pre-existing, not regressions)

## Governance Docs

| Doc | Status |
|-----|--------|
| CLAUDE.md | Live — source of truth |
| AGENTS.md | Live |
| ARCHITECTURE.md | Live |
| ENGINEERING_QA_PROTOCOL.md | Live |
| CURRENT_STATUS.md | **This file** |
| PAPERCLIP_OPERATING_MANUAL.md | Created 2026-05-01 |
| docs/GOVERNANCE_AUDIT_2026-05-01.md | Created 2026-05-01 |
| docs/BRANCH_CLEANUP_LOG.md | Created 2026-05-01 |
| docs/DESKTOP_REVIEW_REQUIRED.md | Created 2026-05-01 |

## Next Actions (Desktop Session)

1. Run broadcast-buddy rescue audit locally
2. Review `claude/review-whatsapp-bugs-RZahw` — WhatsApp infinite loop (critical)
3. Audit remaining 18 branches per docs/DESKTOP_REVIEW_REQUIRED.md
4. Run `npm test` after any code merges
5. Fix 3 ESLint react-hooks errors (optional cleanup)
