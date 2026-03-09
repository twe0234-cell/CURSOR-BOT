"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

const GREEN_API_URL = "https://api.green-api.com";

type ActionResult = { success: true } | { success: false; error: string };

async function getGreenApiCredentials(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_settings")
    .select("green_api_id, green_api_token")
    .eq("user_id", userId)
    .single();

  if (!data?.green_api_id || !data?.green_api_token) {
    return null;
  }
  return { id: data.green_api_id, token: data.green_api_token };
}

export async function syncAudience(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "יש להתחבר כדי לסנכרן" };
  }

  const creds = await getGreenApiCredentials(user.id);
  if (!creds) {
    return { success: false, error: "הגדר Green API בהגדרות לפני הסנכרון" };
  }

  const url = `${GREEN_API_URL}/waInstance${creds.id}/getContacts/${creds.token}`;
  const res = await fetch(url);

  if (!res.ok) {
    return { success: false, error: "שגיאה בחיבור ל-Green API" };
  }

  const contacts: Array<{ id: string; name?: string; contactName?: string }> =
    await res.json();

  if (!Array.isArray(contacts)) {
    return { success: false, error: "תגובת API לא תקינה" };
  }

  const { data: existing } = await supabase
    .from("audience")
    .select("wa_chat_id, tags")
    .eq("user_id", user.id);

  const existingMap = new Map(
    (existing ?? []).map((r) => [r.wa_chat_id, r.tags ?? []])
  );

  const toUpsert = contacts.map((c) => {
    const waChatId = String(c.id);
    const existingTags = existingMap.get(waChatId) ?? [];
    const displayName = c.name || c.contactName || waChatId;

    return {
      user_id: user.id,
      wa_chat_id: waChatId,
      name: displayName,
      tags: existingTags,
      active: true,
      updated_at: new Date().toISOString(),
    };
  });

  if (toUpsert.length === 0) {
    revalidatePath("/audience");
    return { success: true };
  }

  const { error } = await supabase.from("audience").upsert(toUpsert, {
    onConflict: "user_id,wa_chat_id",
    ignoreDuplicates: false,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/audience");
  return { success: true };
}

export async function bulkApplyTags(
  recipientIds: string[],
  tagsToAdd: string[]
): Promise<ActionResult> {
  if (recipientIds.length === 0 || tagsToAdd.length === 0) {
    return { success: false, error: "בחר נמענים ותגיות" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "יש להתחבר" };
  }

  for (const id of recipientIds) {
    const { data: row } = await supabase
      .from("audience")
      .select("tags")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    const currentTags = (row?.tags ?? []) as string[];
    const merged = [...new Set([...currentTags, ...tagsToAdd])];

    await supabase
      .from("audience")
      .update({ tags: merged, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
  }

  revalidatePath("/audience");
  return { success: true };
}
