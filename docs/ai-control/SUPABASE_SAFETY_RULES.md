# Supabase Safety Rules

Rules:

- Do not run `supabase db push`.
- Do not run `supabase migration repair`.
- Do not mutate production DB without explicit approval.
- Read-only inspection only unless explicit approval is given.
- Migrations require explicit approval.
- Never print secrets, passwords, service-role keys, tokens, or database URLs.
- Preserve RLS and tenant isolation.
- Treat auth, contacts, communications, payments, ledger, and production data as high risk.

Before any migration:

- Confirm project ref and environment.
- Confirm backup exists and is restorable.
- Confirm migration files and production drift state.
- Confirm approval text from user.
- Record exact commands before running.

Forbidden without approval:

- `DROP TABLE`
- `DROP SCHEMA`
- `TRUNCATE`
- destructive data updates
- production function/trigger changes
- bulk import or merge jobs
