# AI Agent Safety Rules

These rules summarize the local expectations for Codex and other coding agents. They complement `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`, and `ENGINEERING_QA_PROTOCOL.md`.

## Branch And Git

- Work only on the branch requested by the user.
- Do not work on `main` unless the user explicitly asks for it.
- Do not commit until the user has seen the changed-file summary.
- Do not revert unrelated local changes.

## Database And Financial Safety

- Use additive migrations by default.
- Do not run `DROP`, `TRUNCATE`, destructive `DELETE`, DB reset, or force operations without explicit approval.
- Count rows before and after data backfills.
- Do not reimplement profit logic in React or ad hoc UI code.
- Do not edit `crm.logic.ts` or financial service code unless the task explicitly requires it and tests are updated.

## Local Tooling

- Prefer `npm test`, `npm run typecheck`, `npm run build`, and targeted scripts before broad changes.
- Use `npm run audit:migrations` before applying migrations.
- Use `npm run list:surfaces` to orient around routes, API routes, actions, migrations, and tests.

## Secrets And Deployments

- Do not modify `.env.local` secrets.
- Do not create new Vercel or Supabase projects from CLI prompts.
- Do not approve CLI prompts blindly.
- Do not merge or deploy production changes without explicit user approval.
