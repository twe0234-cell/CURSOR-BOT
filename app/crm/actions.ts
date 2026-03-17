"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getAccessToken } from "@/src/lib/gmail";
import { logError, logInfo } from "@/lib/logger";

type ActionResult = { success: true } | { success: false; error: string };

export type CrmContact = {
  id: string;
  name: string;
  type: string;
  preferred_contact: string;
  wa_chat_id: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
};

export async function fetchCrmContacts(): Promise<
  { success: true; contacts: CrmContact[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_contacts")
      .select("id, name, type, preferred_contact, wa_chat_id, email, phone, tags, notes, created_at")
      .eq("user_id", user.id)
      .order("name");

    if (error) return { success: false, error: error.message };
    const contacts = (data ?? []).map((r) => ({
      id: r.id,
      name: r.name ?? "",
      type: r.type ?? "Other",
      preferred_contact: r.preferred_contact ?? "WhatsApp",
      wa_chat_id: r.wa_chat_id ?? null,
      email: r.email ?? null,
      phone: r.phone ?? null,
      tags: (r.tags ?? []) as string[],
      notes: r.notes ?? null,
      created_at: r.created_at ?? "",
    }));
    return { success: true, contacts };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function importGmailContacts(): Promise<
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
      "https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses&pageSize=1000",
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
      }>;
    };

    const connections = data.connections ?? [];
    const { data: existing } = await supabase
      .from("crm_contacts")
      .select("id, email, tags")
      .eq("user_id", user.id);

    const existingByEmail = new Map(
      (existing ?? []).map((r) => [r.email?.toLowerCase() ?? "", r])
    );

    let imported = 0;
    for (const c of connections) {
      const email = c.emailAddresses?.[0]?.value?.trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;

      const name = c.names?.[0]?.displayName?.trim() || email.split("@")[0];
      const existingContact = existingByEmail.get(email);

      if (existingContact) {
        const currentTags = (existingContact.tags ?? []) as string[];
        if (!currentTags.includes("Gmail_Import")) {
          await supabase
            .from("crm_contacts")
            .update({
              tags: [...currentTags, "Gmail_Import"],
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingContact.id);
          imported++;
        }
      } else {
        await supabase.from("crm_contacts").insert({
          user_id: user.id,
          name,
          type: "Other",
          preferred_contact: "Email",
          email,
          tags: ["Gmail_Import"],
        });
        imported++;
        existingByEmail.set(email, { id: "", email, tags: ["Gmail_Import"] });
      }
    }

    revalidatePath("/crm");
    return { success: true, imported };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function fetchScribes(): Promise<
  { success: true; scribes: { id: string; name: string }[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_contacts")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("type", "Scribe")
      .order("name");

    if (error) return { success: false, error: error.message };
    const scribes = (data ?? []).map((r) => ({ id: r.id, name: r.name ?? "" }));
    return { success: true, scribes };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function createScribeContact(name: string): Promise<
  { success: true; scribe: { id: string; name: string } } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_contacts")
      .insert({
        user_id: user.id,
        name: name.trim(),
        type: "Scribe",
        preferred_contact: "WhatsApp",
      })
      .select("id, name")
      .single();

    if (error) {
      logError("CRM", "createScribeContact DB error", { error: error.message, name: name.trim() });
      return { success: false, error: error.message };
    }
    revalidatePath("/crm");
    logInfo("CRM", "createScribeContact completed", { scribeId: data.id, name: data.name, userId: user.id });
    return { success: true, scribe: { id: data.id, name: data.name ?? "" } };
  } catch (err) {
    logError("CRM", "createScribeContact failed", { error: String(err), name });
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function createCrmContact(data: {
  name: string;
  type?: string;
  preferred_contact?: string;
  wa_chat_id?: string;
  email?: string;
  phone?: string;
  tags?: string[];
}): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase.from("crm_contacts").insert({
      user_id: user.id,
      name: data.name.trim(),
      type: data.type ?? "Other",
      preferred_contact: data.preferred_contact ?? "WhatsApp",
      wa_chat_id: data.wa_chat_id?.trim() || null,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      tags: (data.tags ?? []).filter(Boolean),
    });

    if (error) return { success: false, error: error.message };
    revalidatePath("/crm");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function updateCrmContact(
  id: string,
  data: Partial<{ name: string; type: string; preferred_contact: string; wa_chat_id: string; email: string; phone: string; tags: string[]; notes: string }>
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) payload.name = data.name.trim();
    if (data.type !== undefined) payload.type = data.type;
    if (data.preferred_contact !== undefined) payload.preferred_contact = data.preferred_contact;
    if (data.wa_chat_id !== undefined) payload.wa_chat_id = data.wa_chat_id?.trim() || null;
    if (data.email !== undefined) payload.email = data.email?.trim() || null;
    if (data.phone !== undefined) payload.phone = data.phone?.trim() || null;
    if (data.tags !== undefined) payload.tags = data.tags;
    if (data.notes !== undefined) payload.notes = data.notes;

    const { error } = await supabase
      .from("crm_contacts")
      .update(payload)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };
    revalidatePath("/crm");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function addTransaction(
  contactId: string,
  amount: number,
  type: "Debt" | "Credit",
  description?: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase.from("crm_transactions").insert({
      contact_id: contactId,
      amount,
      type,
      description: description?.trim() || null,
    });

    if (error) return { success: false, error: error.message };
    revalidatePath("/crm");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function addDocument(
  contactId: string,
  fileUrl: string,
  docType?: string,
  name?: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase.from("crm_documents").insert({
      contact_id: contactId,
      file_url: fileUrl,
      doc_type: docType ?? "Other",
      name: name?.trim() || null,
    });

    if (error) return { success: false, error: error.message };
    revalidatePath("/crm");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export type ContactDetailResult = {
  success: true;
  contact: CrmContact;
  transactions: Array<{ id: string; amount: number; type: string; description: string | null; date: string }>;
  documents: Array<{ id: string; file_url: string; doc_type: string; name: string | null }>;
  logs: Array<{ id: string; channel: string; content: string | null; timestamp: string }>;
  totalOwed: number;
  totalDue: number;
};

export async function fetchContactDetail(id: string): Promise<
  ContactDetailResult | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: contact, error: contactErr } = await supabase
      .from("crm_contacts")
      .select("id, name, type, preferred_contact, wa_chat_id, email, phone, tags, notes, created_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (contactErr || !contact) return { success: false, error: "לא נמצא" };

    const [txRes, docsRes, logsRes] = await Promise.all([
      supabase.from("crm_transactions").select("id, amount, type, description, date").eq("contact_id", id).order("date", { ascending: false }),
      supabase.from("crm_documents").select("id, file_url, doc_type, name").eq("contact_id", id).order("created_at", { ascending: false }),
      supabase.from("crm_communication_logs").select("id, channel, content, timestamp").eq("contact_id", id).order("timestamp", { ascending: false }).limit(10),
    ]);

    const transactions = txRes.data ?? [];
    const totalOwed = transactions.filter((t) => t.type === "Debt").reduce((s, t) => s + Number(t.amount ?? 0), 0);
    const totalDue = transactions.filter((t) => t.type === "Credit").reduce((s, t) => s + Number(t.amount ?? 0), 0);

    return {
      success: true,
      contact: {
        id: contact.id,
        name: contact.name ?? "",
        type: contact.type ?? "Other",
        preferred_contact: contact.preferred_contact ?? "WhatsApp",
        wa_chat_id: contact.wa_chat_id ?? null,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        tags: (contact.tags ?? []) as string[],
        notes: contact.notes ?? null,
        created_at: contact.created_at ?? "",
      },
      transactions: transactions.map((t) => ({
        id: t.id,
        amount: Number(t.amount ?? 0),
        type: t.type ?? "",
        description: t.description ?? null,
        date: t.date ?? "",
      })),
      documents: (docsRes.data ?? []).map((d) => ({
        id: d.id,
        file_url: d.file_url ?? "",
        doc_type: d.doc_type ?? "Other",
        name: d.name ?? null,
      })),
      logs: (logsRes.data ?? []).map((l) => ({
        id: l.id,
        channel: l.channel ?? "",
        content: l.content ?? null,
        timestamp: l.timestamp ?? "",
      })),
      totalOwed,
      totalDue,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
