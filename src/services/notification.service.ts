/**
 * Notifications — Torah / Green API (WhatsApp).
 * Called from server actions or jobs; uses user-scoped Supabase client.
 */

import { createClient } from "@/src/lib/supabase/server";
import { logError, logInfo, logWarn } from "@/lib/logger";
import {
  buildTorahScribeDelayWhatsAppMessage,
  computeTorahScribePace,
  shouldSendTorahScribeDelayAlert,
} from "@/src/services/crm.logic";
import {
  greenApiDispatchSpacingDelayMs,
  interpretGreenApiSendResult,
  normalizeWhatsAppChatId,
} from "@/lib/whatsapp/greenApi";

const GREEN_API_URL = "https://api.green-api.com";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function getGreenCreds(supabase: ServerClient, userId: string) {
  const { data } = await supabase
    .from("user_settings")
    .select("green_api_id, green_api_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.green_api_id || !data?.green_api_token) return null;
  return { id: data.green_api_id as string, token: data.green_api_token as string };
}

export type TorahStatusNotifyResult =
  | { success: true; sent: true }
  | { success: true; sent: false; reason: string }
  | { success: false; error: string };

/**
 * If the scribe is behind pace beyond the alert threshold, sends a WhatsApp via Green API.
 */
export async function sendTorahStatusUpdate(projectId: string): Promise<TorahStatusNotifyResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: row, error: pErr } = await supabase
      .from("torah_projects")
      .select(
        "id, title, scribe_id, start_date, target_date, columns_per_day, user_id"
      )
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr || !row) return { success: false, error: "הפרויקט לא נמצא" };

    const { data: sheetRows, error: sErr } = await supabase
      .from("torah_sheets")
      .select("columns_count, status")
      .eq("project_id", projectId);

    if (sErr) return { success: false, error: sErr.message };

    const sheets = (sheetRows ?? []).map((s) => ({
      columns_count: Number(s.columns_count ?? 4),
      status: String(s.status),
    }));

    const pace = computeTorahScribePace({
      startDate: (row.start_date as string | null) ?? null,
      targetDate: (row.target_date as string | null) ?? null,
      columnsPerDay: Number(row.columns_per_day ?? 0),
      sheets,
    });

    if (pace.status !== "delayed" || !shouldSendTorahScribeDelayAlert(pace.delayDays)) {
      return { success: true, sent: false, reason: "not_delayed_enough" };
    }

    const creds = await getGreenCreds(supabase, user.id);
    if (!creds) {
      return { success: true, sent: false, reason: "green_api_not_configured" };
    }

    const { data: scribe } = await supabase
      .from("crm_contacts")
      .select("name, wa_chat_id")
      .eq("id", row.scribe_id as string)
      .eq("user_id", user.id)
      .maybeSingle();

    const rawChat = (scribe?.wa_chat_id as string | null)?.trim();
    if (!rawChat) {
      return { success: true, sent: false, reason: "scribe_no_whatsapp" };
    }

    const chatId = normalizeWhatsAppChatId(rawChat);
    if (!chatId) {
      return { success: true, sent: false, reason: "invalid_whatsapp_id" };
    }

    const message = buildTorahScribeDelayWhatsAppMessage(
      (scribe?.name as string) ?? "",
      (row.title as string) ?? ""
    );

    await sleep(greenApiDispatchSpacingDelayMs());
    const apiUrl = `${GREEN_API_URL}/waInstance${creds.id}/sendMessage/${creds.token}`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
    const errBody = await res.text();
    const interpreted = interpretGreenApiSendResult(res.ok, errBody);
    if (!interpreted.ok) {
      logWarn("Notification", "Green API send failed for Torah pace alert", {
        projectId,
        error: interpreted.error,
      });
      return { success: false, error: interpreted.error };
    }

    logInfo("Notification", "Torah scribe pace WhatsApp sent", { projectId, chatId });
    return { success: true, sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא צפויה";
    logError("Notification", "sendTorahStatusUpdate failed", { error: String(e) });
    return { success: false, error: msg };
  }
}

function formatShekelsHe(amount: number): string {
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 }).format(amount);
}

/** WhatsApp לסופר — תשלום התקבל (Green API). */
export async function notifyScribePayment(
  scribeId: string,
  amount: number,
  projectId: string
): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      logWarn("Notification", "notifyScribePayment: no user session", { scribeId, projectId });
      return;
    }

    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("name, wa_chat_id")
      .eq("id", scribeId)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: project } = await supabase
      .from("torah_projects")
      .select("title")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    const name = ((contact?.name as string) ?? "").trim() || "שלום";
    const title = ((project?.title as string) ?? "").trim() || "הפרויקט";
    const amountStr = formatShekelsHe(amount);
    const message = `שלום ${name}, התקבל תשלום על סך ${amountStr} ₪ עבור פרויקט ${title}. בהצלחה והמשך עבודה פורייה!`;

    const rawChat = (contact?.wa_chat_id as string | null)?.trim();
    if (!rawChat) {
      logInfo("Notification", "notifyScribePayment: no WhatsApp on contact", { scribeId, projectId });
      return;
    }

    const chatId = normalizeWhatsAppChatId(rawChat);
    if (!chatId) {
      logWarn("Notification", "notifyScribePayment: invalid WhatsApp id", { scribeId });
      return;
    }

    const creds = await getGreenCreds(supabase, user.id);
    if (!creds) {
      logInfo("Notification", "notifyScribePayment: Green API not configured", { projectId });
      return;
    }

    await sleep(greenApiDispatchSpacingDelayMs());
    const apiUrl = `${GREEN_API_URL}/waInstance${creds.id}/sendMessage/${creds.token}`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
    const errBody = await res.text();
    const interpreted = interpretGreenApiSendResult(res.ok, errBody);
    if (!interpreted.ok) {
      logWarn("Notification", "notifyScribePayment: Green API failed", {
        projectId,
        error: interpreted.error,
      });
      return;
    }

    logInfo("Notification", "notifyScribePayment: WhatsApp sent", { projectId, chatId });
  } catch (e) {
    logError("Notification", "notifyScribePayment failed", { error: String(e) });
  }
}

/** כוונת קבלה במייל — שלב Gmail יגיע בהמשך. */
export async function notifyClientPayment(
  clientId: string,
  amount: number,
  projectId: string
): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      logWarn("Notification", "notifyClientPayment: no user session", { clientId, projectId });
      return;
    }

    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("email")
      .eq("id", clientId)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: project } = await supabase
      .from("torah_projects")
      .select("title")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    const title = ((project?.title as string) ?? "").trim() || "—";

    const email = ((contact?.email as string) ?? "").trim();
    if (!email) {
      logInfo("Notification", "notifyClientPayment: no email on contact", { clientId, projectId, title });
      return;
    }

    console.log("Would send email receipt to:", email);

    logInfo("Notification", "notifyClientPayment: receipt intent logged", {
      projectId,
      title,
      amount,
      hasEmail: true,
    });
  } catch (e) {
    logError("Notification", "notifyClientPayment failed", { error: String(e) });
  }
}
