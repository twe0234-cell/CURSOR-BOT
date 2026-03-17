"use server";

import { createClient } from "@/src/lib/supabase/server";
import { getAccessToken } from "@/src/lib/gmail";
import { logInfo, logError } from "@/lib/logger";
import { revalidatePath } from "next/cache";

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

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

const HTML_WRAPPER = (body: string) =>
  `<div style="direction: rtl; text-align: right; max-width: 600px; margin: auto; font-family: sans-serif; font-size: 16px;">${body}</div>`;

export type SendGmailCampaignResult =
  | { success: true; sent: number; failed: number }
  | { success: false; error: string };

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
      ? `<div dir="rtl" style="margin-top:24px;border-top:1px solid #eee;padding-top:16px;">${signature}</div>`
      : "";

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

    const attBuffers = (attachments ?? []).map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.contentBase64, "base64"),
    }));

    let sent = 0;
    let failed = 0;

    for (const c of toSend) {
      const subj = subject.replace(/\{\{name\}\}/g, c.name);
      const body = HTML_WRAPPER(
        (htmlBody || "<p></p>").replace(/\{\{name\}\}/g, c.name) + signatureHtml
      );

      const mime = buildMimeMessage(
        c.email,
        subj,
        body,
        fromEmail,
        "Broadcast Buddy",
        attBuffers
      );

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
          logInfo("EmailCampaign", "Email sent", { to: c.email, userId: user.id });
        } else {
          failed++;
          const errText = await res.text();
          logError("EmailCampaign", "Send failed", { to: c.email, error: errText });
        }
      } catch (err) {
        failed++;
        logError("EmailCampaign", "Send error", { to: c.email, error: String(err) });
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    logInfo("EmailCampaign", "Campaign completed", {
      userId: user.id,
      sent,
      failed,
      total: toSend.length,
    });

    revalidatePath("/email");
    revalidatePath("/email/campaigns");
    return { success: true, sent, failed };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "שגיאה בשליחה",
    };
  }
}
