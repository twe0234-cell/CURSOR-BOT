"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

const GREEN_API_URL = "https://api.green-api.com";
const MEDIA_BUCKET = "media";

export type UploadResult =
  | { success: true; url: string }
  | { success: false; error: string };

/** העלאת קובץ ל-Supabase Storage (bucket: media) */
export async function uploadMedia(formData: FormData): Promise<UploadResult> {
  try {
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return { success: false, error: "לא נבחר קובץ" };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "יש להתחבר" };
    }

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });

    if (error) {
      return { success: false, error: error.message };
    }

    const { data: { publicUrl } } = supabase.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(path);

    return { success: true, url: publicUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה בהעלאה";
    return { success: false, error: msg };
  }
}

const DELAY_EVERY_N = 3;
const DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ActionResult =
  | { success: true; sent: number; failed: number; errors: string[] }
  | { success: false; error: string };

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

export type BroadcastTarget = { wa_chat_id: string; name: string | null };

export type BroadcastLog = {
  id: string;
  sent: number;
  failed: number;
  errors: string[];
  tags: string[];
  created_at: string;
};

export async function fetchBroadcastLogs(): Promise<
  { success: true; logs: BroadcastLog[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("broadcast_logs")
      .select("id, sent, failed, errors, tags, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return { success: false, error: error.message };
    const logs = (data ?? []).map((r) => ({
      id: r.id,
      sent: r.sent ?? 0,
      failed: r.failed ?? 0,
      errors: (r.errors ?? []) as string[],
      tags: (r.tags ?? []) as string[],
      created_at: r.created_at ?? "",
    }));
    return { success: true, logs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}

export async function fetchTargetsByTags(
  tags: string[]
): Promise<{ success: true; targets: BroadcastTarget[] } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר" };
    }

    if (!Array.isArray(tags) || tags.length === 0) {
      return { success: false, error: "בחר לפחות תגית אחת" };
    }

    const { data, error } = await supabase
      .from("audience")
      .select("wa_chat_id, name")
      .eq("user_id", user.id)
      .eq("active", true)
      .overlaps("tags", tags);

    if (error) {
      return { success: false, error: error.message };
    }

    const targets = (data ?? [])
      .filter((r) => r?.wa_chat_id)
      .map((r) => ({
        wa_chat_id: String(r.wa_chat_id),
        name: r?.name ?? null,
      }));

    return { success: true, targets };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}

function replaceVariables(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "gi"), value ?? "");
  }
  return result;
}

export async function dispatchBroadcast(
  tags: string[],
  messageText: string,
  imageUrl?: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר" };
    }

    const creds = await getGreenApiCredentials(user.id);
    if (!creds) {
      return { success: false, error: "הגדר Green API בהגדרות" };
    }

    const targetsResult = await fetchTargetsByTags(tags);
    if (!targetsResult.success) {
      return { success: false, error: targetsResult.error };
    }

    const targets = targetsResult.targets;
    if (targets.length === 0) {
      return { success: false, error: "אין נמענים התואמים לתגיות שנבחרו" };
    }

    const errors: string[] = [];
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const vars = { Name: target.name ?? "", name: target.name ?? "" };
      const message = replaceVariables(messageText, vars);

      try {
        if (imageUrl && imageUrl.trim()) {
          const url = `${GREEN_API_URL}/waInstance${creds.id}/sendFileByUrl/${creds.token}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chatId: target.wa_chat_id,
              urlFile: imageUrl.trim(),
              fileName: "image.jpg",
              caption: message,
            }),
          });

          if (!res.ok) {
            const errBody = await res.text();
            errors.push(`${target.wa_chat_id}: ${errBody}`);
            failed++;
          } else {
            sent++;
          }
        } else {
          const url = `${GREEN_API_URL}/waInstance${creds.id}/sendMessage/${creds.token}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chatId: target.wa_chat_id,
              message,
            }),
          });

          if (!res.ok) {
            const errBody = await res.text();
            errors.push(`${target.wa_chat_id}: ${errBody}`);
            failed++;
          } else {
            sent++;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
        errors.push(`${target.wa_chat_id}: ${msg}`);
        failed++;
      }

      if (i < targets.length - 1) {
        const msgIndex = i + 1;
        if (msgIndex % DELAY_EVERY_N === 0) {
          await sleep(DELAY_MS);
        }
      }
    }

    await supabase.from("broadcast_logs").insert({
      user_id: user.id,
      sent,
      failed,
      errors: errors.slice(0, 50),
      tags,
    });

    revalidatePath("/broadcast");
    return { success: true, sent, failed, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}
