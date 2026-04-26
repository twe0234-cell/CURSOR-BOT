# Codex Local Setup

This repo is a production ERP/CRM for STaM operations. Keep local setup boring, repeatable, and non-destructive.

## Baseline Commands

Use these checks before stabilization or financial workflow changes:

```powershell
npm install
npm test
npm run typecheck
npm run build
npm run lint
```

`npm run lint` may expose pre-existing React Compiler and ESLint findings. Treat those as baseline unless the current task touches the same files.

## Useful Local Reports

```powershell
npm run test:coverage
npm run audit:migrations
npm run list:surfaces
```

- `test:coverage` runs Vitest with V8 coverage.
- `audit:migrations` scans migration files for risky operations and duplicate numeric prefixes. It does not connect to a database.
- `list:surfaces` lists App Router pages, API routes, server actions, migrations, and tests.

## Database Safety

- Do not run DB reset tools.
- Do not run destructive SQL.
- Prefer additive migrations.
- For live DB work, check counts before and after data-changing migrations.
- Keep `financial_status` as a view-derived value, not a stored column.

## Environment

Required for app and Supabase-backed flows:

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
```

Never edit real secrets as part of routine stabilization. If configuration is missing, report it and ask for relink or restore.
