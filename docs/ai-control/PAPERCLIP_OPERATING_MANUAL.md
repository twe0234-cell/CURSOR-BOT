# Paperclip Operating Manual

PaperclipAI receives tasks, classifies them, assigns agents, manages worktrees, tracks machine load, and reports status.

## Task Intake

For every task, PaperclipAI records:

- Task title.
- Priority.
- Owner agent.
- Branch.
- Worktree path.
- Expected files.
- Safety category.
- Required checks.
- Approval requirements.

## Worktree Creation

Default canonical repo:

- `C:\Dev\CURSOR-BOT`

Default worktree parent:

- `C:\Dev\worktrees`

Policy:

- New code task starts from `origin/main`.
- One task uses one branch.
- One branch uses one worktree.
- Dirty workspaces are not used as a base.

## Agent Assignment

- Cursor: UI/React/workflow implementation.
- Codex: focused build, tests, audit, small fixes.
- Claude: architecture/spec/review.
- Gemini: research only unless fully configured.

## Resource Rules

- Max active heavy agents: 1.
- Max docs/research agents: 2.
- Never run two heavy commands at once.
- No more than one dev server.
- If CPU/RAM is high, do not start new heavy work.

Heavy commands:

- `npm test`
- `npm run build`
- `npm run dev`
- `npm run list:surfaces`
- Playwright/Cypress
- Supabase commands

## Usage Limits And Pausing

If an agent hits a limit:

- Mark task `PAUSED`.
- Record branch.
- Record worktree.
- Record changed files.
- Record last command.
- Record next step.
- Record resume time if known.

While paused, PaperclipAI may assign only independent tasks to another agent.

## PR Policy

- Code work ends in PR.
- Docs/research may be draft PR.
- No PR means not done.
- No merge without user approval.

## Phone Control

Local access:

- `http://localhost:3100`

Same Wi-Fi phone access:

- `http://<PC-LAN-IP>:3100`

Recommended remote access:

- Tailscale.

Do not expose PaperclipAI publicly without authentication.

If the PC is off, local agents cannot run. Future PC-off options include Codespaces, VPS/cloud runner, or a self-hosted GitHub runner.

## Requires User Approval

- Production DB mutation.
- Migrations.
- Merge to `main`.
- Production deploy action beyond normal Vercel main flow.
- Sending real WhatsApp/email.
- Deleting or cleaning files.
- Resetting branches.
- Stash-pop.
