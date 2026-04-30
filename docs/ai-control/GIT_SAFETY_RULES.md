# Git Safety Rules

Rules:

- Never edit `main` directly.
- Never start from a dirty workspace.
- One task equals one branch equals one worktree.
- Branch naming:
  - `cursor/<task>`
  - `codex/<task>`
  - `claude/<task>`
  - `docs/<task>`
- If branch is `main`: STOP.
- If status is dirty before a task: STOP.
- No `git reset`, `git clean`, deletion, or overwrite without explicit user approval.
- No merge without explicit user approval.
- No stash-pop without explicit user approval.
- Every task start must report path, branch, status, upstream, and HEAD.
- Every task finish must report PR, tests, build, migrations, DB status, and final status.

Allowed safe checks:

- `git status -sb`
- `git diff --stat`
- `git branch -vv`
- `git worktree list`
- `git fetch origin`
- `git pull --ff-only origin main` only in a clean canonical/main anchor.

If a workspace contains uncommitted changes from another agent, do not touch it until it is classified.
