"use server";

import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function fetchGalleryImages(contactId: string): Promise<
  | { success: true; images: { id: string; image_url: string; caption: string | null; sort_order: number }[] }
  | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_scribe_gallery")
      .select("id, image_url, caption, sort_order")
      .eq("contact_id", contactId)
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, images: data ?? [] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function uploadGalleryImage(formData: FormData): Promise<
  { success: true; id: string } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const file = formData.get("file") as File | null;
    const contactId = formData.get("contactId") as string;
    const caption = (formData.get("caption") as string | null)?.trim() || null;

    if (!file || !file.size) return { success: false, error: "קובץ לא תקין" };
    if (!contactId) return { success: false, error: "contact_id חסר" };

    // Verify contact belongs to user
    const { data: contact } = await supabase.from("crm_contacts").select("id")
      .eq("id", contactId).eq("user_id", user.id).maybeSingle();
    if (!contact) return { success: false, error: "איש קשר לא נמצא" };

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `gallery/${user.id}/${contactId}/${Date.now()}.${ext}`;

    const admin = createAdminClient();
    if (!admin) {
      return { success: false, error: "העלאה לא זמינה — חסר מפתח שירות (SUPABASE_SERVICE_ROLE_KEY)" };
    }
    const { error: uploadErr } = await admin.storage.from("media").upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (uploadErr) return { success: false, error: uploadErr.message };

    const { data: urlData } = admin.storage.from("media").getPublicUrl(path);

    const { data: row, error: dbErr } = await supabase.from("crm_scribe_gallery").insert({
      user_id: user.id,
      contact_id: contactId,
      image_url: urlData.publicUrl,
      caption,
    }).select("id").single();

    if (dbErr) return { success: false, error: dbErr.message };
    revalidatePath(`/crm/${contactId}`);
    return { success: true, id: row.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function deleteGalleryImage(imageId: string): Promise<
  { success: true } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase.from("crm_scribe_gallery").delete()
      .eq("id", imageId).eq("user_id", user.id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function updateCrmExtraContacts(
  contactId: string,
  extraPhones: { label: string; value: string }[],
  extraEmails: { label: string; value: string }[]
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("crm_contacts")
      .update({
        extra_phones: extraPhones,
        extra_emails: extraEmails,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contactId)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };
    revalidatePath(`/crm/${contactId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}
