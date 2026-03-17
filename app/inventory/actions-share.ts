"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ActionResult = { success: true; link?: string } | { success: false; error: string };

/** Toggle is_public for an item. When enabling, generates public_slug if missing and returns share link. */
export async function toggleInventoryShare(itemId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: item, error: fetchErr } = await supabase
      .from("inventory")
      .select("id, is_public, public_slug")
      .eq("id", itemId)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !item) return { success: false, error: "פריט לא נמצא" };

    const newPublic = !(item.is_public ?? false);
    let slug = item.public_slug;

    if (newPublic && !slug) {
      slug = crypto.randomUUID();
    }

    const { error: updateErr } = await supabase
      .from("inventory")
      .update({
        is_public: newPublic,
        public_slug: newPublic ? slug : item.public_slug,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .eq("user_id", user.id);

    if (updateErr) return { success: false, error: updateErr.message };

    revalidatePath("/inventory");

    if (newPublic && slug) {
      return { success: true, link: `/p/${slug}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
