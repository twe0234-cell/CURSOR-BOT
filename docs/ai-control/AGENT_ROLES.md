# Agent Roles

## PaperclipAI

PaperclipAI is the queue manager, scheduler, worktree manager, and status reporter.

Responsibilities:

- Maintain task queue and priorities.
- Assign owner agent and branch/worktree.
- Prevent resource overload.
- Track paused work and usage limits.
- Require PRs for code work.
- Report status in a concise operational format.

## Cursor

Cursor is best used for UI, React, app workflow implementation, and iterative frontend fixes.

Use Cursor when a task touches components, routes, user flows, density/layout, forms, and interactive behavior.

## Codex

Codex is best used for focused implementation, tests, repo audit, small fixes, migrations review, and verification.

Use Codex for bounded backend/frontend fixes, test additions, safety audits, and PR preparation.

## Claude

Claude is best used for architecture, spec writing, broad review, and complex reasoning.

Claude may code only inside a clean worktree with a clearly assigned task and no overlap with other agents.

## Gemini

Gemini is research-only unless fully configured and explicitly assigned.

Use Gemini for external research, comparison, discovery, and summarization.
