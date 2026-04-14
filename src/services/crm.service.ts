/**
 * CRM Service – all business logic for the CRM module.
 *
 * Rules:
 *  - No Next.js `revalidatePath` calls here (cache is a server-action concern).
 *  - No `"use server"` directive (this is a plain server-side module, not an action file).
 *  - Each function handles its own auth check so callers don't repeat the boilerplate.
 *  - All Supabase / unknown errors are caught and returned as { success: false, error }.
 */

import { createClient } from "@/src/lib/supabase/server";
import { getAccessToken } from "@/src/lib/gmail";
import { generateSku, crmSkuPrefix } from "@/lib/sku";
import { logError, logInfo } from "@/lib/logger";
import { toErrorMessage, handleSupabaseError } from "@/src/lib/errors";
import { INVENTORY_ACTIVE_STATUSES } from "@/lib/inventory/status";
import { classifyDealBalance } from "@/src/services/crm.logic";
import type {
  AddHistoryEntryInput,
  CrmContactHistoryEntry,
} from "@/src/lib/types/crm";

// ─── Constants ───────────────────────────────────────────────────────────────

export type { CrmContactHistoryEntry, AddHistoryEntryInput } from "@/src/lib/types/crm";

export type AddHistoryEntryResult =
  | { success: true; entry: CrmContactHistoryEntry }
  | { success: false; error: string };

// ─── Shared types ─────────────────────────────────────────────────────────────

export type ActionResult =
  | { success: true; id?: string }
  | { success: false; error: string };

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
  certification: string | null;
  phone_type: string | null;
  created_at: string;
  city?: string | null;
};

export type ContactDetailResult = {
  success: true;
  contact: CrmContact;
  transactions: Array<{
    id: string;
    amount: number;
    type: string;
    description: string | null;
    date: string;
  }>;
  documents: Array<{
    id: string;
    file_url: string;
    doc_type: string;
    name: string | null;
  }>;
  logs: Array<{
    id: string;
    channel: string;
    content: string | null;
    timestamp: string;
    direction: string | null;
  }>;
  totalOwed: number;
  totalDue: number;
};

/** Input type for createCrmContact */
export type CreateCrmContactInput = {
  name: string;
  type?: string;
  preferred_contact?: string;
  wa_chat_id?: string;
  email?: string;
  phone?: string;
  tags?: string[];
};

/** Input type for updateCrmContact (all fields optional except id) */
export type UpdateCrmContactInput = Partial<{
  name: string;
  type: string;
  preferred_contact: string;
  wa_chat_id: string;
  email: string;
  phone: string;
  tags: string[];
  notes: string;
  certification: string;
  phone_type: string;
  handwriting_image_url: string | null;
  city: string | null;
  address: string | null;
}>;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Creates a Supabase client and resolves the currently authenticated user. */
async function getAuthClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** תיק סופר ריק ב־crm_sofer_profiles — מאפשר הופעה עקבית במאגר סופרים */
async function ensureSoferProfileRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contactId: string
): Promise<void> {
  const { error } = await supabase.from("crm_sofer_profiles").upsert(
    { contact_id: contactId },
    { onConflict: "contact_id" }
  );
  if (error) {
    logError("CRM", "ensureSoferProfileRow", { contactId, message: error.message });
  }
}

/**
 * Maps a raw Supabase crm_contacts row to the `CrmContact` shape.
 * Provides safe defaults for every nullable field.
 */
function mapContact(r: {
  id: string;
  name: string | null;
  type: string | null;
  preferred_contact: string | null;
  wa_chat_id: string | null;
  email: string | null;
  phone: string | null;
  tags: string[] | null;
  notes: string | null;
  certification: string | null;
  phone_type: string | null;
  created_at: string | null;
}): CrmContact {
  return {
    id: r.id,
    name: r.name ?? "",
    type: r.type ?? "Other",
    preferred_contact: r.preferred_contact ?? "WhatsApp",
    wa_chat_id: r.wa_chat_id ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
    tags: (r.tags ?? []) as string[],
    notes: r.notes ?? null,
    certification: r.certification ?? null,
    phone_type: r.phone_type ?? null,
    created_at: r.created_at ?? "",
    city: (r as { city?: string | null }).city ?? null,
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

/** Fetches all CRM contacts for the authenticated user, ordered by name. */
export async function fetchCrmContacts(): Promise<
  { success: true; contacts: CrmContact[] } | { success: false; error: string }
> {
  try {
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_contacts")
      .select(
        "id, name, type, preferred_contact, wa_chat_id, email, phone, tags, notes, certification, phone_type, created_at"
      )
      .eq("user_id", user.id)
      .order("name");

    if (error) return { success: false, error: handleSupabaseError(error) };
    return { success: true, contacts: (data ?? []).map(mapContact) };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

/** Imports contacts from Gmail (People API) and upserts them into crm_contacts. */
export async function importGmailContacts(): Promise<
  { success: true; imported: number } | { success: false; error: string }
> {
  try {
    const { supabase, user } = await getAuthClient();
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
      return {
        success: false,
        error: `שליפת אנשי קשר נכשלה: ${err.slice(0, 150)}`,
      };
    }

    const responseData = (await res.json()) as {
      connections?: Array<{
        names?: Array<{ displayName?: string }>;
        emailAddresses?: Array<{ value?: string }>;
      }>;
    };

    const connections = responseData.connections ?? [];

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

    return { success: true, imported };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

/** Fetches all contacts of type "Scribe" for the authenticated user. */
export async function fetchScribes(): Promise<
  | { success: true; scribes: { id: string; name: string }[] }
  | { success: false; error: string }
> {
  try {
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_contacts")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("type", "Scribe")
      .order("name");

    if (error) return { success: false, error: handleSupabaseError(error) };
    return {
      success: true,
      scribes: (data ?? []).map((r) => ({ id: r.id, name: r.name ?? "" })),
    };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

/** Fetches ALL CRM contacts for the authenticated user (for dealer/owner selection). */
export async function fetchDealers(): Promise<
  | { success: true; dealers: { id: string; name: string }[] }
  | { success: false; error: string }
> {
  try {
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_contacts")
      .select("id, name")
      .eq("user_id", user.id)
      .order("name");

    if (error) return { success: false, error: handleSupabaseError(error) };
    return {
      success: true,
      dealers: (data ?? []).map((r) => ({ id: r.id, name: r.name ?? "" })),
    };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

/**
 * Creates an End_Customer contact – used by the quick "Add Client" flow.
 * Generates a CRM SKU automatically.
 */
export async function createClientContact(
  name: string,
  phone?: string
): Promise<
  | { success: true; contact: { id: string; name: string } }
  | { success: false; error: string }
> {
  try {
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_contacts")
      .insert({
        user_id: user.id,
        name: name.trim(),
        type: "End_Customer",
        preferred_contact: "WhatsApp",
        phone: phone?.trim() || null,
        sku: generateSku(crmSkuPrefix),
      })
      .select("id, name")
      .single();

    if (error) return { success: false, error: handleSupabaseError(error) };
    return { success: true, contact: { id: data.id, name: data.name ?? "" } };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

/**
 * Creates a Merchant contact – used by the quick "Add Dealer" flow.
 * Generates a CRM SKU automatically.
 */
export async function createMerchantContact(
  name: string
): Promise<
  | { success: true; dealer: { id: string; name: string } }
  | { success: false; error: string }
> {
  try {
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_contacts")
      .insert({
        user_id: user.id,
        name: name.trim(),
        type: "Merchant",
        preferred_contact: "WhatsApp",
        sku: generateSku(crmSkuPrefix),
      })
      .select("id, name")
      .single();

    if (error) {
      logError("CRM", "createMerchantContact DB error", {
        error: error.message,
        name: name.trim(),
      });
      return { success: false, error: handleSupabaseError(error) };
    }

    logInfo("CRM", "createMerchantContact completed", {
      dealerId: data.id,
      name: data.name,
      userId: user.id,
    });
    return { success: true, dealer: { id: data.id, name: data.name ?? "" } };
  } catch (err) {
    logError("CRM", "createMerchantContact failed", { error: String(err), name });
    return { success: false, error: toErrorMessage(err) };
  }
}

/**
 * Creates a Scribe contact – used by the quick "Add Scribe" flow.
 * Generates a CRM SKU automatically.
 */
export async function createScribeContact(
  name: string
): Promise<
  | { success: true; scribe: { id: string; name: string } }
  | { success: false; error: string }
> {
  try {
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_contacts")
      .insert({
        user_id: user.id,
        name: name.trim(),
        type: "Scribe",
        preferred_contact: "WhatsApp",
        sku: generateSku(crmSkuPrefix),
      })
      .select("id, name")
      .single();

    if (error) {
      logError("CRM", "createScribeContact DB error", {
        error: error.message,
        name: name.trim(),
      });
      return { success: false, error: handleSupabaseError(error) };
    }

    await ensureSoferProfileRow(supabase, data.id);

    logInfo("CRM", "createScribeContact completed", {
      scribeId: data.id,
      name: data.name,
      userId: user.id,
    });
    return { success: true, scribe: { id: data.id, name: data.name ?? "" } };
  } catch (err) {
    logError("CRM", "createScribeContact failed", { error: String(err), name });
    return { success: false, error: toErrorMessage(err) };
  }
}

/**
 * Bulk-imports CRM contacts from CSV-parsed rows.
 * Validates each row, skips invalid ones and collects per-row errors.
 *
 * Valid contact types: Scribe | Merchant | End_Customer | Other
 * Accepts Hebrew column aliases: שם / אימייל / טלפון / סוג
 */
export async function bulkImportCrmContacts(
  rows: Record<string, unknown>[]
): Promise<
  | { success: true; imported: number; errors: string[] }
  | { success: false; error: string }
> {
  try {
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const VALID_TYPES = ["Scribe", "Merchant", "End_Customer", "Other"] as const;
    const errors: string[] = [];
    let imported = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = (r.name ?? r.Name ?? r["שם"] ?? "").toString().trim();
      if (!name) {
        errors.push(`שורה ${i + 1}: חסר שם`);
        continue;
      }

      const email =
        (r.email ?? r.Email ?? r["אימייל"] ?? "").toString().trim() || null;
      const phone =
        (r.phone ?? r.Phone ?? r["טלפון"] ?? "").toString().trim() || null;
      const rawType = (r.type ?? r.Type ?? r["סוג"] ?? "Other").toString().trim();
      const typeVal = (VALID_TYPES as readonly string[]).includes(rawType)
        ? rawType
        : "Other";

      const { data: insRow, error } = await supabase
        .from("crm_contacts")
        .insert({
          user_id: user.id,
          name,
          type: typeVal,
          preferred_contact: "WhatsApp",
          email,
          phone,
          tags: [],
          sku: generateSku(crmSkuPrefix),
        })
        .select("id")
        .single();

      if (error) {
        errors.push(`שורה ${i + 1}: ${handleSupabaseError(error)}`);
      } else {
        imported++;
        if (typeVal === "Scribe" && insRow?.id) {
          await ensureSoferProfileRow(supabase, insRow.id as string);
        }
      }
    }

    return { success: true, imported, errors };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

/**
 * Creates a new CRM contact with full field support.
 * Used by the full "Add Contact" form in CrmClient.
 */
export async function createCrmContact(
  input: CreateCrmContactInput
): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_contacts")
      .insert({
        user_id: user.id,
        name: input.name.trim(),
        type: input.type ?? "Other",
        preferred_contact: input.preferred_contact ?? "WhatsApp",
        wa_chat_id: input.wa_chat_id?.trim() || null,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        tags: (input.tags ?? []).filter(Boolean),
        sku: generateSku(crmSkuPrefix),
      })
      .select("id")
      .single();

    if (error) return { success: false, error: handleSupabaseError(error) };
    const newId = data?.id as string | undefined;
    if (newId && (input.type ?? "Other") === "Scribe") {
      await ensureSoferProfileRow(supabase, newId);
    }
    return { success: true, id: newId };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

/** עדכון תגיות בלבד (ציר זמן / סינון). */
export async function updateContactTags(
  contactId: string,
  tags: string[]
): Promise<ActionResult> {
  const cleaned = tags.map((t) => t.trim()).filter(Boolean);
  return updateCrmContact(contactId, { tags: cleaned });
}

/**
 * Updates a CRM contact by id.
 * Only the fields present in `input` are written to the database.
 * Ownership is enforced via `eq("user_id", user.id)`.
 */
export async function updateCrmContact(
  id: string,
  input: UpdateCrmContactInput
): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    // Build payload from only the fields that were explicitly provided
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.type !== undefined) payload.type = input.type;
    if (input.preferred_contact !== undefined)
      payload.preferred_contact = input.preferred_contact;
    if (input.wa_chat_id !== undefined)
      payload.wa_chat_id = input.wa_chat_id?.trim() || null;
    if (input.email !== undefined) payload.email = input.email?.trim() || null;
    if (input.phone !== undefined) payload.phone = input.phone?.trim() || null;
    if (input.tags !== undefined) payload.tags = input.tags;
    if (input.notes !== undefined) payload.notes = input.notes;
    if (input.certification !== undefined)
      payload.certification = input.certification?.trim() || null;
    if (input.phone_type !== undefined)
      payload.phone_type = input.phone_type?.trim() || null;
    if (input.handwriting_image_url !== undefined) {
      const u = input.handwriting_image_url;
      payload.handwriting_image_url = u && String(u).trim() ? String(u).trim() : null;
    }
    if (input.city !== undefined) {
      payload.city = input.city?.trim() ? input.city.trim() : null;
    }
    if (input.address !== undefined) {
      payload.address = input.address?.trim() ? input.address.trim() : null;
    }

    const { error } = await supabase
      .from("crm_contacts")
      .update(payload)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { success: false, error: handleSupabaseError(error) };

    const { data: typeRow } = await supabase
      .from("crm_contacts")
      .select("type")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (typeRow?.type === "Scribe") {
      await ensureSoferProfileRow(supabase, id);
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

function mapContactHistoryRow(raw: Record<string, unknown>): CrmContactHistoryEntry {
  const meta = raw.metadata;
  const metadata =
    typeof meta === "object" && meta !== null && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : {};
  return {
    id: String(raw.id ?? ""),
    body: String(raw.body ?? ""),
    created_at: String(raw.created_at ?? ""),
    follow_up_date: (raw.follow_up_date as string | null) ?? null,
    direction: (raw.direction as CrmContactHistoryEntry["direction"]) ?? "internal",
    source: (raw.source as CrmContactHistoryEntry["source"]) ?? "manual",
    external_reference_id: (raw.external_reference_id as string | null) ?? null,
    metadata,
  };
}

/**
 * Inserts a row into `crm_contact_history` (unified timeline).
 * Defaults: direction=internal, source=manual (user-facing notes).
 */
export async function addHistoryEntry(
  contactId: string,
  input: AddHistoryEntryInput
): Promise<AddHistoryEntryResult> {
  try {
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const text = input.body.trim();
    if (!text) return { success: false, error: "הזן תוכן להערה" };

    const direction = input.direction ?? "internal";
    const source = input.source ?? "manual";
    const metadata = input.metadata ?? {};

    const { data: row } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("id", contactId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!row) return { success: false, error: "איש קשר לא נמצא" };

    const { data: inserted, error } = await supabase
      .from("crm_contact_history")
      .insert({
        user_id: user.id,
        contact_id: contactId,
        body: text,
        ...(input.follow_up_date ? { follow_up_date: input.follow_up_date } : {}),
        direction,
        source,
        external_reference_id: input.external_reference_id?.trim() || null,
        metadata,
      })
      .select(
        "id, body, created_at, follow_up_date, direction, source, external_reference_id, metadata"
      )
      .maybeSingle();

    if (error) {
      if (
        error.message?.includes("crm_contact_history") ||
        error.code === "42P01"
      ) {
        return {
          success: false,
          error: "יש להריץ מיגרציה 048 (crm_contact_history) ב-Supabase",
        };
      }
      if (error.code === "23505") {
        return {
          success: false,
          error: "הודעה זו כבר סונכרנה (מזהה חיצוני קיים)",
        };
      }
      return { success: false, error: handleSupabaseError(error) };
    }

    if (!inserted) return { success: false, error: "לא נשמרה רשומה" };

    return { success: true, entry: mapContactHistoryRow(inserted as Record<string, unknown>) };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

/**
 * Adds a manual timestamped note to `crm_contact_history`.
 * Validates contact ownership before inserting.
 */
export async function addContactHistoryNote(
  contactId: string,
  body: string,
  follow_up_date?: string | null
): Promise<ActionResult> {
  const res = await addHistoryEntry(contactId, {
    body,
    follow_up_date: follow_up_date ?? null,
    direction: "internal",
    source: "manual",
  });
  if (!res.success) return { success: false, error: res.error };
  return { success: true };
}

/** Adds a manual Debt/Credit entry to `crm_transactions` for a contact. */
export async function addTransaction(
  contactId: string,
  amount: number,
  type: "Debt" | "Credit",
  description?: string
): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase.from("crm_transactions").insert({
      contact_id: contactId,
      amount,
      type,
      description: description?.trim() || null,
    });

    if (error) return { success: false, error: handleSupabaseError(error) };
    return { success: true };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

/** Attaches a document (already uploaded to storage) to a contact record. */
export async function addDocument(
  contactId: string,
  fileUrl: string,
  docType?: string,
  name?: string
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  try {
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_documents")
      .insert({
        contact_id: contactId,
        file_url: fileUrl,
        doc_type: docType ?? "Other",
        name: name?.trim() || null,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: handleSupabaseError(error) };
    return { success: true, id: data.id as string };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

/**
 * Fetches a single contact's detail view (CRM tables only):
 * contact + transactions + documents + communication logs + manual totals.
 *
 * For the full contact **page** (ERP balances, ledger, sales lists), use
 * `loadContactDetailPage` — that aggregation intentionally lives in the service
 * next to other CRM operations so the route stays a thin shell.
 */
export async function fetchContactDetail(
  id: string
): Promise<ContactDetailResult | { success: false; error: string }> {
  try {
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: contact, error: contactErr } = await supabase
      .from("crm_contacts")
      .select(
        "id, name, type, preferred_contact, wa_chat_id, email, phone, tags, notes, certification, phone_type, created_at, city"
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (contactErr || !contact)
      return { success: false, error: "לא נמצא" };

    const [txRes, docsRes, logsRes] = await Promise.all([
      supabase
        .from("crm_transactions")
        .select("id, amount, type, description, date")
        .eq("contact_id", id)
        .order("date", { ascending: false }),
      supabase
        .from("crm_documents")
        .select("id, file_url, doc_type, name")
        .eq("contact_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("crm_communication_logs")
        .select("id, channel, content, timestamp, direction")
        .eq("contact_id", id)
        .order("timestamp", { ascending: false })
        .limit(10),
    ]);

    const transactions = txRes.data ?? [];
    const totalOwed = transactions
      .filter((t) => t.type === "Debt")
      .reduce((s, t) => s + Number(t.amount ?? 0), 0);
    const totalDue = transactions
      .filter((t) => t.type === "Credit")
      .reduce((s, t) => s + Number(t.amount ?? 0), 0);

    return {
      success: true,
      contact: mapContact(contact),
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
        direction: (l.direction as string | null) ?? null,
      })),
      totalOwed,
      totalDue,
    };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

// ─── Contact detail page (CRM + linked ERP aggregates) ───────────────────────
//
// `loadContactDetailPage` is the single entry-point for the contact detail route.
// All heavy logic is broken into focused internal helpers below, keeping the
// orchestrator readable. Queries, data shapes, and behavior are identical to
// the original implementation.

// Convenience alias so helper signatures stay concise.
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Hebrew display labels for contact type codes. */
const CONTACT_TYPE_LABELS: Record<string, string> = {
  Scribe: "סופר",
  Merchant: "סוחר",
  End_Customer: "לקוח",
  Other: "אחר",
};

// ─── Internal helpers (not exported) ─────────────────────────────────────────

/**
 * Fetches the full contact row (including `handwriting_image_url`) owned by `userId`.
 * Returns `null` when the contact does not exist or belongs to a different user.
 */
async function fetchContactById(
  supabase: SupabaseClient,
  contactId: string,
  userId: string
) {
  const { data } = await supabase
    .from("crm_contacts")
    .select(
      "id, name, type, preferred_contact, wa_chat_id, email, phone, tags, notes, certification, phone_type, created_at, handwriting_image_url"
    )
    .eq("id", contactId)
    .eq("user_id", userId)
    .single();
  return data ?? null;
}

/**
 * Fetches the CRM-native activity tables for a contact in parallel:
 * manual transactions, attached documents, automated communication logs,
 * and manual history notes (up to 200 entries, newest-first).
 */
async function fetchCrmActivity(supabase: SupabaseClient, contactId: string) {
  const [txRes, docsRes, logsRes, histRes] = await Promise.all([
    supabase
      .from("crm_transactions")
      .select("id, amount, type, description, date")
      .eq("contact_id", contactId)
      .order("date", { ascending: false }),
    supabase
      .from("crm_documents")
      .select("id, file_url, doc_type, name")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_communication_logs")
      .select("id, channel, content, timestamp, direction")
      .eq("contact_id", contactId)
      .order("timestamp", { ascending: false })
      .limit(50),
    supabase
      .from("crm_contact_history")
      .select(
        "id, body, created_at, follow_up_date, direction, source, external_reference_id, metadata"
      )
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return {
    txRows: txRes.data ?? [],
    docRows: docsRes.data ?? [],
    logRows: logsRes.data ?? [],
    contactHistoryRows: histRes.error ? [] : (histRes.data ?? []),
  };
}

/**
 * Fetches all ERP-linked data for a contact in parallel:
 * - Inventory items where this contact is the scribe (active statuses only)
 * - Active investment projects where this contact is the scribe
 * - Sales where this contact is the buyer
 * - Sales where this contact is the seller
 * - All investment projects linked to this contact (for the investments tab)
 */
async function fetchErpData(
  supabase: SupabaseClient,
  contactId: string,
  userId: string
) {
  const [invRes, investActiveRes, salesBuyerRes, salesSellerRes, investAllRes] =
    await Promise.all([
      supabase
        .from("inventory")
        .select("quantity, cost_price, total_cost, amount_paid")
        .eq("scribe_id", contactId)
        .in("status", [...INVENTORY_ACTIVE_STATUSES]),
      supabase
        .from("erp_investments")
        .select("id, total_agreed_price, amount_paid, status")
        .eq("scribe_id", contactId)
        .neq("status", "cancelled")
        .eq("user_id", userId),
      supabase
        .from("erp_sales")
        .select(
          "id, sale_price, quantity, total_price, amount_paid, sale_type, sale_date, item_description, item_id, investment_id, buyer_id, seller_id"
        )
        .eq("buyer_id", contactId)
        .eq("user_id", userId)
        .order("sale_date", { ascending: false }),
      supabase
        .from("erp_sales")
        .select(
          "id, sale_price, quantity, total_price, amount_paid, sale_type, sale_date, item_description, item_id, investment_id, buyer_id, seller_id"
        )
        .eq("seller_id", contactId)
        .eq("user_id", userId)
        .order("sale_date", { ascending: false }),
      supabase
        .from("erp_investments")
        .select(
          "id, item_details, status, total_agreed_price, amount_paid, target_date"
        )
        .eq("scribe_id", contactId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

  return {
    inventoryRows: invRes.data ?? [],
    investmentRowsForBalance: investActiveRes.data ?? [],
    buyerRows: salesBuyerRes.data ?? [],
    sellerRows: salesSellerRes.data ?? [],
    allInvestmentRows: investAllRes.data ?? [],
  };
}

/**
 * Fetches `erp_payments` for a set of related entity IDs (sale IDs + investment IDs)
 * and returns two structures:
 *  - `paymentExtraBySale`: net payment amounts applied to each sale beyond `amount_paid`
 *  - `ledgerRows`: flat list of all payment records, sorted newest-first
 *
 * Short-circuits and returns empty structures when `allEntityIds` is empty.
 */
async function fetchPaymentLedger(
  supabase: SupabaseClient,
  userId: string,
  allEntityIds: string[]
) {
  const paymentExtraBySale = new Map<string, number>();
  const ledgerRows: Array<{
    id: string;
    amount: number;
    payment_date: string;
    entity_type: string;
    entity_id: string;
    direction: string;
    method: string | null;
    notes: string | null;
  }> = [];

  if (allEntityIds.length === 0) return { paymentExtraBySale, ledgerRows };

  const { data: pays } = await supabase
    .from("erp_payments")
    .select(
      "id, entity_id, entity_type, amount, payment_date, direction, method, notes"
    )
    .eq("user_id", userId)
    .in("entity_id", allEntityIds);

  for (const p of pays ?? []) {
    const eid = p.entity_id as string;
    const amt = Number(p.amount ?? 0);
    const signed = (p.direction as string) === "outgoing" ? -amt : amt;

    if ((p.entity_type as string) === "sale") {
      paymentExtraBySale.set(eid, (paymentExtraBySale.get(eid) ?? 0) + signed);
    }

    ledgerRows.push({
      id: p.id as string,
      amount: amt,
      payment_date: (p.payment_date as string) ?? "",
      entity_type: (p.entity_type as string) ?? "",
      entity_id: eid,
      direction: (p.direction as string) ?? "incoming",
      method: (p.method as string | null) ?? null,
      notes: (p.notes as string | null) ?? null,
    });
  }

  ledgerRows.sort(
    (a, b) =>
      new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
  );

  return { paymentExtraBySale, ledgerRows };
}

/**
 * Fetches display metadata for sale items referenced by the buyer's sale rows:
 *  - `invCat`: maps inventory item ID → product category name
 *  - `investDet`: maps investment ID → item details string
 *
 * Both maps are used by `resolveSaleLabel` to build human-readable sale labels.
 * Short-circuits each query when the corresponding ID list is empty.
 */
async function fetchSaleItemMetadata(
  supabase: SupabaseClient,
  buyerRows: Array<{ item_id: string | null; investment_id: string | null }>
) {
  const itemIds = [
    ...new Set(buyerRows.map((r) => r.item_id).filter(Boolean)),
  ] as string[];
  const invIds = [
    ...new Set(buyerRows.map((r) => r.investment_id).filter(Boolean)),
  ] as string[];

  const [invMetaRes, investMetaRes] = await Promise.all([
    itemIds.length > 0
      ? supabase
          .from("inventory")
          .select("id, product_category")
          .in("id", itemIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; product_category: string | null }>,
        }),
    invIds.length > 0
      ? supabase
          .from("erp_investments")
          .select("id, item_details")
          .in("id", invIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; item_details: string | null }>,
        }),
  ]);

  const invCat = new Map(
    (invMetaRes.data ?? []).map((i) => [i.id, i.product_category as string])
  );
  const investDet = new Map(
    (investMetaRes.data ?? []).map((i) => [i.id, i.item_details as string])
  );

  return { invCat, investDet };
}

/**
 * Pure function. Calculates the two-sided financial balance between the
 * business and this contact:
 *  - `debtToContact`: amount owed to them (outstanding inventory costs + active investments)
 *  - `debtFromContact`: amount they owe us (outstanding buyer sales after all payments)
 *
 * Exported so unit tests can exercise the financial logic directly.
 */
export function calculateContactBalance(
  inventoryRows: Array<{
    quantity: number | null;
    cost_price: number | null;
    total_cost: number | null;
    amount_paid: number | null;
  }>,
  investmentRowsForBalance: Array<{
    total_agreed_price: number | null;
    amount_paid: number | null;
    status: string | null;
  }>,
  buyerRows: Array<{
    id: string;
    sale_price: number | null;
    quantity: number | null;
    total_price: number | null;
    amount_paid: number | null;
  }>,
  paymentExtraBySale: Map<string, number>
): { debtToContact: number; debtFromContact: number; futureCommitment: number } {
  let debtToContact = 0;
  let futureCommitment = 0;

  for (const inv of inventoryRows) {
    const total =
      inv.total_cost != null
        ? Number(inv.total_cost)
        : Number(inv.quantity ?? 1) * Number(inv.cost_price ?? 0);
    debtToContact += Math.max(0, total - Number(inv.amount_paid ?? 0));
  }

  for (const inv of investmentRowsForBalance) {
    const remaining = Math.max(
      0,
      Number(inv.total_agreed_price ?? 0) - Number(inv.amount_paid ?? 0)
    );
    const cls = classifyDealBalance(remaining, inv.status);
    if (cls === "actual_debt") debtToContact += remaining;
    else if (cls === "future_commitment") futureCommitment += remaining;
  }

  let debtFromContact = 0;

  for (const s of buyerRows) {
    const qty = Math.max(1, Math.floor(Number(s.quantity ?? 1)));
    const total =
      s.total_price != null
        ? Number(s.total_price)
        : Number(s.sale_price ?? 0) * qty;
    const paid =
      Number(s.amount_paid ?? 0) + (paymentExtraBySale.get(s.id) ?? 0);
    debtFromContact += Math.max(0, total - paid);
  }

  return { debtToContact, debtFromContact, futureCommitment };
}

/**
 * Pure function. Resolves a human-readable display label for a sale row.
 * Resolution priority: brokerage description → project details → inventory category → fallback.
 */
function resolveSaleLabel(
  s: {
    sale_type: string | null;
    item_description: string | null;
    item_id: string | null;
    investment_id: string | null;
  },
  invCat: Map<string, string>,
  investDet: Map<string, string>
): string {
  const saleType = s.sale_type ?? "ממלאי";
  if (saleType === "תיווך") return s.item_description ?? "תיווך";
  if (saleType === "פרויקט חדש" && s.investment_id)
    return investDet.get(s.investment_id) ?? "פרויקט";
  if (s.item_id) return invCat.get(s.item_id) ?? "ממלאי";
  return "מכירה";
}

/**
 * Pure function. Shapes a list of raw sale DB rows into the UI-expected format,
 * computing total price and total paid (including extra payments from erp_payments).
 *
 * Exported so unit tests can exercise the mapping and label-resolution logic directly.
 */
export function buildSalesList(
  rows: Array<{
    id: string;
    sale_price: number | null;
    quantity: number | null;
    total_price: number | null;
    amount_paid: number | null;
    sale_type: string | null;
    sale_date: string | null;
    item_description: string | null;
    item_id: string | null;
    investment_id: string | null;
  }>,
  invCat: Map<string, string>,
  investDet: Map<string, string>,
  paymentExtraBySale: Map<string, number>
): ContactDetailPageData["buyerSales"] {
  return rows.map((s) => {
    const qty = Math.max(1, Math.floor(Number(s.quantity ?? 1)));
    const totalPrice =
      s.total_price != null
        ? Number(s.total_price)
        : Number(s.sale_price ?? 0) * qty;
    const totalPaid =
      Number(s.amount_paid ?? 0) + (paymentExtraBySale.get(s.id) ?? 0);

    return {
      id: s.id,
      sale_type: s.sale_type ?? "ממלאי",
      sale_date: s.sale_date ?? "",
      total_price: totalPrice,
      total_paid: totalPaid,
      label: resolveSaleLabel(s, invCat, investDet),
    };
  });
}

/**
 * Pure function. Annotates each raw payment ledger row with a human-readable
 * `summary` field derived from its linked sale or investment entity.
 */
function buildLedgerForUi(
  ledgerRows: Array<{
    id: string;
    amount: number;
    payment_date: string;
    entity_type: string;
    entity_id: string;
    direction: string;
    method: string | null;
    notes: string | null;
  }>,
  buyerRows: Array<{
    id: string;
    sale_type: string | null;
    item_description: string | null;
    item_id: string | null;
    investment_id: string | null;
  }>,
  sellerRows: Array<{
    id: string;
    sale_type: string | null;
    item_description: string | null;
    item_id: string | null;
    investment_id: string | null;
  }>,
  allInvestmentRows: Array<{ id: string; item_details: string | null }>,
  invCat: Map<string, string>,
  investDet: Map<string, string>
): ContactDetailPageData["ledgerPayments"] {
  return ledgerRows.map((p) => {
    let summary = "";

    if (p.entity_type === "sale") {
      const saleRow = [...buyerRows, ...sellerRows].find(
        (s) => s.id === p.entity_id
      );
      summary = saleRow
        ? `מכירה: ${resolveSaleLabel(saleRow, invCat, investDet)}`
        : "מכירה";
    } else {
      const inv = allInvestmentRows.find((i) => i.id === p.entity_id);
      summary = inv
        ? `השקעה: ${inv.item_details ?? p.entity_id.slice(0, 8)}`
        : "השקעה";
    }

    return { ...p, summary };
  });
}

// ─── Public type and orchestrator ─────────────────────────────────────────────

/** Props-shaped payload for `ContactDetailClient` (single source for the detail page). */
export type ContactDetailPageData = {
  contact: {
    id: string;
    name: string;
    type: string;
    preferred_contact: string;
    wa_chat_id: string | null;
    email: string | null;
    phone: string | null;
    tags: string[];
    notes: string | null;
    certification: string | null;
    phone_type: string | null;
    created_at: string;
    handwriting_image_url: string | null;
  };
  contactHistory: CrmContactHistoryEntry[];
  soferProfile: {
    writing_style: string | null;
    writing_level: string | null;
    handwriting_quality: number | null;
    daily_page_capacity: number | null;
    pricing_notes: string | null;
    writing_constraints: string | null;
    past_writings: string | null;
    community: string | null;
    sample_image_url: string | null;
  } | null;
  debtToContact: number;
  debtFromContact: number;
  futureCommitment: number;
  netMutual: number;
  typeLabel: string;
  ledgerPayments: Array<{
    id: string;
    amount: number;
    payment_date: string;
    entity_type: string;
    entity_id: string;
    direction: string;
    method: string | null;
    notes: string | null;
    summary: string;
  }>;
  buyerSales: Array<{
    id: string;
    sale_type: string;
    sale_date: string;
    total_price: number;
    total_paid: number;
    label: string;
  }>;
  sellerSales: Array<{
    id: string;
    sale_type: string;
    sale_date: string;
    total_price: number;
    total_paid: number;
    label: string;
  }>;
  investments: Array<{
    id: string;
    item_details: string | null;
    status: string;
    total_agreed_price: number;
    amount_paid: number;
    target_date: string | null;
  }>;
  transactions: Array<{
    id: string;
    amount: number;
    type: string;
    description: string | null;
    date: string;
  }>;
  documents: Array<{
    id: string;
    file_url: string;
    doc_type: string;
    name: string | null;
  }>;
  logs: Array<{
    id: string;
    channel: string;
    content: string | null;
    timestamp: string;
    direction: string | null;
  }>;
};

/**
 * Orchestrator for the contact detail page.
 *
 * Delegates all data fetching and computation to focused helpers,
 * then assembles the final `ContactDetailPageData` payload.
 * No query logic lives here.
 */
export type UpsertSoferProfileFields = {
  writing_style?: string | null;
  writing_level?: string | null;
  handwriting_quality?: number | null;
  daily_page_capacity?: number | null;
  pricing_notes?: string | null;
  writing_constraints?: string | null;
  past_writings?: string | null;
  /** קהילה / מוסד (שדה ב-crm_sofer_profiles) */
  community?: string | null;
  /** URL תמונת דוגמת כתב (שדה ב-crm_sofer_profiles) */
  sample_image_url?: string | null;
};

export async function upsertSoferProfile(
  contactId: string,
  fields: UpsertSoferProfileFields
): Promise<{ success: true } | { success: false; error: string }> {
  const { supabase, user } = await getAuthClient();
  if (!user) return { success: false, error: "יש להתחבר" };
  const payload: Record<string, unknown> = {
    contact_id: contactId,
    updated_at: new Date().toISOString(),
  };
  if (fields.writing_style !== undefined) payload.writing_style = fields.writing_style;
  if (fields.writing_level !== undefined) payload.writing_level = fields.writing_level;
  if (fields.handwriting_quality !== undefined) payload.handwriting_quality = fields.handwriting_quality;
  if (fields.daily_page_capacity !== undefined) payload.daily_page_capacity = fields.daily_page_capacity;
  if (fields.pricing_notes !== undefined) payload.pricing_notes = fields.pricing_notes;
  if (fields.writing_constraints !== undefined) payload.writing_constraints = fields.writing_constraints;
  if (fields.past_writings !== undefined) payload.past_writings = fields.past_writings;
  if (fields.community !== undefined) payload.community = fields.community?.trim() || null;
  if (fields.sample_image_url !== undefined) payload.sample_image_url = fields.sample_image_url?.trim() || null;

  const { error } = await supabase
    .from("crm_sofer_profiles")
    .upsert(payload, { onConflict: "contact_id" });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function loadContactDetailPage(
  id: string
): Promise<
  | { success: true; data: ContactDetailPageData }
  | { success: false; error: string }
> {
  const { supabase, user } = await getAuthClient();
  if (!user) return { success: false, error: "יש להתחבר" };

  // 1. Verify the contact exists and is owned by this user.
  const contact = await fetchContactById(supabase, id, user.id);
  if (!contact) {
    console.error(`[CRM] loadContactDetailPage: contact ${id} not found for user ${user.id}`);
    return { success: false, error: "לא נמצא" };
  }

  // 2. Fetch CRM activity, ERP data, and sofer profile in parallel.
  const [crmActivity, erpData, soferRes] = await Promise.all([
    fetchCrmActivity(supabase, id),
    fetchErpData(supabase, id, user.id),
    supabase
      .from("crm_sofer_profiles")
      .select(
        "writing_style, writing_level, handwriting_quality, daily_page_capacity, pricing_notes, writing_constraints, past_writings, community, sample_image_url"
      )
      .eq("contact_id", id)
      .maybeSingle(),
  ]);
  const soferProfile = soferRes.data ?? null;

  const { txRows, docRows, logRows, contactHistoryRows } = crmActivity;
  const { inventoryRows, investmentRowsForBalance, buyerRows, sellerRows, allInvestmentRows } = erpData;

  // 3. Collect all entity IDs needed for payment lookups.
  const allEntityIds = [
    ...new Set([
      ...buyerRows.map((s) => s.id),
      ...sellerRows.map((s) => s.id),
      ...allInvestmentRows.map((i) => i.id),
    ]),
  ];

  // 4. Fetch payment ledger and sale item label metadata in parallel
  //    (both depend on buyerRows / allEntityIds from step 2).
  const [{ paymentExtraBySale, ledgerRows }, { invCat, investDet }] =
    await Promise.all([
      fetchPaymentLedger(supabase, user.id, allEntityIds),
      fetchSaleItemMetadata(supabase, buyerRows),
    ]);

  // 5. Compute financial balances (pure — no I/O).
  const { debtToContact, debtFromContact, futureCommitment } = calculateContactBalance(
    inventoryRows,
    investmentRowsForBalance,
    buyerRows,
    paymentExtraBySale
  );

  // 6. Shape the raw rows into UI-ready lists (pure — no I/O).
  const buyerSales = buildSalesList(buyerRows, invCat, investDet, paymentExtraBySale);
  const sellerSales = buildSalesList(sellerRows, invCat, investDet, paymentExtraBySale);
  const ledgerPayments = buildLedgerForUi(
    ledgerRows,
    buyerRows,
    sellerRows,
    allInvestmentRows,
    invCat,
    investDet
  );

  // 7. Normalize the contact row and assemble the final payload.
  const c = contact as {
    id: string;
    name: string | null;
    type: string | null;
    preferred_contact: string | null;
    wa_chat_id: string | null;
    email: string | null;
    phone: string | null;
    tags: string[] | null;
    notes: string | null;
    certification: string | null;
    phone_type: string | null;
    created_at: string | null;
    handwriting_image_url?: string | null;
  };

  return {
    success: true,
    data: {
      contact: {
        id: c.id,
        name: c.name ?? "",
        type: c.type ?? "Other",
        preferred_contact: c.preferred_contact ?? "WhatsApp",
        wa_chat_id: c.wa_chat_id ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        tags: (c.tags ?? []) as string[],
        notes: c.notes ?? null,
        certification: c.certification ?? null,
        phone_type: c.phone_type ?? null,
        created_at: c.created_at ?? "",
        handwriting_image_url: c.handwriting_image_url ?? null,
      },
      contactHistory: contactHistoryRows.map((h) =>
        mapContactHistoryRow(h as Record<string, unknown>)
      ),
      soferProfile: soferProfile
        ? {
            writing_style: soferProfile.writing_style ?? null,
            writing_level: soferProfile.writing_level ?? null,
            handwriting_quality:
              soferProfile.handwriting_quality != null
                ? Number(soferProfile.handwriting_quality)
                : null,
            daily_page_capacity: soferProfile.daily_page_capacity ? Number(soferProfile.daily_page_capacity) : null,
            pricing_notes: soferProfile.pricing_notes ?? null,
            writing_constraints: soferProfile.writing_constraints ?? null,
            past_writings: soferProfile.past_writings ?? null,
            community: soferProfile.community ?? null,
            sample_image_url: soferProfile.sample_image_url ?? null,
          }
        : null,
      debtToContact,
      debtFromContact,
      futureCommitment,
      netMutual: debtFromContact - debtToContact,
      typeLabel: CONTACT_TYPE_LABELS[c.type ?? "Other"] ?? c.type ?? "אחר",
      ledgerPayments,
      buyerSales,
      sellerSales,
      investments: allInvestmentRows.map((i) => ({
        id: i.id,
        item_details: i.item_details ?? null,
        status: i.status ?? "",
        total_agreed_price: Number(i.total_agreed_price ?? 0),
        amount_paid: Number(i.amount_paid ?? 0),
        target_date: i.target_date ?? null,
      })),
      transactions: txRows.map((t) => ({
        id: t.id,
        amount: Number(t.amount ?? 0),
        type: t.type ?? "",
        description: t.description ?? null,
        date: t.date ?? "",
      })),
      documents: docRows.map((d) => ({
        id: d.id,
        file_url: d.file_url ?? "",
        doc_type: d.doc_type ?? "Other",
        name: d.name ?? null,
      })),
      logs: logRows.map((l) => ({
        id: l.id,
        channel: l.channel ?? "",
        content: l.content ?? null,
        timestamp: l.timestamp ?? "",
        direction: (l.direction as string | null) ?? null,
      })),
    },
  };
}

// ─── Deduplication / Merge ────────────────────────────────────────────────────

export type DuplicateGroup = {
  reason: "phone" | "email" | "name";
  contacts: CrmContact[];
};

function normPhone(p: string | null | undefined): string {
  return (p ?? "").replace(/\D/g, "").slice(-9);
}

function nameSimilar(a: string, b: string): boolean {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return true;
  if (la.includes(lb) || lb.includes(la)) return true;
  if (Math.abs(la.length - lb.length) > 3) return false;
  let prev = Array.from({ length: lb.length + 1 }, (_, i) => i);
  for (let i = 1; i <= la.length; i++) {
    const curr = [i];
    for (let j = 1; j <= lb.length; j++) {
      curr[j] =
        la[i - 1] === lb[j - 1]
          ? prev[j - 1]
          : Math.min(prev[j - 1], prev[j], curr[j - 1]) + 1;
    }
    prev = curr;
  }
  return prev[lb.length] <= 2;
}

export async function findDuplicateCrmContacts(): Promise<
  { success: true; groups: DuplicateGroup[] } | { success: false; error: string }
> {
  try {
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_contacts")
      .select(
        "id, name, type, preferred_contact, wa_chat_id, email, phone, tags, notes, certification, phone_type, created_at"
      )
      .eq("user_id", user.id)
      .order("name");
    if (error) return { success: false, error: handleSupabaseError(error) };

    const contacts: CrmContact[] = (data ?? []).map(mapContact);
    const groups: DuplicateGroup[] = [];
    const usedIds = new Set<string>();

    // Phone duplicates
    const phoneMap = new Map<string, CrmContact[]>();
    for (const c of contacts) {
      const p = normPhone(c.phone);
      if (!p || p.length < 7) continue;
      const arr = phoneMap.get(p) ?? [];
      arr.push(c);
      phoneMap.set(p, arr);
    }
    for (const arr of phoneMap.values()) {
      if (arr.length < 2) continue;
      arr.forEach((c) => usedIds.add(c.id));
      groups.push({ reason: "phone", contacts: arr });
    }

    // Email duplicates
    const emailMap = new Map<string, CrmContact[]>();
    for (const c of contacts) {
      const e = (c.email ?? "").toLowerCase().trim();
      if (!e) continue;
      const arr = emailMap.get(e) ?? [];
      arr.push(c);
      emailMap.set(e, arr);
    }
    for (const arr of emailMap.values()) {
      if (arr.length < 2) continue;
      const newOnes = arr.filter((c) => !usedIds.has(c.id));
      if (newOnes.length < 2) continue;
      newOnes.forEach((c) => usedIds.add(c.id));
      groups.push({ reason: "email", contacts: newOnes });
    }

    // Name similarity
    const remaining = contacts.filter((c) => !usedIds.has(c.id));
    const nameGrouped = new Set<string>();
    for (let i = 0; i < remaining.length; i++) {
      if (nameGrouped.has(remaining[i].id)) continue;
      const group: CrmContact[] = [remaining[i]];
      for (let j = i + 1; j < remaining.length; j++) {
        if (!nameGrouped.has(remaining[j].id) && nameSimilar(remaining[i].name, remaining[j].name)) {
          group.push(remaining[j]);
        }
      }
      if (group.length > 1) {
        group.forEach((c) => nameGrouped.add(c.id));
        groups.push({ reason: "name", contacts: group });
      }
    }

    return { success: true, groups };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

type ExtraContactLine = { label: string; value: string };

function parseExtraContactJson(raw: unknown): ExtraContactLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
    .map((x) => ({
      label: String(x.label ?? ""),
      value: String(x.value ?? "").trim(),
    }))
    .filter((x) => x.value.length > 0);
}

function mergeExtraContactLines(primary: unknown, dupValues: unknown[]): ExtraContactLine[] {
  const seen = new Set<string>();
  const out: ExtraContactLine[] = [];
  const push = (arr: ExtraContactLine[]) => {
    for (const it of arr) {
      const k = it.value.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
  };
  push(parseExtraContactJson(primary));
  for (const d of dupValues) push(parseExtraContactJson(d));
  return out;
}

function coalesceText(
  primary: string | null | undefined,
  fallbacks: (string | null | undefined)[]
): string | null {
  const p = (primary ?? "").trim();
  if (p) return p;
  for (const f of fallbacks) {
    const t = (f ?? "").trim();
    if (t) return t;
  }
  return null;
}

export async function mergeCrmContacts(
  primaryId: string,
  duplicateIds: string[]
): Promise<{ success: true; merged: number } | { success: false; error: string }> {
  try {
    if (!duplicateIds.length) return { success: true, merged: 0 };
    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: contactRows, error: fetchErr } = await supabase
      .from("crm_contacts")
      .select(
        "id, name, email, phone, wa_chat_id, tags, type, notes, certification, phone_type, preferred_contact, city, address, handwriting_image_url, extra_phones, extra_emails"
      )
      .eq("user_id", user.id)
      .in("id", [primaryId, ...duplicateIds]);
    if (fetchErr) return { success: false, error: handleSupabaseError(fetchErr) };

    const primary = (contactRows ?? []).find((c) => c.id === primaryId);
    if (!primary) return { success: false, error: "איש הקשר הראשי לא נמצא" };

    const dups = (contactRows ?? []).filter((c) => duplicateIds.includes(c.id));

    const altNames = dups
      .map((d) => (d.name ?? "").trim())
      .filter((n) => n && n !== (primary.name ?? "").trim());
    const uniqAlt = [...new Set(altNames)];
    const baseNotes = [(primary.notes ?? "").trim(), ...dups.map((d) => (d.notes ?? "").trim())].filter(
      Boolean
    );
    let mergedNotes = [...new Set(baseNotes)].join("\n\n—\n\n") || null;
    if (uniqAlt.length > 0) {
      const line = `שמות נוספים (מיזוג): ${uniqAlt.join(", ")}`;
      mergedNotes = mergedNotes ? `${mergedNotes}\n\n${line}` : line;
    }

    const patchEmail = coalesceText(primary.email as string | null, dups.map((d) => d.email as string | null));
    const patchPhone = coalesceText(primary.phone as string | null, dups.map((d) => d.phone as string | null));
    const patchWa = coalesceText(primary.wa_chat_id as string | null, dups.map((d) => d.wa_chat_id as string | null));
    const patchCert = coalesceText(
      primary.certification as string | null,
      dups.map((d) => d.certification as string | null)
    );
    const patchPhoneType = coalesceText(
      primary.phone_type as string | null,
      dups.map((d) => d.phone_type as string | null)
    );
    const patchCity = coalesceText(primary.city as string | null, dups.map((d) => d.city as string | null));
    const patchAddress = coalesceText(
      primary.address as string | null,
      dups.map((d) => d.address as string | null)
    );
    const patchHw = coalesceText(
      primary.handwriting_image_url as string | null,
      dups.map((d) => d.handwriting_image_url as string | null)
    );
    const patchPreferred =
      (primary.preferred_contact as string | null)?.trim() ||
      dups.find((d) => (d.preferred_contact as string | null)?.trim())?.preferred_contact ||
      "WhatsApp";

    const mergedTags = [
      ...new Set([
        ...((primary.tags as string[]) ?? []),
        ...dups.flatMap((d) => (d.tags as string[]) ?? []),
      ]),
    ];

    const mergedExtraPhones = mergeExtraContactLines(
      primary.extra_phones,
      dups.map((d) => d.extra_phones)
    );
    const mergedExtraEmails = mergeExtraContactLines(
      primary.extra_emails,
      dups.map((d) => d.extra_emails)
    );

    const soferKeys = [
      "writing_style",
      "writing_level",
      "handwriting_quality",
      "daily_page_capacity",
      "pricing_notes",
      "writing_constraints",
      "past_writings",
      "community",
      "sample_image_url",
      "last_contact_date",
    ] as const;

    for (const dup of dups) {
      const { data: curPrim } = await supabase
        .from("crm_sofer_profiles")
        .select("*")
        .eq("contact_id", primaryId)
        .maybeSingle();

      const { data: dupProf } = await supabase
        .from("crm_sofer_profiles")
        .select("*")
        .eq("contact_id", dup.id)
        .maybeSingle();
      if (!dupProf) continue;

      if (!curPrim) {
        const copy: Record<string, unknown> = { contact_id: primaryId };
        for (const k of soferKeys) copy[k] = dupProf[k] ?? null;
        await supabase.from("crm_sofer_profiles").upsert(copy, { onConflict: "contact_id" });
      } else {
        const patch: Record<string, unknown> = {};
        for (const k of soferKeys) {
          const pv = curPrim[k];
          const dv = dupProf[k];
          const hasP = pv != null && String(pv).trim() !== "";
          if (!hasP && dv != null && String(dv).trim() !== "") patch[k] = dv;
        }
        if (Object.keys(patch).length > 0) {
          await supabase.from("crm_sofer_profiles").update(patch).eq("contact_id", primaryId);
        }
      }
      await supabase.from("crm_sofer_profiles").delete().eq("contact_id", dup.id);
    }

    const { error: upErr } = await supabase
      .from("crm_contacts")
      .update({
        email: patchEmail,
        phone: patchPhone,
        wa_chat_id: patchWa,
        tags: mergedTags,
        notes: mergedNotes,
        certification: patchCert,
        phone_type: patchPhoneType,
        preferred_contact: patchPreferred,
        city: patchCity,
        address: patchAddress,
        handwriting_image_url: patchHw,
        extra_phones: mergedExtraPhones,
        extra_emails: mergedExtraEmails,
        updated_at: new Date().toISOString(),
      })
      .eq("id", primaryId)
      .eq("user_id", user.id);
    if (upErr) return { success: false, error: handleSupabaseError(upErr) };

    if ((primary.type as string) === "Scribe") {
      await ensureSoferProfileRow(supabase, primaryId);
    }

    const FK_TABLES: Array<{ table: string; column: string }> = [
      { table: "erp_sales", column: "buyer_id" },
      { table: "erp_sales", column: "seller_id" },
      { table: "erp_sales", column: "scribe_id" },
      { table: "crm_transactions", column: "contact_id" },
      { table: "crm_documents", column: "contact_id" },
      { table: "crm_communication_logs", column: "contact_id" },
      { table: "crm_contact_history", column: "contact_id" },
      { table: "inventory", column: "scribe_id" },
      { table: "torah_projects", column: "client_id" },
      { table: "torah_projects", column: "scribe_id" },
      { table: "torah_projects", column: "current_holder_id" },
      { table: "market_torah_books", column: "sofer_id" },
      { table: "market_torah_books", column: "dealer_id" },
      { table: "crm_scribe_gallery", column: "contact_id" },
      { table: "crm_contact_identities", column: "contact_id" },
      { table: "crm_merge_suggestions", column: "contact_id_a" },
      { table: "crm_merge_suggestions", column: "contact_id_b" },
      { table: "torah_qa_batches", column: "magiah_id" },
    ];

    for (const dupId of duplicateIds) {
      for (const { table, column } of FK_TABLES) {
        const { error: fkErr } = await supabase
          .from(table as "erp_sales")
          .update({ [column]: primaryId } as never)
          .eq(column, dupId);
        if (fkErr) {
          logError("CRM", "mergeCrmContacts: FK remap failed", {
            table,
            column,
            dupId,
            message: fkErr.message,
          });
        }
      }
      const { error: delErr } = await supabase
        .from("crm_contacts")
        .delete()
        .eq("id", dupId)
        .eq("user_id", user.id);
      if (delErr) {
        logError("CRM", "mergeCrmContacts: delete dup failed", {
          dupId,
          message: delErr.message,
        });
      }
    }

    logInfo("CRM", "mergeCrmContacts: merged", { primaryId, duplicateIds });
    return { success: true, merged: duplicateIds.length };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}

export async function bulkDeleteCrmContacts(
  ids: string[]
): Promise<
  | { success: true; deleted: number; blocked: { id: string; reason: string }[] }
  | { success: false; error: string }
> {
  try {
    const cleaned = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
    if (cleaned.length === 0) return { success: true, deleted: 0, blocked: [] };

    const { supabase, user } = await getAuthClient();
    if (!user) return { success: false, error: "יש להתחבר" };

    const blocked: { id: string; reason: string }[] = [];
    let deleted = 0;

    for (const cid of cleaned) {
      const { count: tpScribe } = await supabase
        .from("torah_projects")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("scribe_id", cid);
      if (tpScribe && tpScribe > 0) {
        blocked.push({ id: cid, reason: "משויך כסופר לפרויקט ספר תורה" });
        continue;
      }
      const { count: tpClient } = await supabase
        .from("torah_projects")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("client_id", cid);
      if (tpClient && tpClient > 0) {
        blocked.push({ id: cid, reason: "משויך כלקוח לפרויקט ספר תורה" });
        continue;
      }

      const { error: delErr } = await supabase
        .from("crm_contacts")
        .delete()
        .eq("id", cid)
        .eq("user_id", user.id);

      if (delErr) {
        blocked.push({ id: cid, reason: delErr.message || "לא ניתן למחוק" });
        continue;
      }
      deleted++;
    }

    return { success: true, deleted, blocked };
  } catch (err) {
    return { success: false, error: toErrorMessage(err) };
  }
}
