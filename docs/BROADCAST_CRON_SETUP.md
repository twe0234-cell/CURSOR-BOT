# Broadcast Cron Setup Verification

Branch: `codex/verify-broadcast-cron-setup`

## Scope

Verification-only pass for scheduled WhatsApp broadcast processing.
No endpoint execution, no broadcast sending, no secrets exposure.

## Files inspected

- `app/api/cron/process-broadcasts/route.ts`
- `vercel.json`
- `.env.example`
- `docs/GO_LIVE_COMMUNICATIONS_AUDIT.md`

## Current status

### 1) Is Vercel cron configured in repo?

Yes.

`vercel.json` contains:

- path: `/api/cron/process-broadcasts`
- schedule: `0 0 * * *` (once daily at 00:00 UTC)

### 2) Does the route expect `CRON_SECRET`?

Yes, when `CRON_SECRET` is set.

Route auth behavior:

- Reads header `authorization`
- Reads env `CRON_SECRET`
- Compares against: `Authorization: Bearer <CRON_SECRET>`
- Returns `401 Unauthorized` on mismatch

Important nuance:

- If `CRON_SECRET` is empty/missing, the auth check is effectively bypassed.
- For production, `CRON_SECRET` must be set.

### 3) Exact request expected by route

- Method: `GET`
- Path: `/api/cron/process-broadcasts`
- Header required in production:
  - `Authorization: Bearer <CRON_SECRET>`

No request body required.

### 4) Production env vars required for processing

Minimum required for successful processing:

- `CRON_SECRET` (for endpoint auth hardening)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_ROLE_SECRET`, per admin client fallback)

Without Supabase admin envs, route returns `503 Admin client not configured`.

## Operational conclusion

- Repo already has Vercel cron config, but cadence is daily (`0 0 * * *`).
- For near-real-time scheduled sends (e.g. every minute), external scheduler remains necessary unless plan/features change.
- Existing inline comment and `.env.example` both align with external scheduler usage.

## Manual production checks (safe, no triggering)

1. In Vercel project settings, confirm `CRON_SECRET` exists (do not print value).
2. Confirm `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` exist in production env.
3. Confirm external scheduler (if used) is configured to:
   - call `GET https://<prod-domain>/api/cron/process-broadcasts`
   - send header `Authorization: Bearer <CRON_SECRET>`
   - run at required cadence.
4. Confirm `vercel.json` cron entry is present in deployed commit history.

## Changes made in this mission

- Documentation only (`docs/BROADCAST_CRON_SETUP.md`).
- No code-path behavior changes.
