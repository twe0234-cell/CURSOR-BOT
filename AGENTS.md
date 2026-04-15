# AGENTS.md

## WORKFLOW RULE (חובה לקרוא)

**NEVER create background, shadow, or feature branches.**
ALL edits, refactors, and feature developments MUST be applied **DIRECTLY to the active `main` branch** unless the user explicitly commands "create a new branch".
Ensure changes are visible in the user's immediate working directory.
After any session-created branch: merge back to main, then delete the branch.

---

## Engineering QA (mandatory)

Read [ENGINEERING_QA_PROTOCOL.md](ENGINEERING_QA_PROTOCOL.md) before financial, workflow, ledger, or webhook work. It defines non-bypassable rules: state safety, financial integrity, atomicity, concurrency, validation, and when to stop and report risk.

### Where each tool picks up repo rules

| כלי | מיקום במאגר / הערה |
|-----|-------------------|
| **Cursor** | [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), [.cursorrules](.cursorrules), [.cursor/rules/engineering-qa-protocol.mdc](.cursor/rules/engineering-qa-protocol.mdc) |
| **OpenAI Codex** | [AGENTS.md](AGENTS.md) (מומלץ רשמית), [CODEX.md](CODEX.md), [.codex/README.md](.codex/README.md); הגדרות גלובליות: `~/.codex/config.toml` |
| **Antigravity** | [ANTIGRAVITY.md](ANTIGRAVITY.md) + אותם מסמכי שורש; נתוני IDE ב־`%APPDATA%\Antigravity\` (לא קוד) |
| **Claude Code** | [CLAUDE.md](CLAUDE.md) כמקור ראשי |

פירוט נתיבים במחשב מקומי: [docs/AI_AGENT_PATHS.md](docs/AI_AGENT_PATHS.md).

---

## Cursor Cloud specific instructions

### Overview

Broadcast Buddy (STaM ERP) is a single Next.js 16 app (App Router, React 19, TypeScript, Tailwind CSS 4) for managing a Judaica business. It uses npm as its package manager (`package-lock.json`). There is no monorepo, Docker, or local database — the app depends entirely on a remote Supabase project for PostgreSQL, Auth, and Storage.

### Environment variables

A `.env.local` file is required. Copy from `.env.example` and fill in Supabase credentials:

- `NEXT_PUBLIC_SUPABASE_URL` — **required** for the app to start
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — **required** for the app to start
- `SUPABASE_SERVICE_ROLE_KEY` — needed for admin-level API routes (track pixel, unsubscribe)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional, for Gmail OAuth email features
- `CRON_SECRET` — optional, for cron endpoint auth
- `DATABASE_URL` — optional, only for migration scripts in `scripts/`

Without valid Supabase credentials the dev server starts but all data/auth calls fail with "Failed to fetch". The login page (`/login`) renders correctly regardless.

### Common commands

See `package.json` scripts. Key ones:

- `npm run dev` — start dev server (port 3000)
- `npm run build` — production build
- `npm run lint` — ESLint (uses flat config via `eslint-config-next`)
- `npm run db:apply-view` — apply sale profit view (requires `DATABASE_URL`)

### Gotchas

- The root layout (`app/layout.tsx`) calls `createClient()` from the server in `generateMetadata()`. It wraps this in try/catch, so missing credentials don't crash the layout. However, most page-level server components call `createClient()` without try/catch and will error if Supabase is unreachable.
- The home page (`/`) redirects to `/login` if not authenticated, but the redirect only runs after a successful Supabase call — with placeholder credentials, visiting `/` will show an error page. Navigate directly to `/login` for testing.
- ESLint has 3 pre-existing errors (`react-hooks/set-state-in-effect`) and 1 warning (`react-hooks/incompatible-library`). These are in the existing codebase and are not regressions.
- All UI text is in Hebrew with RTL layout (`dir="rtl"`).
- Node.js 18+ is required (v22 works fine).
