"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logError, logInfo } from "@/lib/logger";
import { resolveContentType } from "@/lib/upload";
import { greenApiDispatchSpacingDelayMs } from "@/lib/whatsapp/greenApi";
import type { BroadcastLogRow } from "@/src/lib/types/broadcast";

const GREEN_API_URL = "https://api.green-api.com";
const MEDIA_BUCKET = "media";

export type UploadResult =
  | { success: true; url: string }
  | { success: false; error: string };

/** העלאת קובץ ל-Supabase Storage (bucket: media) */
export async function uploadMedia(formData: FormData): Promise<UploadResult> {
  try {
    const raw = formData.get("file");
    if (raw == null || typeof raw !== "object") {
      return { success: false, error: "לא נבחר קובץ" };
    }
    if (!(raw instanceof Blob)) {
      return { success: false, error: "קובץ לא תקין" };
    }
    const blob = raw as Blob;
    if (blob.size > IMAGE_SIZE_LIMIT_BYTES) {
      return { success: false, error: "התמונה חורגת ממגבלת 5MB" };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "יש להתחבר" };
    }

    const name = raw instanceof File && raw.name ? raw.name : "image.jpg";
    const ext = name.split(".").pop() || "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, blob, {
        contentType: resolveContentType(raw as File | Blob),
        upsert: true,
      });

    if (error) {
      logError("Broadcast", "uploadMedia storage error", {
        bucket: MEDIA_BUCKET,
        path,
        message: error.message,
        name: error.name,
      });
      return { success: false, error: error.message };
    }

    const { data: { publicUrl } } = supabase.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(path);

    return { success: true, url: publicUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה בהעלאה";
    logError("Broadcast", "uploadMedia failed", { error: String(err) });
    return { success: false, error: msg };
  }
}

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

/** Extract numeric part from scribe_code (e.g. #125 -> 125, "125" -> 125) */
function extractScribeNumber(code: string | null | undefined): number | null {
  if (!code || typeof code !== "string") return null;
  const trimmed = code.trim();
  const match = trimmed.replace(/^#/, "").match(/^\d+/);
  return match ? parseInt(match[0], 10) : null;
}

/** Query inventory.scribe_code and broadcast_logs.scribe_code, return max+1. Default 121 if none. */
export async function fetchNextScribeNumber(): Promise<
  { success: true; next: number } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const [invRes, logRes] = await Promise.all([
      supabase.from("inventory").select("scribe_code").eq("user_id", user.id),
      supabase.from("broadcast_logs").select("scribe_code").eq("user_id", user.id),
    ]);

    let maxNum = 0;
    const codes = [
      ...(invRes.data ?? []).map((r) => r.scribe_code),
      ...(logRes.data ?? []).map((r) => r.scribe_code),
    ];
    for (const c of codes) {
      const n = extractScribeNumber(c);
      if (n != null && n > maxNum) maxNum = n;
    }
    const next = maxNum > 0 ? maxNum + 1 : 121;
    return { success: true, next };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}

export type SendSingleResult =
  | { success: true }
  | { success: false; error: string };

/** Reject data URLs - images must be uploaded to Supabase first for GreenAPI sendFileByUrl */
function ensurePublicImageUrl(url: string): { ok: true; url: string } | { ok: false; error: string } {
  const u = url.trim();
  if (!u) return { ok: false, error: "חסר קישור" };
  if (u.startsWith("data:")) {
    return { ok: false, error: "יש להעלות תמונה תחילה (לא ניתן לשלוח data URL ישירות)" };
  }
  if (!u.startsWith("http://") && !u.startsWith("https://")) {
    return { ok: false, error: "קישור תמונה לא תקין" };
  }
  return { ok: true, url: u };
}

/** Send a single message to one recipient (used for progress loop) */
export async function sendSingleMessage(
  waChatId: string,
  messageText: string,
  imageUrl?: string,
  scribeCode?: string
): Promise<SendSingleResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const creds = await getGreenApiCredentials(user.id);
    if (!creds) return { success: false, error: "הגדר Green API בהגדרות" };

    let message = messageText;
    if (scribeCode?.trim()) {
      message = message.trimEnd() + "\n\n" + scribeCode.trim();
    }

    if (imageUrl?.trim()) {
      const urlCheck = ensurePublicImageUrl(imageUrl.trim());
      if (!urlCheck.ok) return { success: false, error: urlCheck.error };
      const sizeBytes = await getImageSizeBytes(urlCheck.url);
      if (sizeBytes !== null && sizeBytes > IMAGE_SIZE_LIMIT_BYTES) {
        return { success: false, error: "התמונה חורגת ממגבלת 5MB" };
      }
      const apiUrl = `${GREEN_API_URL}/waInstance${creds.id}/sendFileByUrl/${creds.token}`;
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: waChatId,
          urlFile: urlCheck.url,
          fileName: "image.jpg",
          caption: message,
        }),
      });
      const errBody = await res.text();
      if (!res.ok) return { success: false, error: errBody || "שגיאה לא ידועה" };
    } else {
      const apiUrl = `${GREEN_API_URL}/waInstance${creds.id}/sendMessage/${creds.token}`;
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: waChatId, message }),
      });
      const errBody = await res.text();
      if (!res.ok) return { success: false, error: errBody || "שגיאה לא ידועה" };
    }
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    logError("Broadcast", "sendSingleMessage failed", { error: String(err), waChatId });
    return { success: false, error: msg };
  }
}

export type BroadcastLog = BroadcastLogRow;

function broadcastMessageSnippet(text: string, maxLen = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

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
      .select("id, sent, failed, errors, tags, scribe_code, internal_notes, message_snippet, message_text, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return { success: false, error: error.message };
    const logs = (data ?? []).map((r) => ({
      id: r.id,
      sent: r.sent ?? 0,
      failed: r.failed ?? 0,
      errors: (r.errors ?? []) as string[],
      tags: (r.tags ?? []) as string[],
      scribe_code: r.scribe_code ?? null,
      internal_notes: r.internal_notes ?? null,
      message_snippet: (r as { message_snippet?: string | null }).message_snippet ?? null,
      message_text: (r as { message_text?: string | null }).message_text ?? null,
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

/** Fetch targets by specific wa_chat_ids (e.g. groups) */
export async function fetchTargetsByGroupIds(
  groupIds: string[]
): Promise<{ success: true; targets: BroadcastTarget[] } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר" };
    }

    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return { success: true, targets: [] };
    }

    const ids = groupIds.filter((id) => id && String(id).trim());
    if (ids.length === 0) return { success: true, targets: [] };

    const { data, error } = await supabase
      .from("audience")
      .select("wa_chat_id, name")
      .eq("user_id", user.id)
      .eq("active", true)
      .in("wa_chat_id", ids);

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

    let validatedImageUrl: string | null = null;
    if (imageUrl?.trim()) {
      const urlCheck = ensurePublicImageUrl(imageUrl.trim());
      if (!urlCheck.ok) return { success: false, error: urlCheck.error };
      const sizeBytes = await getImageSizeBytes(urlCheck.url);
      if (sizeBytes !== null && sizeBytes > IMAGE_SIZE_LIMIT_BYTES) {
        return { success: false, error: "התמונה חורגת ממגבלת 5MB" };
      }
      validatedImageUrl = urlCheck.url;
    }

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      try {
        const vars = { Name: target.name ?? "", name: target.name ?? "" };
        let message = replaceVariables(messageText, vars);
        if (scribeCode?.trim()) {
          message = message.trimEnd() + "\n\n" + scribeCode.trim();
        }

        if (validatedImageUrl) {
          const apiUrl = `${GREEN_API_URL}/waInstance${creds.id}/sendFileByUrl/${creds.token}`;
          const res = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chatId: target.wa_chat_id,
              urlFile: validatedImageUrl,
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
        console.error(`Broadcast failed for ${target.wa_chat_id}`, err);
        errors.push(`${target.wa_chat_id}: ${msg}`);
        failed++;
        results.push({ target: target.wa_chat_id, success: false, error: msg });
      }

      if (i < targets.length - 1) {
        await sleep(greenApiDispatchSpacingDelayMs());
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
      message_snippet: broadcastMessageSnippet(messageText),
    });

    revalidatePath("/broadcast");
    logInfo("Broadcast", `Broadcast completed for ${targets.length} contacts`, { sent, failed, userId: user.id });
    return { success: true, sent, failed, results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    logError("Broadcast", "dispatchBroadcast failed", { error: String(err) });
    return { success: false, error: msg };
  }
}

export type InsertLogResult =
  | { success: true }
  | { success: false; error: string };

/** Insert broadcast log after client-side send loop */
export async function insertBroadcastLog(
  sent: number,
  failed: number,
  errors: string[],
  tags: string[],
  scribeCode?: string,
  internalNotes?: string,
  messageTextForSnippet?: string
): Promise<InsertLogResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const snippet =
      messageTextForSnippet != null && messageTextForSnippet.trim()
        ? broadcastMessageSnippet(messageTextForSnippet)
        : null;

    const { error } = await supabase.from("broadcast_logs").insert({
      user_id: user.id,
      sent,
      failed,
      errors: errors.slice(0, 50),
      tags,
      scribe_code: scribeCode?.trim() || null,
      internal_notes: internalNotes?.trim() || null,
      message_snippet: snippet,
      message_text: messageTextForSnippet?.trim() || null,
    });

    if (error) return { success: false, error: error.message };
    revalidatePath("/broadcast");
    revalidatePath("/whatsapp");
    logInfo("Broadcast", "insertBroadcastLog completed", { sent, failed, userId: user.id });
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    logError("Broadcast", "insertBroadcastLog failed", { error: String(err) });
    return { success: false, error: msg };
  }
}

/** Delete a single broadcast log row (by ID, scoped to current user) */
export async function deleteBroadcastLog(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("broadcast_logs")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };
    revalidatePath("/broadcast");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

/** Schedule a future broadcast — inserted into broadcast_queue with scheduled_at */
export async function scheduleBroadcastAction(
  tags: string[],
  groupIds: string[],
  messageText: string,
  imageUrl: string | null,
  scheduledAt: string // ISO string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const tagTargets = tags.length > 0 ? await fetchTargetsByTags(tags) : { success: true as const, targets: [] };
    const groupTargets = groupIds.length > 0 ? await fetchTargetsByGroupIds(groupIds) : { success: true as const, targets: [] };

    if (!tagTargets.success) return { success: false, error: tagTargets.error };
    if (!groupTargets.success) return { success: false, error: groupTargets.error };

    const seen = new Set<string>();
    const targets = [...tagTargets.targets, ...groupTargets.targets].filter((t) => {
      if (seen.has(t.wa_chat_id)) return false;
      seen.add(t.wa_chat_id);
      return true;
    });

    if (targets.length === 0) return { success: false, error: "אין נמענים" };

    const { error } = await supabase.from("broadcast_queue").insert({
      user_id: user.id,
      scheduled_at: scheduledAt,
      payload: {
        targets,
        messageText,
        imageUrl: imageUrl || null,
        tags,
        scribeCode: null,
      },
    });

    if (error) return { success: false, error: error.message };
    revalidatePath("/broadcast");
    logInfo("Broadcast", "Scheduled broadcast queued", {
      userId: user.id,
      scheduledAt,
      targets: targets.length,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
