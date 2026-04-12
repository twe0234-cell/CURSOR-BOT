"use server";

import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { getAccessToken } from "@/src/lib/gmail";
import { logInfo, logError } from "@/lib/logger";
import { revalidatePath } from "next/cache";

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function buildMimeMessage(
  to: string,
  subject: string,
  htmlBody: string,
  fromEmail: string,
  fromName: string,
  attachments: { filename: string; content: Buffer }[]
): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const fromHeader = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

  let mime = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(htmlBody, "utf8").toString("base64"),
  ].join("\r\n");

  for (const att of attachments) {
    mime += [
      "",
      `--${boundary}`,
      `Content-Type: application/octet-stream; name="${att.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "",
      att.content.toString("base64"),
    ].join("\r\n");
  }

  mime += `\r\n--${boundary}--`;
  return mime;
}

/**
 * עוטף את גוף המייל ב-RTL div, מוסיף לינק הסרת מנוי ופיקסל מעקב.
 * unsubscribeUrl חובה — מובטח ע"י חוק (GDPR/CAN-SPAM).
 */
const HTML_WRAPPER = (body: string, trackingPixelUrl: string, unsubscribeUrl: string) =>
  `<div style="direction:rtl;text-align:right;max-width:600px;margin:auto;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#222;">
${body}
<hr style="margin:24px 0;border:none;border-top:1px solid #eee;">
<p style="font-size:11px;color:#aaa;text-align:center;margin:0;">
  <a href="${unsubscribeUrl}" style="color:#aaa;text-decoration:underline;">הסר מנוי</a>
</p>
<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />
</div>`;

export type SendGmailCampaignResult =
  | { success: true; sent: number; failed: number; campaignId: string }
  | { success: false; error: string };

export type CampaignStat = {
  id: string;
  subject: string;
  created_at: string;
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
  open_count: number;
  mobile_count: number;
  desktop_count: number;
  tablet_count: number;
};

export async function sendGmailCampaignAction(
  subject: string,
  htmlBody: string,
  recipientIds: string[],
  attachments?: { filename: string; contentBase64: string }[]
): Promise<SendGmailCampaignResult> {
  if (!recipientIds.length) return { success: false, error: "בחר נמענים" };
  if (!subject.trim()) return { success: false, error: "הזן נושא" };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    // ── שליפת הגדרות: Gmail + שם עסק + חתימה ────────────────────────────
    const [{ data: settings }, { data: sysSettings }] = await Promise.all([
      supabase
        .from("user_settings")
        .select("gmail_refresh_token, gmail_email, business_name")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("sys_settings")
        .select("email_signature")
        .eq("id", "default")
        .single(),
    ]);

    if (!settings?.gmail_refresh_token) {
      return { success: false, error: "חבר Gmail בהגדרות" };
    }

    const accessToken = await getAccessToken(settings.gmail_refresh_token);
    const fromEmail = settings.gmail_email ?? "";
    if (!fromEmail) return { success: false, error: "כתובת Gmail חסרה בהגדרות" };

    // שם השולח מגיע מהגדרות העסק — לא מקודד בדיסק
    const fromName = (settings?.business_name as string | null)?.trim() || "הידור הסת״ם";

    const signature = sysSettings?.email_signature ?? "";
    const signatureHtml = signature
      ? `<div dir="rtl" style="margin-top:24px;border-top:1px solid #eee;padding-top:16px;font-size:14px;color:#555;">${signature}</div>`
      : "";

    // ── שליפת נמענים פעילים ──────────────────────────────────────────────
    const { data: contacts } = await supabase
      .from("email_contacts")
      .select("id, email, name")
      .eq("user_id", user.id)
      .eq("subscribed", true)
      .in("id", recipientIds);

    const toSend = (contacts ?? []).filter((c) => c?.email).map((c) => ({
      id: c.id,
      email: c.email!,
      name: c.name ?? "",
    }));

    if (toSend.length === 0) {
      return { success: false, error: "לא נמצאו נמענים פעילים" };
    }

    // ── יצירת רשומת קמפיין ───────────────────────────────────────────────
    const { data: campaign, error: campaignErr } = await supabase
      .from("email_campaigns")
      .insert({
        user_id: user.id,
        subject,
        body_html: htmlBody,
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (campaignErr || !campaign) {
      logError("EmailCampaign", "Failed to create campaign", { error: campaignErr?.message });
      return { success: false, error: "שגיאה ביצירת קמפיין" };
    }

    const campaignId = campaign.id as string;

    // ── פרה-יצירת email_log לכל נמען (לפני השליחה) ──────────────────────
    const adminSupabase = createAdminClient();
    const logRows = toSend.map((c) => ({
      campaign_id: campaignId,
      contact_id: c.id,
      status: "sent",
    }));

    const { data: insertedLogs } = adminSupabase
      ? await adminSupabase.from("email_logs").insert(logRows).select("id, contact_id")
      : { data: null };

    // מיפוי contact_id → log_id לבניית URL-ים מדויקים לכל נמען
    const logIdMap = new Map<string, string>(
      (insertedLogs ?? []).map((l: { id: string; contact_id: string }) => [l.contact_id, l.id])
    );

    const attBuffers = (attachments ?? []).map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.contentBase64, "base64"),
    }));

    let sent = 0;
    let failed = 0;

    // ── לולאת שליחה ──────────────────────────────────────────────────────
    for (const c of toSend) {
      const logId = logIdMap.get(c.id) ?? "";
      const trackingPixelUrl = logId
        ? `${APP_URL}/api/email/track/${logId}`
        : `${APP_URL}/api/email/track/noop`;
      const unsubscribeUrl = logId
        ? `${APP_URL}/api/email/unsubscribe/${logId}`
        : "#";

      const subj = subject.replace(/\{\{name\}\}/g, c.name);
      const bodyWithName = (htmlBody || "<p></p>").replace(/\{\{name\}\}/g, c.name);
      const fullBody = HTML_WRAPPER(bodyWithName + signatureHtml, trackingPixelUrl, unsubscribeUrl);

      const mime = buildMimeMessage(c.email, subj, fullBody, fromEmail, fromName, attBuffers);
      const raw = Buffer.from(mime, "utf8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      try {
        const res = await fetch(GMAIL_SEND_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
        });

        if (res.ok) {
          sent++;
          logInfo("EmailCampaign", "Email sent", { to: c.email, campaignId });
        } else {
          failed++;
          const errText = await res.text();
          logError("EmailCampaign", "Send failed", { to: c.email, error: errText });
          if (logId && adminSupabase) {
            await adminSupabase.from("email_logs").update({ status: "failed" } as never).eq("id", logId);
          }
        }
      } catch (err) {
        failed++;
        logError("EmailCampaign", "Send error", { to: c.email, error: String(err) });
        if (logId && adminSupabase) {
          await adminSupabase.from("email_logs").update({ status: "failed" } as never).eq("id", logId);
        }
      }

      // השהיה בין שליחות למניעת throttling
      await new Promise((r) => setTimeout(r, 800));
    }

    // ── עדכון סטטיסטיקות קמפיין ─────────────────────────────────────────
    await supabase
      .from("email_campaigns")
      .update({ sent_count: sent, failed_count: failed })
      .eq("id", campaignId);

    logInfo("EmailCampaign", "Campaign completed", { userId: user.id, sent, failed, campaignId });
    revalidatePath("/email");
    revalidatePath("/email/campaigns");
    return { success: true, sent, failed, campaignId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "שגיאה בשליחה",
    };
  }
}

/**
 * שליפת היסטוריית קמפיינים עם סטטיסטיקות פתיחות ומכשירים.
 * שאילתה אחת batch לכל ה-logs במקום N+1 לכל קמפיין.
 */
export async function fetchCampaignStats(): Promise<
  { success: true; campaigns: CampaignStat[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: campaigns, error } = await supabase
      .from("email_campaigns")
      .select("id, subject, created_at, sent_at, sent_count, failed_count")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return { success: false, error: error.message };

    const campaignList = campaigns ?? [];
    const campaignIds = campaignList.map((c) => c.id as string);

    // ── שאילתת batch אחת לכל ה-logs (במקום N+1) ─────────────────────────
    const openCounts = new Map<string, number>();
    const mobileCounts = new Map<string, number>();
    const desktopCounts = new Map<string, number>();
    const tabletCounts = new Map<string, number>();

    const adminSupa = createAdminClient();
    if (adminSupa && campaignIds.length > 0) {
      const { data: allLogs } = await adminSupa
        .from("email_logs")
        .select("campaign_id, status, device_type")
        .in("campaign_id", campaignIds);

      for (const l of allLogs ?? []) {
        const cid = l.campaign_id as string;
        if (l.status === "open")          openCounts.set(cid, (openCounts.get(cid) ?? 0) + 1);
        if (l.device_type === "mobile")   mobileCounts.set(cid, (mobileCounts.get(cid) ?? 0) + 1);
        if (l.device_type === "desktop") desktopCounts.set(cid, (desktopCounts.get(cid) ?? 0) + 1);
        if (l.device_type === "tablet")   tabletCounts.set(cid, (tabletCounts.get(cid) ?? 0) + 1);
      }
    }

    const enriched: CampaignStat[] = campaignList.map((c) => ({
      id: c.id,
      subject: c.subject,
      created_at: c.created_at,
      sent_at: c.sent_at ?? null,
      sent_count: c.sent_count ?? 0,
      failed_count: c.failed_count ?? 0,
      open_count: openCounts.get(c.id) ?? 0,
      mobile_count: mobileCounts.get(c.id) ?? 0,
      desktop_count: desktopCounts.get(c.id) ?? 0,
      tablet_count: tabletCounts.get(c.id) ?? 0,
    }));

    return { success: true, campaigns: enriched };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
