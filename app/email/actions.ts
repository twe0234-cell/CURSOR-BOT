"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getAccessToken, GmailAuthRevokedError, clearRevokedGmailRefreshToken } from "@/src/lib/gmail";

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

    let accessToken: string;
    try {
      accessToken = await getAccessToken(settings.gmail_refresh_token);
    } catch (e) {
      if (e instanceof GmailAuthRevokedError) {
        await clearRevokedGmailRefreshToken(supabase, user.id);
        return { success: false, error: e.message };
      }
      throw e;
    }
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

/**
 * ייבוא אנשי קשר מ-CRM (שיש להם אימייל) לרשימת תפוצה.
 * מבצע upsert — אנשי קשר קיימים ברשימה לא ימחקו.
 * מחזיר כמה נוספו/עדכנו.
 */
export async function importCrmContactsToEmail(): Promise<
  | { success: true; added: number; total: number }
  | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: crmRows, error: fetchErr } = await supabase
      .from("crm_contacts")
      .select("id, name, email, phone")
      .eq("user_id", user.id)
      .not("email", "is", null)
      .neq("email", "");

    if (fetchErr) return { success: false, error: fetchErr.message };

    const valid = (crmRows ?? []).filter(
      (r) => r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r.email).trim())
    );

    if (valid.length === 0) {
      return { success: true, added: 0, total: 0 };
    }

    const { data: existing } = await supabase
      .from("email_contacts")
      .select("email")
      .eq("user_id", user.id);
    const existingSet = new Set(
      (existing ?? []).map((r) => (r.email ?? "").toLowerCase().trim())
    );

    const toInsert = valid.map((r) => ({
      user_id: user.id,
      email: String(r.email).trim().toLowerCase(),
      name: (r.name ?? "").trim() || null,
      phone: (r.phone ?? "").trim() || null,
      tags: ["CRM"],
      subscribed: true,
      source: "crm",
    }));

    const { error: upsertErr } = await supabase.from("email_contacts").upsert(toInsert, {
      onConflict: "user_id,email",
      ignoreDuplicates: false,
    });

    if (upsertErr) return { success: false, error: upsertErr.message };

    const added = toInsert.filter((r) => !existingSet.has(r.email)).length;
    revalidatePath("/email");
    return { success: true, added, total: toInsert.length };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

/**
 * הוספת איש קשר בודד מ-CRM לרשימת תפוצה.
 */
export async function addCrmContactToEmailList(
  name: string,
  email: string,
  phone?: string | null
): Promise<
  { success: true; emailContactId?: string } | { success: false; error: string }
> {
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { success: false, error: "אימייל לא תקין" };
  }
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: row, error } = await supabase
      .from("email_contacts")
      .upsert(
        {
          user_id: user.id,
          email: cleanEmail,
          name: name.trim() || null,
          phone: (phone ?? "").trim() || null,
          tags: ["CRM"],
          subscribed: true,
          source: "crm",
        },
        { onConflict: "user_id,email" }
      )
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };
    revalidatePath("/email");
    revalidatePath("/email/campaigns");
    return { success: true, emailContactId: row?.id as string | undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

/** תגיות מוצעות לקמפייני אימייל בלבד — לא מערבב עם allowed_tags של וואטסאפ */
export async function saveEmailCampaignTagPresets(
  presets: string[]
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const cleaned = [...new Set((presets ?? []).map((t) => String(t).trim()).filter(Boolean))];

    const { error } = await supabase
      .from("user_settings")
      .update({
        email_tag_presets: cleaned,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };
    revalidatePath("/email");
    revalidatePath("/email/campaigns");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
