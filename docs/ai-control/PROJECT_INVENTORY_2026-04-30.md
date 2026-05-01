# Project Inventory 2026-04-30

This inventory captures the local development control state for Hidur HaSTaM / CURSOR-BOT as of 2026-04-30.

## Canonical Repository

- GitHub source of truth: `https://github.com/twe0234-cell/CURSOR-BOT.git`
- Canonical local repo: `C:\Dev\CURSOR-BOT`
- Worktree parent for future tasks: `C:\Dev\worktrees`
- Production follows GitHub `main` through Vercel project `cursor-bot`.

## PaperclipAI Control State

- Paperclip local UI: `http://localhost:3100`
- Remote access path: Tailscale, not public internet exposure
- Active Paperclip company: `Hidur HaSTaM`
- Active Paperclip project: `CURSOR-BOT`
- Active project workspace: `C:\Dev\CURSOR-BOT`

## Current Agent Runtime State

- `CEO`: board operator and task scheduler, currently configured through `codex_local`
- `Codex Builder`: implementation and verification, configured through `codex_local`
- `Gemini Researcher`: research and diagnostics, configured through `gemini_local`
- `Claude`: not active until the local Claude CLI is repaired
- `Cursor`: installed as a desktop IDE/CLI, not connected as a Paperclip agent adapter

## Local Workspace Interpretation

- Use `C:\Dev\CURSOR-BOT` as the only active local anchor.
- Use `C:\Dev\worktrees` for future isolated task worktrees.
- Treat copied folders under `C:\Users\T590\פיתוחי AI ועוד- כללי` as historical evidence unless explicitly rescued.
- Treat broken worktree pointer folders as stale until rebuilt cleanly from the canonical repo.

## Known Dirty / Rescue Areas

- Dirty `broadcast-buddy` local workspace: may contain uncommitted app and migration work. Inspect only through a rescue task.
- `post-merge-main-verification` Codex worktree: may contain NIIMBOT feasibility changes and should be reviewed separately.
- Several remote branches have merged PR evidence and may later be safe to delete, but no branch deletion is authorized in this bootstrap.

## Governance Outcome

This docs set establishes:

- PaperclipAI as orchestrator, not uncontrolled coder
- GitHub `main` as source of truth
- one task = one branch = one worktree = one owner
- code work ends in PR
- Supabase and production operations require explicit approval
- branch cleanup requires evidence and a separate approval step
