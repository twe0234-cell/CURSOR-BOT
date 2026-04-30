# Paperclip Setup State

This file is the operational summary of the Paperclip setup for Hidur HaSTaM / CURSOR-BOT.

## Canonical Operating Target

- Canonical repo: `C:\Dev\CURSOR-BOT`
- GitHub source of truth: `https://github.com/twe0234-cell/CURSOR-BOT.git`
- Paperclip local UI: `http://localhost:3100`
- Recommended remote phone access: Tailscale

## What Is Primary

- Primary company should be the active company connected to the canonical repo.
- Primary project should point to `C:\Dev\CURSOR-BOT`.
- Onboarding-only entities are historical setup artifacts and should not be used for day-to-day work.

## Where To Put Instructions

Persistent instructions:

- CEO / board operator: [PAPERCLIP_CEO.md](PAPERCLIP_CEO.md)
- Codex builder: [PAPERCLIP_CODEX.md](PAPERCLIP_CODEX.md)
- Gemini researcher: [PAPERCLIP_GEMINI.md](PAPERCLIP_GEMINI.md)
- Governance rules: [AI_IDE_WORKFLOW_GOVERNANCE.md](AI_IDE_WORKFLOW_GOVERNANCE.md)
- Safety rules: [GIT_SAFETY_RULES.md](GIT_SAFETY_RULES.md), [SUPABASE_SAFETY_RULES.md](SUPABASE_SAFETY_RULES.md), [HARD_NO_LIST.md](HARD_NO_LIST.md)

Task-specific instructions:

- Put them in the Paperclip issue title and issue description.
- If the task is complex, link the relevant doc from `docs/ai-control/`.

## Intended Agent Types

- `CEO` or `Coordinator`: queue, approvals, routing, status
- `Codex Builder`: implementation and verification
- `Gemini Researcher`: research only

Do not multiply agents unless there is a clear ownership split.

## Practical Workflow

1. Create or select a task in Paperclip.
2. Write the desired outcome in the issue description.
3. Assign exactly one owner for code work.
4. Work from a clean branch/worktree.
5. End with a PR or an explicit docs-only result.

## Current Setup Goal

Paperclip should be a control tower over the canonical repo, not a second source of truth and not a playground that generates duplicate workspaces.
