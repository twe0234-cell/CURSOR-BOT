"use server";

import { z } from "zod";
import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateSku, crmSkuPrefix } from "@/lib/sku";

const createScribeSchema = z.object({
  name: z.string().min(1, "שם נדרש").trim(),
  phone: z.string().optional().nullable().transform((v) => (v && String(v).trim()) || null),
  city: z.string().optional().nullable().transform((v) => (v && String(v).trim()) || null),
  email: z.string().optional().nullable().transform((v) => (v && String(v).trim()) || null),
});

export type ScribeResult = {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
};

export async function createScribeAction(data: {
  name: string;
  phone?: string | null;
  city?: string | null;
  email?: string | null;
}): Promise<
  { success: true; scribe: ScribeResult } | { success: false; error: string }
> {
  try {
    const parsed = createScribeSchema.safeParse(data);
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors[0];
      return { success: false, error: msg ?? "נתונים לא תקינים" };
    }

    const { name, phone, city, email } = parsed.data;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      name,
      type: "Scribe",
      preferred_contact: "WhatsApp",
      phone: phone ?? null,
      email: email ?? null,
      notes: city ? `עיר: ${city}` : null,
      sku: generateSku(crmSkuPrefix),
    };

    const { data: inserted, error } = await supabase
      .from("crm_contacts")
      .insert(insertPayload)
      .select("id, name, phone, notes")
      .single();

    if (error) return { success: false, error: error.message };
    if (!inserted?.id) return { success: false, error: "לא התקבל מזהה" };

    revalidatePath("/crm");
    revalidatePath("/inventory");
    revalidatePath("/investments");
    revalidatePath("/market");
    revalidatePath("/soferim");

    const cityVal = inserted.notes?.startsWith("עיר: ")
      ? inserted.notes.slice(5).trim() || null
      : null;

    return {
      success: true,
      scribe: {
        id: inserted.id,
        name: inserted.name ?? "",
        phone: inserted.phone ?? null,
        city: cityVal,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "שגיאה",
    };
  }
}
