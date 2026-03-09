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

export type GreenApiGroup = { chatId: string; name?: string };

export type FetchGroupsResult =
  | { success: true; groups: GreenApiGroup[] }
  | { success: false; error: string };

/** שליפת קבוצות מ-Green API (רק @g.us) שעדיין לא ב-Supabase */
export async function fetchGroupsFromGreenApi(): Promise<FetchGroupsResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר כדי לייבא קבוצות" };
    }

    const creds = await getGreenApiCredentials(user.id);
    if (!creds) {
      return { success: false, error: "הגדר Green API בהגדרות לפני הייבוא" };
    }

    const url = `${GREEN_API_URL}/waInstance${creds.id}/getDialogs/${creds.token}`;
    const res = await fetch(url);

    if (!res.ok) {
      let errMsg = "שגיאת התחברות ל-Green API";
      try {
        const errBody = await res.json();
        if (errBody?.message) errMsg = String(errBody.message);
        else if (errBody?.error) errMsg = String(errBody.error);
      } catch {
        const text = await res.text();
        if (text) errMsg = text.slice(0, 200);
      }
      return { success: false, error: errMsg };
    }

    const data = await res.json();
    const chats = Array.isArray(data) ? data : (data?.dialogs ?? data?.chats ?? []);
    if (!Array.isArray(chats)) {
      return { success: false, error: "תגובת API לא תקינה" };
    }

    const groups = chats.filter((c: { chatId?: string; id?: string; phoneNumber?: number }) => {
      const id = String(c?.chatId ?? c?.id ?? "").trim();
      return id.length > 0 && (id.endsWith("@g.us") || (id.startsWith("-") && id.length > 1));
    });

    const { data: existing } = await supabase
      .from("audience")
      .select("wa_chat_id")
      .eq("user_id", user.id);

    const existingSet = new Set((existing ?? []).map((r) => r?.wa_chat_id ?? "").filter(Boolean));

    const newGroups = groups
      .map((c: { chatId?: string; id?: string; name?: string }) => {
        const chatId = String(c?.chatId ?? c?.id ?? "").trim();
        if (!chatId || existingSet.has(chatId)) return null;
        existingSet.add(chatId);
        return { chatId, name: (c?.name as string) || chatId } as GreenApiGroup;
      })
      .filter((g): g is GreenApiGroup => g !== null);

    return { success: true, groups: newGroups };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}

export async function saveImportedGroups(
  groups: { wa_chat_id: string; name: string }[]
): Promise<ActionResult> {
  if (!Array.isArray(groups) || groups.length === 0) {
    return { success: false, error: "לא נבחרו קבוצות" };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר" };
    }

    const toInsert = groups
      .filter((g) => g?.wa_chat_id)
      .map((g) => ({
        user_id: user.id,
        wa_chat_id: String(g.wa_chat_id).trim(),
        name: (g.name || g.wa_chat_id || "").trim() || String(g.wa_chat_id),
        tags: ["כללי"] as string[],
        active: true,
      }));

    if (toInsert.length === 0) {
      return { success: false, error: "לא נבחרו קבוצות תקינות" };
    }

    const { error } = await supabase.from("audience").insert(toInsert);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/audience");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}

export async function syncAudience(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר כדי לסנכרן" };
    }

    const creds = await getGreenApiCredentials(user.id);
    if (!creds) {
      return { success: false, error: "הגדר Green API בהגדרות לפני הסנכרון" };
    }

    const url = `${GREEN_API_URL}/waInstance${creds.id}/getDialogs/${creds.token}`;
    const res = await fetch(url);

    if (!res.ok) {
      let errMsg = "שגיאת התחברות ל-Green API";
      try {
        const errBody = await res.json();
        if (errBody?.message) errMsg = String(errBody.message);
        else if (errBody?.error) errMsg = String(errBody.error);
      } catch {
        const text = await res.text();
        if (text) errMsg = text.slice(0, 200);
      }
      return { success: false, error: errMsg };
    }

    const data = await res.json();
    const dialogs = Array.isArray(data) ? data : (data?.dialogs ?? data?.chats ?? []);

    if (!Array.isArray(dialogs)) {
      return { success: false, error: "תגובת API לא תקינה" };
    }

    const { data: existing } = await supabase
      .from("audience")
      .select("wa_chat_id, tags")
      .eq("user_id", user.id);

    const existingMap = new Map(
      (existing ?? []).map((r) => [r?.wa_chat_id ?? "", (r?.tags ?? []) as string[]])
    );

    const toUpsert = dialogs
      .filter((c: { chatId?: string; id?: string }) => (c?.chatId ?? c?.id))
      .map((c: { chatId?: string; id?: string; name?: string; contactName?: string }) => {
        const waChatId = String(c.chatId ?? c.id ?? "");
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}

export async function bulkApplyTags(
  recipientIds: string[],
  tagsToAdd: string[]
): Promise<ActionResult> {
  if (!Array.isArray(recipientIds) || recipientIds.length === 0 ||
      !Array.isArray(tagsToAdd) || tagsToAdd.length === 0) {
    return { success: false, error: "בחר נמענים ותגיות" };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר" };
    }

    const validTags = [...new Set(tagsToAdd.filter(Boolean).map((t) => String(t).trim()))];
    if (validTags.length === 0) {
      return { success: false, error: "בחר תגיות תקינות" };
    }

    for (const id of recipientIds) {
      if (!id) continue;
      const { data: row } = await supabase
        .from("audience")
        .select("tags")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      const currentTags = (row?.tags ?? []) as string[];
      const merged = [...new Set([...currentTags, ...validTags])];

      const { error } = await supabase
        .from("audience")
        .update({ tags: merged, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        return { success: false, error: error.message };
      }
    }

    revalidatePath("/audience");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}
