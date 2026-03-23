"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logError } from "@/lib/logger";
import { soferProfileUpsertSchema, newScribeContactSchema } from "@/lib/validations/soferim";
import { resolveContentType } from "@/lib/upload";

const MEDIA_BUCKET = "media";
const IMAGE_SIZE_LIMIT_BYTES = 5 * 1024 * 1024;

export type SoferDirectoryRow = {
  contact_id: string;
  name: string;
  phone: string | null;
  writing_style: string | null;
  writing_level: string | null;
  sample_image_url: string | null;
  last_contact_date: string | null;
  daily_page_capacity: number | null;
  pricing_notes: string | null;
  has_profile: boolean;
};

export async function fetchSoferimDirectory(): Promise<
  { success: true; rows: SoferDirectoryRow[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: contacts, error: cErr } = await supabase
      .from("crm_contacts")
      .select("id, name, phone")
      .eq("user_id", user.id)
      .eq("type", "Scribe")
      .order("name");

    if (cErr) return { success: false, error: cErr.message };

    const ids = (contacts ?? []).map((c) => c.id);
    if (ids.length === 0) return { success: true, rows: [] };

    const { data: profiles, error: pErr } = await supabase
      .from("crm_sofer_profiles")
      .select(
        "contact_id, writing_style, writing_level, sample_image_url, last_contact_date, daily_page_capacity, pricing_notes"
      )
      .in("contact_id", ids);

    if (pErr) return { success: false, error: pErr.message };

    const pmap = new Map((profiles ?? []).map((p) => [p.contact_id as string, p]));

    const rows: SoferDirectoryRow[] = (contacts ?? []).map((c) => {
      const p = pmap.get(c.id);
      return {
        contact_id: c.id,
        name: c.name ?? "",
        phone: c.phone ?? null,
        writing_style: p?.writing_style ?? null,
        writing_level: p?.writing_level ?? null,
        sample_image_url: p?.sample_image_url ?? null,
        last_contact_date: p?.last_contact_date ?? null,
        daily_page_capacity:
          p?.daily_page_capacity != null ? Number(p.daily_page_capacity) : null,
        pricing_notes: p?.pricing_notes ?? null,
        has_profile: Boolean(p),
      };
    });

    return { success: true, rows };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function fetchScribeContactsForSelect(): Promise<
  { success: true; contacts: { id: string; name: string }[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_contacts")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("type", "Scribe")
      .order("name");

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      contacts: (data ?? []).map((r) => ({ id: r.id, name: r.name ?? "" })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export type UploadSoferSampleResult =
  | { success: true; url: string }
  | { success: false; error: string };

export async function uploadSoferSampleImage(formData: FormData): Promise<UploadSoferSampleResult> {
  try {
    const raw = formData.get("file");
    if (raw == null || typeof raw !== "object" || !(raw instanceof Blob)) {
      return { success: false, error: "לא נבחר קובץ" };
    }
    const blob = raw as Blob;
    if (blob.size > IMAGE_SIZE_LIMIT_BYTES) {
      return { success: false, error: "התמונה חורגת ממגבלת 5MB" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const name = raw instanceof File && raw.name ? raw.name : "sample.jpg";
    const ext = name.split(".").pop() || "jpg";
    const path = `sofer-samples/${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, {
      contentType: resolveContentType(raw as File | Blob),
      upsert: true,
    });

    if (error) {
      logError("Soferim", "uploadSoferSampleImage", { message: error.message });
      throw new Error(error.message);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    return { success: true, url: publicUrl };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "שגיאה בהעלאה",
    };
  }
}

export async function upsertSoferProfile(
  input: Record<string, unknown>
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const parsed = soferProfileUpsertSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().formErrors[0] ?? "נתונים לא תקינים" };
    }
    const v = parsed.data;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("id", v.contact_id)
      .eq("user_id", user.id)
      .eq("type", "Scribe")
      .maybeSingle();

    if (!contact) {
      return { success: false, error: "איש קשר לא נמצא או אינו מסוג סופר" };
    }

    const sampleUrl =
      v.sample_image_url && v.sample_image_url.length > 0 ? v.sample_image_url : null;

    const { error } = await supabase.from("crm_sofer_profiles").upsert(
      {
        contact_id: v.contact_id,
        writing_style: v.writing_style ?? null,
        writing_level: v.writing_level ?? null,
        sample_image_url: sampleUrl,
        daily_page_capacity: v.daily_page_capacity ?? null,
        pricing_notes: v.pricing_notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "contact_id" }
    );

    if (error) return { success: false, error: error.message };

    revalidatePath("/soferim");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function createScribeContactAndProfile(
  payload: Record<string, unknown>,
  profileFields: Record<string, unknown>
): Promise<{ success: true; contact_id: string } | { success: false; error: string }> {
  try {
    const parsedContact = newScribeContactSchema.safeParse(payload);
    if (!parsedContact.success) {
      return { success: false, error: parsedContact.error.flatten().formErrors[0] ?? "נתונים לא תקינים" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: inserted, error: insErr } = await supabase
      .from("crm_contacts")
      .insert({
        user_id: user.id,
        name: parsedContact.data.name,
        phone: parsedContact.data.phone ?? null,
        type: "Scribe",
        preferred_contact: "WhatsApp",
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      return { success: false, error: insErr?.message ?? "שגיאה ביצירת איש קשר" };
    }

    const merged = { ...profileFields, contact_id: inserted.id };
    const up = await upsertSoferProfile(merged);
    if (!up.success) {
      await supabase.from("crm_contacts").delete().eq("id", inserted.id);
      return { success: false, error: up.error };
    }

    revalidatePath("/soferim");
    return { success: true, contact_id: inserted.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function updateSoferLastContact(contactId: string): Promise<
  { success: true } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("id", contactId)
      .eq("user_id", user.id)
      .eq("type", "Scribe")
      .maybeSingle();

    if (!contact) return { success: false, error: "איש קשר לא נמצא" };

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const { error } = await supabase.from("crm_sofer_profiles").upsert(
      {
        contact_id: contactId,
        last_contact_date: today,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "contact_id" }
    );

    if (error) return { success: false, error: error.message };

    revalidatePath("/soferim");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}
