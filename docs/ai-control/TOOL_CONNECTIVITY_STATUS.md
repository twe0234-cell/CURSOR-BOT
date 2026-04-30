# Tool Connectivity Status

Checked on `2026-04-30`.

## GitHub CLI

`gh auth status`

- Logged in to `github.com` as `twe0234-cell`
- Git protocol: `https`
- Token scopes observed: `gist`, `read:org`, `repo`, `workflow`

`gh repo view twe0234-cell/CURSOR-BOT`

- Repository reachable: `yes`
- Canonical repository: `https://github.com/twe0234-cell/CURSOR-BOT`
- Default branch: `main`

`gh pr list --repo twe0234-cell/CURSOR-BOT --limit 20 --state all`

Observed open or draft planning PRs:

- `#45` WhatsApp broadcast replay helpers and spec
- `#44` Tasks reminders and calendar sync architecture
- `#43` Torah listing search and intake signal parser
- `#39` Trader gallery and checkout roadmap
- `#37` Smart Torah listing intelligence intake

Observed recent merged PRs relevant to current status:

- `#42` Contact business activity panel
- `#38` Barcode camera scan POC
- `#35` ERP dashboard Torah snapshot fallback
- `#26` Mediation commission receipt flow
- `#25` Go-live operational UX fixes

## Supabase CLI

`supabase --version`

- Not available on PATH in the current shell

`npx supabase --version`

- Available as Supabase CLI `2.96.0`

`npx supabase projects list`

- Failed in read-only check because no `SUPABASE_ACCESS_TOKEN` was available in this shell
- No login, link, mutation, `db push`, or migration repair command was run

Interpretation:

- Supabase CLI is installable/usable through `npx`
- Supabase authentication is not currently active in this shell

## PaperclipAI

Local Paperclip instance currently observed at:

- Data root: `C:\Users\T590\Documents\paperclip-instance-main\instances\default`
- Local UI: `http://localhost:3100`
- Tailscale URL: `http://desktop-03omr6r.tailf7400c.ts.net:3100`
- Deployment mode: authenticated/private

No Paperclip application code was changed in this bootstrap. Only governance docs were prepared.
