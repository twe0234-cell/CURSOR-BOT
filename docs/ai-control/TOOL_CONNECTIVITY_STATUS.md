# Tool Connectivity Status

Checked on 2026-04-30.

## GitHub CLI

`gh auth status`:

- Logged in to `github.com` as `twe0234-cell`.
- Git protocol: HTTPS.
- Token scopes observed: `gist`, `read:org`, `repo`, `workflow`.

`gh repo view twe0234-cell/CURSOR-BOT`:

- Repository is reachable.
- Canonical repository: `https://github.com/twe0234-cell/CURSOR-BOT`.
- Default branch: `main`.
- Visibility: public.
- Archived: false.

## Supabase CLI

`supabase --version`:

- Not available on PATH in the current Codex shell.

`npx supabase --version`:

- Available as Supabase CLI `2.96.0`.

`npx supabase projects list`:

- Failed because no Supabase CLI access token was available in this shell.
- No login/link/mutation command was run.

Supabase projects discovered through the Supabase connector during discovery:

- `wohrvtugrzqhxyeerxal` - `קורסור בוט`, active/healthy.
- `ryzedtqhdesdqkhhurxb` - `finance-tracker`, active/healthy.

No Supabase DB mutation was performed.

## Vercel CLI

`vercel whoami`:

- `twe0234-cell`

Projects observed:

- `cursor-bot`
- `finance-tracker`
- `cursor-deploy-cursor-bot`

No deployment was triggered by this bootstrap.

## PaperclipAI

Local Paperclip instance discovered:

- `C:\Users\T590\פיתוחי AI ועוד- כללי\.paperclip\instances\default`

Observed prior config:

- Local server port: `3100`.
- Host: `0.0.0.0`.
- Exposure: private.

No Paperclip runtime configuration was changed by this bootstrap.
