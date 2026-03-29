/**
 * Resolves external identifiers to an existing `crm_contacts` row for the current user.
 */

import { createClient } from "@/src/lib/supabase/server";
import {
  resolveContactMatch,
  type ContactMatchCandidate,
  type ContactMatchResult,
} from "./contactMatching.logic";

export type { ContactMatchCandidate, ContactMatchResult };

export async function findMatchingContact(
  phone?: string | null,
  email?: string | null,
  name?: string | null
): Promise<ContactMatchResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows, error } = await supabase
    .from("crm_contacts")
    .select("id, phone, email, name, wa_chat_id")
    .eq("user_id", user.id);

  if (error || !rows?.length) return null;

  const candidates: ContactMatchCandidate[] = rows.map((r) => ({
    id: r.id as string,
    phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    name: (r.name as string | null) ?? null,
    wa_chat_id: (r.wa_chat_id as string | null) ?? null,
  }));

  return resolveContactMatch(candidates, phone, email, name);
}
