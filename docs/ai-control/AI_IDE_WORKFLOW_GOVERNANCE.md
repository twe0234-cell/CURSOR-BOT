# AI IDE Workflow Governance

PaperclipAI is the orchestrator, not an uncontrolled coder.

Core policy:

- GitHub `twe0234-cell/CURSOR-BOT` is the source of truth.
- Production follows `main`.
- Every code task starts from a clean worktree based on `origin/main`.
- Every code task gets one branch, one owner, and one worktree.
- Every code task ends in a pull request.
- No PR means the task is not done.
- Docs and research tasks may be draft PRs.
- Production deployments or DB changes require explicit user approval.

PaperclipAI may coordinate Cursor, Codex, Claude, and Gemini, but it must keep ownership clear and avoid simultaneous edits to the same files.

Task lifecycle:

1. Intake task and classify as code, docs, audit, research, DB, or deployment.
2. Check current active work and machine load.
3. Create or select a clean worktree from `origin/main`.
4. Assign one owner agent.
5. Record path, branch, upstream, HEAD, status, and expected files.
6. Run only necessary checks.
7. Produce a PR or a draft PR.
8. Report tests, build, migrations, DB status, changed files, and next action.

If any safety precondition fails, stop and report.
