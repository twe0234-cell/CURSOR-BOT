"use server";

import { createClient } from "@/src/lib/supabase/server";
import { getAccessToken } from "@/src/lib/gmail";
import { revalidatePath } from "next/cache";
import { parseMarketTorahMessage, parsedMessageIsActionable, listMissingParseFields } from "@/src/lib/market/parseWhatsAppMarketMessage";
import { marketDbToK, marketKToDb } from "@/lib/market/kPricing";
import { generateSku, marketSkuPrefix } from "@/lib/sku";

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

/**
 * שמירת שורת טריאז׳ Gmail ל-CRM + רישום sys_events (חיבור למקור המייל).
 */
export async function saveGmailTriageToCrm(input: {
  mode: "create" | "link";
  email: string;
  name: string;
  summary: string;
  contactType: ContactType;
  linkToContactId: string | null;
}): Promise<{ success: true; contactId: string } | { success: false; error: string }> {
  const emailNorm = input.email.trim().toLowerCase();
  if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return { success: false, error: "אימייל לא תקין" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    let contactId: string;

    if (input.mode === "create") {
      const name = input.name.trim() || emailNorm.split("@")[0];
      const summaryBlock = input.summary.trim()
        ? `\n\n[ייבוא Gmail — ${new Date().toISOString().slice(0, 10)}]\n${input.summary.trim()}`
        : "";

      const { data: inserted, error } = await supabase
        .from("crm_contacts")
        .insert({
          user_id: user.id,
          name,
          type: input.contactType,
          preferred_contact: "Email",
          preferred_contact_method: "email",
          email: emailNorm,
          tags: ["Gmail_Import"],
          notes: summaryBlock.trim() ? summaryBlock.trim() : null,
        })
        .select("id")
        .single();

      if (error || !inserted?.id) {
        return { success: false, error: error?.message ?? "שגיאת יצירה" };
      }
      contactId = inserted.id as string;
    } else {
      if (!input.linkToContactId) {
        return { success: false, error: "בחר איש קשר לקישור" };
      }
      contactId = input.linkToContactId;

      const mergeRes = await mergeCrmContactEmail(contactId, emailNorm);
      if (!mergeRes.success) return mergeRes;

      if (input.summary.trim()) {
        const { data: prev } = await supabase
          .from("crm_contacts")
          .select("notes")
          .eq("id", contactId)
          .eq("user_id", user.id)
          .maybeSingle();
        const prevNotes = (prev?.notes as string | null) ?? "";
        const appended = `${prevNotes}\n\n[ייבוא Gmail — ${new Date().toISOString().slice(0, 10)}]\n${input.summary.trim()}`.trim();
        await supabase
          .from("crm_contacts")
          .update({ notes: appended, updated_at: new Date().toISOString() })
          .eq("id", contactId)
          .eq("user_id", user.id);
      }
    }

    const { error: evErr } = await supabase.from("sys_events").insert({
      user_id: user.id,
      source: "email",
      entity_type: "crm_contact",
      entity_id: contactId,
      project_id: null,
      action: "gmail_triage_saved",
      from_state: null,
      to_state: null,
      metadata: {
        triage_email: emailNorm,
        mode: input.mode,
        summary: input.summary.trim() || null,
      },
    });
    if (evErr) {
      console.error("[saveGmailTriageToCrm] sys_events", evErr.message);
    }

    revalidatePath("/email/import");
    revalidatePath("/crm");
    return { success: true, contactId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function importMarketTorahFromEmailMessage(
  rawText: string,
  sourceEmail?: string
): Promise<{ success: true; sku: string } | { success: false; error: string }> {
  try {
    const text = String(rawText ?? "").trim();
    if (!text) return { success: false, error: "נא להזין תוכן מייל" };

    const parsed = parseMarketTorahMessage(text);
    if (!parsedMessageIsActionable(parsed)) {
      const missing = listMissingParseFields(parsed);
      return { success: false, error: `לא זוהו מספיק נתונים. חסר: ${missing.join(" | ")}` };
    }

    const askFull = parsed.asking_price_full_shekels!;
    const askDb = marketKToDb(marketDbToK(askFull));

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const sku = generateSku(marketSkuPrefix);
    const { error } = await supabase.from("market_torah_books").insert({
      user_id: user.id,
      sku,
      source_message_id: sourceEmail?.trim() || null,
      sofer_id: null,
      dealer_id: null,
      external_sofer_name: null,
      script_type: parsed.script_type,
      torah_size: parsed.torah_size,
      parchment_type: null,
      influencer_style: null,
      asking_price: askDb,
      target_brokerage_price: null,
      currency: "ILS",
      expected_completion_date: null,
      notes: text.slice(0, 5000),
      last_contact_date: null,
      negotiation_notes: null,
      handwriting_image_url: null,
    });

    if (error) return { success: false, error: error.message };

    revalidatePath("/market");
    revalidatePath("/email/import");
    return { success: true, sku };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
