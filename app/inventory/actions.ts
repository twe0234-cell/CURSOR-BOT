"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ActionResult = { success: true } | { success: false; error: string };

export type InventoryItem = {
  id: string;
  user_id: string | null;
  product_type: string | null;
  item_type: string | null;
  script_type: string | null;
  hidur_level: string | null;
  status: string | null;
  cost_price: number | null;
  target_price: number | null;
  category: string | null;
  category_meta: Record<string, unknown> | null;
  scribe_id: string | null;
  scribe_code: string | null;
  images: string[] | null;
  description: string | null;
};

const MEDIA_BUCKET = "media";
const IMAGE_SIZE_LIMIT_BYTES = 5 * 1024 * 1024; // 5MB

export async function fetchInventory(): Promise<
  { success: true; items: InventoryItem[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר" };
    }

    const { data, error } = await supabase
      .from("inventory")
      .select("id, user_id, product_type, item_type, script_type, hidur_level, status, cost_price, target_price, category, category_meta, scribe_id, scribe_code, images, description")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const items = (data ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      product_type: r.product_type,
      item_type: r.item_type,
      script_type: r.script_type,
      hidur_level: r.hidur_level,
      status: r.status,
      cost_price: r.cost_price != null ? Number(r.cost_price) : null,
      target_price: r.target_price != null ? Number(r.target_price) : null,
      category: r.category ?? null,
      category_meta: (r.category_meta ?? null) as Record<string, unknown> | null,
      scribe_id: r.scribe_id ?? null,
      scribe_code: r.scribe_code ?? null,
      images: (r.images ?? null) as string[] | null,
      description: r.description,
    }));

    return { success: true, items };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}

export async function createInventoryItem(
  item: Partial<InventoryItem>
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר" };
    }

    const { error } = await supabase.from("inventory").insert({
      user_id: user.id,
      product_type: item.product_type ?? item.item_type ?? "פריט",
      item_type: item.item_type ?? item.product_type,
      script_type: item.script_type,
      hidur_level: item.hidur_level,
      status: item.status ?? "available",
      cost_price: item.cost_price,
      target_price: item.target_price,
      category: item.category,
      category_meta: item.category_meta ?? {},
      scribe_id: item.scribe_id ?? null,
      scribe_code: item.scribe_code ?? null,
      images: item.images ?? [],
      description: item.description,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/inventory");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}

export async function updateInventoryItem(
  id: string,
  item: Partial<InventoryItem>
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר" };
    }

    const { error } = await supabase
      .from("inventory")
      .update({
        product_type: item.product_type ?? item.item_type,
        item_type: item.item_type,
        script_type: item.script_type,
        hidur_level: item.hidur_level,
        status: item.status,
        cost_price: item.cost_price,
        target_price: item.target_price,
        category: item.category,
        category_meta: item.category_meta ?? {},
        scribe_id: item.scribe_id ?? null,
        scribe_code: item.scribe_code ?? null,
        images: item.images ?? [],
        description: item.description,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/inventory");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}

export type UploadImageResult =
  | { success: true; url: string }
  | { success: false; error: string };

export async function uploadInventoryImage(formData: FormData): Promise<UploadImageResult> {
  try {
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return { success: false, error: "לא נבחר קובץ" };
    }
    if (file.size > IMAGE_SIZE_LIMIT_BYTES) {
      return { success: false, error: "התמונה חורגת ממגבלת 5MB" };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const ext = file.name.split(".").pop() || "jpg";
    const path = `inventory/${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });

    if (error) return { success: false, error: error.message };

    const { data: { publicUrl } } = supabase.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(path);

    return { success: true, url: publicUrl };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה בהעלאה" };
  }
}

export async function deleteInventoryItem(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר" };
    }

    const { error } = await supabase
      .from("inventory")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/inventory");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}
