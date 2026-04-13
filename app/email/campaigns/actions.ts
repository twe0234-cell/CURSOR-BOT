"use server";

import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { getAccessToken } from "@/src/lib/gmail";
import { logInfo, logError } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import {
  chunkRecipients,
  dedupeRecipients,
  throttleBetweenSends,
  type CampaignRecipient,
} from "@/src/services/emailCampaign.engine";

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

const HTML_WRAPPER = (body: string, trackingPixelUrl: string) =>
  `<div style="direction:rtl;text-align:right;max-width:600px;margin:auto;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#222;">
${body}
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

export async function saveCampaignSignatureAction(
  signature: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("sys_settings")
      .upsert(
        { id: "default", email_signature: signature.trim(), updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    if (error) return { success: false, error: error.message };
    revalidatePath("/email");
    revalidatePath("/email/campaigns");
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

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

    const { data: settings } = await supabase
      .from("user_settings")
      .select("gmail_refresh_token, gmail_email")
      .eq("user_id", user.id)
      .single();

    const { data: sysSettings } = await supabase
      .from("sys_settings")
      .select("email_signature")
      .eq("id", "default")
      .single();

    if (!settings?.gmail_refresh_token) {
      return { success: false, error: "חבר Gmail בהגדרות" };
    }

    const accessToken = await getAccessToken(settings.gmail_refresh_token);
    const fromEmail = settings.gmail_email ?? "noreply@example.com";
    const signature = sysSettings?.email_signature ?? "";
    const signatureHtml = signature
      ? `<div dir="rtl" style="margin-top:24px;border-top:1px solid #eee;padding-top:16px;font-size:14px;color:#555;">${signature}</div>`
      : "";

    const { data: contacts } = await supabase
      .from("email_contacts")
      .select("id, email, name")
      .eq("user_id", user.id)
      .eq("subscribed", true)
      .in("id", recipientIds);

    const rawRecipients: CampaignRecipient[] = (contacts ?? []).filter((c) => c?.email).map((c) => ({
      id: c.id,
      email: c.email!,
      name: c.name ?? "",
    }));
    const toSend = dedupeRecipients(rawRecipients);

    if (toSend.length === 0) {
      return { success: false, error: "לא נמצאו נמענים פעילים" };
    }

    // ── Create campaign record ──────────────────────────────────────────
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

    // ── Pre-create email_log rows (one per recipient) ─────────────────
    const adminSupabase = createAdminClient();
    const logRows = toSend.map((c) => ({
      campaign_id: campaignId,
      contact_id: c.id,
      status: "sent",
    }));

    const { data: insertedLogs } = adminSupabase
      ? await adminSupabase.from("email_logs").insert(logRows).select("id, contact_id")
      : { data: null };

    // Build logId map: contact_id → log_id
    const logIdMap = new Map<string, string>(
      (insertedLogs ?? []).map((l: { id: string; contact_id: string }) => [l.contact_id, l.id])
    );

    const attBuffers = (attachments ?? []).map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.contentBase64, "base64"),
    }));

    let sent = 0;
    let failed = 0;

    const recipientChunks = chunkRecipients(toSend);
    for (const chunk of recipientChunks) {
      for (const c of chunk.items) {
        const logId = logIdMap.get(c.id) ?? "";
        const trackingPixelUrl = logId
          ? `${APP_URL}/api/email/track/${logId}`
          : `${APP_URL}/api/email/track/noop`;

        const subj = subject.replace(/\{\{name\}\}/g, c.name);
        const bodyWithName = (htmlBody || "<p></p>").replace(/\{\{name\}\}/g, c.name);
        const fullBody = HTML_WRAPPER(bodyWithName + signatureHtml, trackingPixelUrl);

        const mime = buildMimeMessage(c.email, subj, fullBody, fromEmail, "הידור הסת״ם", attBuffers);
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
            // Mark log as failed
            if (logId && adminSupabase) {
              await adminSupabase.from("email_logs").update({ status: "failed" } as never).eq("id", logId);
            }
          }
        } catch (err) {
          failed++;
          logError("EmailCampaign", "Send error", { to: c.email, error: String(err) });
        }

        await throttleBetweenSends();
      }
    }

    // Update campaign stats
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

/** Fetch campaign history with open/device stats */
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

    // For each campaign get log aggregates via email_logs
    const adminSupa = createAdminClient();
    const enriched: CampaignStat[] = await Promise.all(
      (campaigns ?? []).map(async (c) => {
        let open_count = 0, mobile_count = 0, desktop_count = 0, tablet_count = 0;
        if (adminSupa) {
          const { data: logs } = await adminSupa
            .from("email_logs")
            .select("status, device_type")
            .eq("campaign_id", c.id);
          for (const l of logs ?? []) {
            if (l.status === "open") open_count++;
            if (l.device_type === "mobile") mobile_count++;
            if (l.device_type === "desktop") desktop_count++;
            if (l.device_type === "tablet") tablet_count++;
          }
        }
        return {
          id: c.id,
          subject: c.subject,
          created_at: c.created_at,
          sent_at: c.sent_at ?? null,
          sent_count: c.sent_count ?? 0,
          failed_count: c.failed_count ?? 0,
          open_count,
          mobile_count,
          desktop_count,
          tablet_count,
        };
      })
    );

    return { success: true, campaigns: enriched };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
