# Hard No List

PaperclipAI and all agents must not:

- Edit `main` directly.
- Run production migrations.
- Run `supabase db push`.
- Run `supabase migration repair`.
- Auto-merge contacts.
- Bulk import contacts.
- Send real WhatsApp or email during tests.
- Expose public inventory by default.
- Run multiple heavy builds/tests in parallel.
- Let two agents edit the same files or feature.
- Claim done without a PR for code work.
- Delete, reset, clean, stash-pop, or overwrite local work without explicit user approval.
- Print secrets, tokens, keys, database URLs, or private customer data.

If an instruction conflicts with this list, stop and ask for explicit approval.
