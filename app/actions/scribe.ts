"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ScribeResult = {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
};

export async function createScribeAction(data: {
  name: string;
  phone?: string;
  city?: string;
}): Promise<
  { success: true; scribe: ScribeResult } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: inserted, error } = await supabase
      .from("crm_contacts")
      .insert({
        user_id: user.id,
        name: data.name.trim(),
        type: "Scribe",
        preferred_contact: "WhatsApp",
        phone: data.phone?.trim() || null,
        notes: data.city?.trim() ? `עיר: ${data.city.trim()}` : null,
      })
      .select("id, name, phone, notes")
      .single();

    if (error) return { success: false, error: error.message };

    revalidatePath("/crm");
    revalidatePath("/inventory");

    const city = inserted.notes?.startsWith("עיר: ")
      ? inserted.notes.slice(5).trim() || null
      : null;

    return {
      success: true,
      scribe: {
        id: inserted.id,
        name: inserted.name ?? "",
        phone: inserted.phone ?? null,
        city,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "שגיאה",
    };
  }
}
