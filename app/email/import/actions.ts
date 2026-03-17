"use server";

import { createClient } from "@/src/lib/supabase/server";
import { getAccessToken } from "@/src/lib/gmail";
import { revalidatePath } from "next/cache";

export type GmailTriageContact = {
  email: string;
  name: string;
};

export type ContactType = "Scribe" | "Merchant" | "End_Customer" | "Other";

export async function fetchGmailTriageContacts(): Promise<
  | { success: true; contacts: GmailTriageContact[] }
  | { success: false; error: string }
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
      "https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses&pageSize=1000",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `שליפת אנשי קשר נכשלה: ${err.slice(0, 150)}` };
    }

    const data = (await res.json()) as {
      connections?: Array<{
        names?: Array<{ displayName?: string }>;
        emailAddresses?: Array<{ value?: string }>;
      }>;
    };

    const connections = data.connections ?? [];
    const crmEmails = new Set<string>();
    const { data: crmRows } = await supabase
      .from("crm_contacts")
      .select("email")
      .eq("user_id", user.id);
    for (const r of crmRows ?? []) {
      if (r.email?.trim()) crmEmails.add(r.email.trim().toLowerCase());
    }

    const { data: ignoredRows } = await supabase
      .from("sys_ignored_emails")
      .select("email");
    const ignoredEmails = new Set((ignoredRows ?? []).map((r) => r.email?.toLowerCase() ?? ""));

    const triage: GmailTriageContact[] = [];
    for (const c of connections) {
      const email = c.emailAddresses?.[0]?.value?.trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      if (crmEmails.has(email) || ignoredEmails.has(email)) continue;

      const name = c.names?.[0]?.displayName?.trim() || email.split("@")[0];
      triage.push({ email, name });
    }

    revalidatePath("/email/import");
    return { success: true, contacts: triage };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function createCrmContactFromTriage(
  email: string,
  name: string,
  contactType: ContactType
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };
    if (!name.trim()) return { success: false, error: "הזן שם" };

    const { error } = await supabase.from("crm_contacts").insert({
      user_id: user.id,
      name: name.trim(),
      type: contactType,
      preferred_contact: "Email",
      email: email.trim().toLowerCase(),
      tags: ["Gmail_Import"],
    });

    if (error) return { success: false, error: error.message };
    revalidatePath("/email/import");
    revalidatePath("/crm");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function mergeCrmContactEmail(
  contactId: string,
  email: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("crm_contacts")
      .update({
        email: email.trim().toLowerCase(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", contactId)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };
    revalidatePath("/email/import");
    revalidatePath("/crm");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function ignoreEmail(email: string): Promise<
  { success: true } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("sys_ignored_emails")
      .upsert({ email: email.trim().toLowerCase() }, { onConflict: "email" });

    if (error) return { success: false, error: error.message };
    revalidatePath("/email/import");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
