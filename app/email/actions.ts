"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
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

export async function bulkDeleteEmailContacts(ids: string[]): Promise<ActionResult> {
  if (!ids.length) return { success: false, error: "בחר אנשי קשר" };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("email_contacts")
      .delete()
      .eq("user_id", user.id)
      .in("id", ids);

    if (error) return { success: false, error: error.message };
    revalidatePath("/email");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
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
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
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
