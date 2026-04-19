"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { getAccessToken, sendEmail } from "@/src/lib/gmail";
import { TorahIntakeSchema } from "@/src/lib/intake/validation";
import {
  buildOwnerConfirmationEmail,
  buildAdminNotificationEmail,
  type IntakeEmailData,
} from "@/src/lib/intake/emailTemplates";

type SubmitResult =
  | { success: true; submissionId: string }
  | { success: false; error: string };

const RATE_LIMIT_WINDOW_MINUTES = 60;
const RATE_LIMIT_MAX_PER_IP = 3;

export async function submitTorahIntake(payload: unknown): Promise<SubmitResult> {
  const parsed = TorahIntakeSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { success: false, error: first?.message || "פרטים לא תקינים" };
  }
  const data = parsed.data;

  // Optional Turnstile verification. Skipped if env not configured.
  if (process.env.TURNSTILE_SECRET_KEY) {
    const ok = await verifyTurnstile(data.turnstile_token, process.env.TURNSTILE_SECRET_KEY);
    if (!ok) return { success: false, error: "אימות אבטחה נכשל. רענן את הדף ונסה שוב." };
  }

  const admin = createAdminClient();
  if (!admin) return { success: false, error: "שירות לא זמין כרגע" };

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;
  const userAgent = h.get("user-agent") || null;

  // Rate-limit: count recent submissions from same IP.
  if (ip) {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await admin
      .from("erp_torah_intake_submissions")
      .select("*", { count: "exact", head: true })
      .eq("submission_ip", ip)
      .gte("created_at", since);
    if ((count ?? 0) >= RATE_LIMIT_MAX_PER_IP) {
      return { success: false, error: "יותר מדי פניות. נסה שוב בעוד שעה." };
    }
  }

  const { data: inserted, error: insErr } = await admin
    .from("erp_torah_intake_submissions")
    .insert({
      owner_name: data.owner_name,
      owner_phone: data.owner_phone,
      owner_email: data.owner_email,
      owner_city: data.owner_city ?? null,
      sefer_type: data.sefer_type,
      scribe_name: data.scribe_name ?? null,
      age_estimate: data.age_estimate ?? null,
      condition: data.condition ?? null,
      description: data.description ?? null,
      asking_price: data.asking_price ?? null,
      image_paths: data.image_paths ?? [],
      submission_ip: ip,
      user_agent: userAgent,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("[intake] insert failed", insErr);
    return { success: false, error: "שמירת הפנייה נכשלה. אנא נסה שוב." };
  }

  const submissionId = inserted.id as string;

  // Emails are best-effort. If anything fails, the submission still stands;
  // we log and update the DB with the send timestamps when successful.
  const emailPayload: IntakeEmailData = {
    submissionId,
    ownerName: data.owner_name,
    ownerPhone: data.owner_phone,
    ownerEmail: data.owner_email,
    ownerCity: data.owner_city,
    seferType: data.sefer_type,
    scribeName: data.scribe_name,
    ageEstimate: data.age_estimate,
    condition: data.condition,
    description: data.description,
    askingPrice: data.asking_price,
    imageCount: data.image_paths?.length ?? 0,
  };

  await sendEmailsBestEffort(admin, submissionId, emailPayload);

  return { success: true, submissionId };
}

async function verifyTurnstile(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }).toString(),
    });
    const json = await res.json().catch(() => ({}));
    return Boolean(json?.success);
  } catch {
    return false;
  }
}

async function sendEmailsBestEffort(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  submissionId: string,
  payload: IntakeEmailData
) {
  const { data: settingsRows } = await admin
    .from("user_settings")
    .select("gmail_refresh_token, gmail_email")
    .not("gmail_refresh_token", "is", null)
    .limit(1);

  const settings = settingsRows?.[0];
  if (!settings?.gmail_refresh_token || !settings?.gmail_email) {
    console.warn("[intake] no gmail settings configured — skipping emails");
    return;
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(settings.gmail_refresh_token);
  } catch (err) {
    console.error("[intake] failed to get gmail access token", err);
    return;
  }

  const fromEmail = settings.gmail_email;
  const fromName = "הידור הסת״ם";

  // Owner confirmation.
  try {
    const { subject, html } = buildOwnerConfirmationEmail(payload);
    await sendEmail(accessToken, payload.ownerEmail, subject, html, fromEmail, fromName);
    await admin
      .from("erp_torah_intake_submissions")
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq("id", submissionId);
  } catch (err) {
    console.error("[intake] owner confirmation email failed", err);
  }

  // Admin notification (sent to the connected gmail account itself).
  try {
    const { subject, html } = buildAdminNotificationEmail(payload);
    await sendEmail(accessToken, fromEmail, subject, html, fromEmail, fromName);
    await admin
      .from("erp_torah_intake_submissions")
      .update({ admin_notification_sent_at: new Date().toISOString() })
      .eq("id", submissionId);
  } catch (err) {
    console.error("[intake] admin notification email failed", err);
  }
}
