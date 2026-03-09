import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Service role client - bypasses RLS. Use ONLY for server-side routes
 * that need to run without user auth (e.g. track pixel, unsubscribe link).
 * Returns null if key is not configured.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_SECRET;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
