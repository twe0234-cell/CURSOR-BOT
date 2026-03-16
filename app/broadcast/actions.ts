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
    if (file.size > IMAGE_SIZE_LIMIT_BYTES) {
      return { success: false, error: "התמונה חורגת ממגבלת 5MB" };
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

const DELAY_MS = 2500;
const IMAGE_SIZE_LIMIT_BYTES = 5 * 1024 * 1024; // 5MB

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type BroadcastResultItem = {
  target: string;
  success: boolean;
  error?: string;
};

type DispatchResult =
  | { success: true; sent: number; failed: number; results: BroadcastResultItem[] }
  | { success: false; error: string };

async function getImageSizeBytes(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const len = res.headers.get("content-length");
    return len ? parseInt(len, 10) : null;
  } catch {
    return null;
  }
}

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
  scribe_code: string | null;
  internal_notes: string | null;
  created_at: string;
  status?: string;
  log_details?: unknown;
};

export type QueueItem = {
  id: string;
  status: string;
  result: { sent?: number; failed?: number; errors?: string[] } | null;
  log_details: unknown;
  created_at: string;
  payload: { tags?: string[] };
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
      .select("id, sent, failed, errors, tags, scribe_code, internal_notes, created_at")
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
      scribe_code: r.scribe_code ?? null,
      internal_notes: r.internal_notes ?? null,
      created_at: r.created_at ?? "",
    }));
    return { success: true, logs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}

export async function fetchBroadcastQueueItems(): Promise<
  { success: true; items: QueueItem[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("broadcast_queue")
      .select("id, status, result, log_details, created_at, payload")
      .eq("user_id", user.id)
      .in("status", ["completed", "failed"])
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) return { success: false, error: error.message };
    const items = (data ?? []).map((r) => ({
      id: r.id,
      status: r.status ?? "unknown",
      result: (r.result ?? null) as QueueItem["result"],
      log_details: r.log_details ?? null,
      created_at: r.created_at ?? "",
      payload: (r.payload ?? {}) as { tags?: string[] },
    }));
    return { success: true, items };
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
  imageUrl?: string,
  scribeCode?: string,
  internalNotes?: string
): Promise<DispatchResult> {
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

    const results: BroadcastResultItem[] = [];
    const errors: string[] = [];
    let sent = 0;
    let failed = 0;

    if (imageUrl?.trim()) {
      const sizeBytes = await getImageSizeBytes(imageUrl.trim());
      if (sizeBytes !== null && sizeBytes > IMAGE_SIZE_LIMIT_BYTES) {
        return { success: false, error: "התמונה חורגת ממגבלת 5MB" };
      }
    }

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const vars = { Name: target.name ?? "", name: target.name ?? "" };
      let message = replaceVariables(messageText, vars);
      if (scribeCode?.trim()) {
        message = message.trimEnd() + "\n\nRef: " + scribeCode.trim();
      }

      try {
        if (imageUrl?.trim()) {
          const apiUrl = `${GREEN_API_URL}/waInstance${creds.id}/sendFileByUrl/${creds.token}`;
          const res = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chatId: target.wa_chat_id,
              urlFile: imageUrl.trim(),
              fileName: "image.jpg",
              caption: message,
            }),
          });

          const errBody = await res.text();
          if (!res.ok) {
            const errMsg = errBody || "שגיאה לא ידועה";
            errors.push(`${target.wa_chat_id}: ${errMsg}`);
            failed++;
            results.push({ target: target.wa_chat_id, success: false, error: errMsg });
          } else {
            sent++;
            results.push({ target: target.wa_chat_id, success: true });
          }
        } else {
          const apiUrl = `${GREEN_API_URL}/waInstance${creds.id}/sendMessage/${creds.token}`;
          const res = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chatId: target.wa_chat_id,
              message,
            }),
          });

          const errBody = await res.text();
          if (!res.ok) {
            const errMsg = errBody || "שגיאה לא ידועה";
            errors.push(`${target.wa_chat_id}: ${errMsg}`);
            failed++;
            results.push({ target: target.wa_chat_id, success: false, error: errMsg });
          } else {
            sent++;
            results.push({ target: target.wa_chat_id, success: true });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
        errors.push(`${target.wa_chat_id}: ${msg}`);
        failed++;
        results.push({ target: target.wa_chat_id, success: false, error: msg });
      }

      if (i < targets.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    await supabase.from("broadcast_logs").insert({
      user_id: user.id,
      sent,
      failed,
      errors: errors.slice(0, 50),
      tags,
      scribe_code: scribeCode?.trim() || null,
      internal_notes: internalNotes?.trim() || null,
    });

    revalidatePath("/broadcast");
    return { success: true, sent, failed, results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}
