"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";

export type DealerEmailRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  city: string | null;
  community: string | null;
  emailStatus: "valid" | "no_email" | "unsubscribed";
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function bulkAddTagsToDealers(
  ids: string[],
  tagsToAdd: string[]
): Promise<{ success: true; updated: number } | { success: false; error: string }> {
  if (!ids.length || !tagsToAdd.length) return { success: true, updated: 0 };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "יש להתחבר" };

  const cleanTags = tagsToAdd.map((t) => t.trim()).filter(Boolean);
  if (!cleanTags.length) return { success: true, updated: 0 };

  const { data: current, error: fErr } = await supabase
    .from("crm_contacts")
    .select("id, tags")
    .in("id", ids)
    .eq("user_id", user.id);

  if (fErr) return { success: false, error: fErr.message };

  let updated = 0;
  for (const contact of current ?? []) {
    const existing = (contact.tags ?? []) as string[];
    const merged = [...new Set([...existing, ...cleanTags])];
    const { error: uErr } = await supabase
      .from("crm_contacts")
      .update({ tags: merged, updated_at: new Date().toISOString() })
      .eq("id", contact.id)
      .eq("user_id", user.id);
    if (!uErr) updated++;
  }

  revalidatePath("/crm");
  revalidatePath("/crm/dealers");
  return { success: true, updated };
}

export async function bulkRemoveTagFromDealers(
  ids: string[],
  tagToRemove: string
): Promise<{ success: true; updated: number } | { success: false; error: string }> {
  if (!ids.length || !tagToRemove.trim()) return { success: true, updated: 0 };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "יש להתחבר" };

  const { data: current, error: fErr } = await supabase
    .from("crm_contacts")
    .select("id, tags")
    .in("id", ids)
    .eq("user_id", user.id);

  if (fErr) return { success: false, error: fErr.message };

  let updated = 0;
  const tag = tagToRemove.trim();
  for (const contact of current ?? []) {
    const existing = (contact.tags ?? []) as string[];
    const filtered = existing.filter((t) => t !== tag);
    const { error: uErr } = await supabase
      .from("crm_contacts")
      .update({ tags: filtered, updated_at: new Date().toISOString() })
      .eq("id", contact.id)
      .eq("user_id", user.id);
    if (!uErr) updated++;
  }

  revalidatePath("/crm");
  revalidatePath("/crm/dealers");
  return { success: true, updated };
}

/** Determines email status for a contact email address. Used by page.tsx. */
export function classifyEmail(
  email: string | null | undefined,
  unsubSet: Set<string>
): DealerEmailRow["emailStatus"] {
  const e = email?.trim();
  if (!e || !EMAIL_RE.test(e)) return "no_email";
  if (unsubSet.has(e.toLowerCase())) return "unsubscribed";
  return "valid";
}
