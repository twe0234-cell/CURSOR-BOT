"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getAccessToken } from "@/src/lib/gmail";

type ActionResult = { success: true } | { success: false; error: string };

export type EmailContact = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  tags: string[];
  subscribed: boolean;
  source: string | null;
  created_at: string;
};

export async function fetchEmailContacts(): Promise<
  { success: true; contacts: EmailContact[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("email_contacts")
      .select("id, email, name, phone, tags, subscribed, source, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };
    const contacts = (data ?? []).map((r) => ({
      id: r.id,
      email: r.email ?? "",
      name: r.name ?? null,
      phone: r.phone ?? null,
      tags: (r.tags ?? []) as string[],
      subscribed: r.subscribed ?? true,
      source: r.source ?? null,
      created_at: r.created_at ?? "",
    }));
    return { success: true, contacts };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}

export async function importEmailContacts(
  rows: { email: string; name?: string; tags?: string[] }[]
): Promise<ActionResult> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { success: false, error: "לא נמצאו אנשי קשר" };
  }
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const toInsert = rows
      .filter((r) => r?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim()))
      .map((r) => ({
        user_id: user.id,
        email: r.email!.trim().toLowerCase(),
        name: (r.name ?? "").trim() || null,
        tags: (r.tags ?? ["כללי"]) as string[],
        subscribed: true,
        source: "import",
      }));

    if (toInsert.length === 0) {
      return { success: false, error: "לא נמצאו אימיילים תקינים" };
    }

    const { error } = await supabase.from("email_contacts").upsert(toInsert, {
      onConflict: "user_id,email",
      ignoreDuplicates: false,
    });

    if (error) return { success: false, error: error.message };
    revalidatePath("/email");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

export async function deleteEmailContact(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("email_contacts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };
    revalidatePath("/email");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}

const BULK_CHUNK = 80;

export async function bulkDeleteEmailContacts(ids: string[]): Promise<ActionResult> {
  if (!ids.length) return { success: false, error: "בחר אנשי קשר" };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
      const chunk = ids.slice(i, i + BULK_CHUNK);
      const { error } = await supabase
        .from("email_contacts")
        .delete()
        .eq("user_id", user.id)
        .in("id", chunk);

      if (error) return { success: false, error: error.message };
    }
    revalidatePath("/email");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

export async function updateEmailContactTags(
  id: string,
  tags: string[]
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("email_contacts")
      .update({ tags, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };
    revalidatePath("/email");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

/** מיזוג תגיות ללא כפילויות — לפילוח רשימות (VIP, סוחרים קרים וכו׳) */
export async function bulkAddTagsToEmailContacts(
  ids: string[],
  tagsToAdd: string[]
): Promise<ActionResult> {
  const add = [...new Set(tagsToAdd.map((t) => t.trim()).filter(Boolean))];
  if (!ids.length) return { success: false, error: "בחר אנשי קשר" };
  if (!add.length) return { success: false, error: "הזן תגית אחת לפחות" };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
      const chunk = ids.slice(i, i + BULK_CHUNK);
      const { data: rows, error: selErr } = await supabase
        .from("email_contacts")
        .select("id, tags")
        .eq("user_id", user.id)
        .in("id", chunk);
      if (selErr) return { success: false, error: selErr.message };
      for (const row of rows ?? []) {
        const cur = (row.tags ?? []) as string[];
        const merged = [...new Set([...cur, ...add])];
        const { error: upErr } = await supabase
          .from("email_contacts")
          .update({ tags: merged, updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("user_id", user.id);
        if (upErr) return { success: false, error: upErr.message };
      }
    }
    revalidatePath("/email");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

/** הסרת תגית אחת מכל הנבחרים — להפרדת רשימות */
export async function bulkRemoveTagFromEmailContacts(
  ids: string[],
  tagToRemove: string
): Promise<ActionResult> {
  const tag = tagToRemove.trim();
  if (!ids.length) return { success: false, error: "בחר אנשי קשר" };
  if (!tag) return { success: false, error: "הזן תגית להסרה" };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
      const chunk = ids.slice(i, i + BULK_CHUNK);
      const { data: rows, error: selErr } = await supabase
        .from("email_contacts")
        .select("id, tags")
        .eq("user_id", user.id)
        .in("id", chunk);
      if (selErr) return { success: false, error: selErr.message };
      for (const row of rows ?? []) {
        const cur = (row.tags ?? []) as string[];
        const next = cur.filter((t) => t !== tag);
        const { error: upErr } = await supabase
          .from("email_contacts")
          .update({ tags: next.length ? next : ["כללי"], updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("user_id", user.id);
        if (upErr) return { success: false, error: upErr.message };
      }
    }
    revalidatePath("/email");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

export async function importGmailContactsForEmail(): Promise<
  { success: true; imported: number } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: settings } = await supabase
      .from("user_settings")
      .select("gmail_refresh_token")
      .eq("user_id", user.id)
      .single();

    if (!settings?.gmail_refresh_token) {
      return { success: false, error: "חבר Gmail בהגדרות" };
    }

    const accessToken = await getAccessToken(settings.gmail_refresh_token);
    const res = await fetch(
      "https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=1000",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `שליפת אנשי קשר נכשלה: ${err.slice(0, 150)}` };
    }

    const data = (await res.json()) as {
      connections?: Array<{
        names?: Array<{ displayName?: string }>;
        emailAddresses?: Array<{ value?: string }>;
        phoneNumbers?: Array<{ value?: string }>;
      }>;
    };

    const connections = data.connections ?? [];
    const toUpsert: { user_id: string; email: string; name: string | null; phone: string | null; tags: string[]; subscribed: boolean; source: string }[] = [];

    for (const c of connections) {
      const email = c.emailAddresses?.[0]?.value?.trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;

      const name = c.names?.[0]?.displayName?.trim() || email.split("@")[0];
      const phone = c.phoneNumbers?.[0]?.value?.trim() || null;
      toUpsert.push({
        user_id: user.id,
        email,
        name: name || null,
        phone,
        tags: ["Gmail_Import"],
        subscribed: true,
        source: "gmail",
      });
    }

    if (toUpsert.length === 0) {
      return { success: true, imported: 0 };
    }

    const { error } = await supabase.from("email_contacts").upsert(toUpsert, {
      onConflict: "user_id,email",
      ignoreDuplicates: false,
    });

    if (error) return { success: false, error: error.message };
    revalidatePath("/email");
    return { success: true, imported: toUpsert.length };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function getGmailStatus(): Promise<
  { success: true; connected: boolean; email?: string } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data } = await supabase
      .from("user_settings")
      .select("gmail_refresh_token, gmail_email")
      .eq("user_id", user.id)
      .single();

    const connected = !!(data?.gmail_refresh_token);
    return { success: true, connected, email: data?.gmail_email ?? undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export type SendCampaignResult =
  | { success: true; sent: number; failed: number }
  | { success: false; error: string };

export async function sendEmailCampaign(
  contactIds: string[],
  subject: string,
  bodyHtml: string
): Promise<SendCampaignResult> {
  if (!contactIds.length) return { success: false, error: "בחר נמענים" };
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

    if (!settings?.gmail_refresh_token) {
      return { success: false, error: "חבר Gmail בהגדרות" };
    }

    const toSend: { id: string; email: string; name: string | null }[] = [];
    for (let i = 0; i < contactIds.length; i += BULK_CHUNK) {
      const chunk = contactIds.slice(i, i + BULK_CHUNK);
      const { data } = await supabase
        .from("email_contacts")
        .select("id, email, name")
        .eq("user_id", user.id)
        .eq("subscribed", true)
        .in("id", chunk);
      for (const c of data ?? []) {
        if (c?.email) toSend.push({ id: c.id, email: c.email, name: c.name ?? null });
      }
    }
    if (toSend.length === 0) {
      return { success: false, error: "לא נמצאו נמענים פעילים" };
    }

    const { getAccessToken, sendEmail } = await import("@/src/lib/gmail");
    const accessToken = await getAccessToken(settings.gmail_refresh_token);
    const fromEmail = settings.gmail_email ?? "noreply@example.com";

    const { data: campaign } = await supabase
      .from("email_campaigns")
      .insert({ user_id: user.id, subject, body_html: bodyHtml })
      .select("id")
      .single();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    let sent = 0;
    let failed = 0;

    for (const c of toSend) {
      const logRes = await supabase
        .from("email_logs")
        .insert({
          campaign_id: campaign?.id ?? null,
          contact_id: c.id,
          status: "sent",
        })
        .select("id")
        .single();

      const logId = logRes.data?.id;
      const trackUrl = `${appUrl}/api/email/track/${logId ?? "x"}`;
      const unsubUrl = `${appUrl}/api/email/unsubscribe/${logId ?? "x"}`;

      const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"></head>
<body style="font-family:Heebo,sans-serif;padding:20px;direction:rtl">
${bodyHtml || "<p>שלום,</p>"}
<hr style="margin:24px 0;border:none;border-top:1px solid #eee">
<p style="font-size:12px;color:#888">
<a href="${unsubUrl}" style="color:#888">הסר מנוי</a>
</p>
<img src="${trackUrl}" width="1" height="1" alt="" style="display:block" />
</body>
</html>`;

      try {
        await sendEmail(
          accessToken,
          c.email!,
          subject,
          html,
          fromEmail,
          "Broadcast Buddy"
        );
        sent++;
      } catch {
        failed++;
      }

      if (sent % 5 === 0 && sent > 0) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    revalidatePath("/email");
    return { success: true, sent, failed };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "שגיאה בשליחה",
    };
  }
}
