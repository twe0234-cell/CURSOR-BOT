"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { inventoryItemSchema } from "@/lib/validations/inventory";
import { logError, logInfo } from "@/lib/logger";

type ActionResult = { success: true } | { success: false; error: string };

export type InventoryItem = {
  id: string;
  user_id: string | null;
  product_category: string | null;
  category_meta: Record<string, unknown> | null;
  script_type: string | null;
  status: string | null;
  cost_price: number | null;
  target_price: number | null;
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
      .select("id, user_id, product_category, category_meta, script_type, status, cost_price, target_price, scribe_id, scribe_code, images, description")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const items = (data ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      product_category: r.product_category ?? null,
      category_meta: (r.category_meta ?? null) as Record<string, unknown> | null,
      script_type: r.script_type ?? null,
      status: r.status ?? null,
      cost_price: r.cost_price != null ? Number(r.cost_price) : null,
      target_price: r.target_price != null ? Number(r.target_price) : null,
      scribe_id: r.scribe_id ?? null,
      scribe_code: r.scribe_code ?? null,
      images: (r.images ?? null) as string[] | null,
      description: r.description ?? null,
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
    const parsed = inventoryItemSchema.safeParse(item);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().formErrors[0] ?? "נתונים לא תקינים" };
    }
    const data = parsed.data;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר" };
    }

    const imagesValue = data.images == null || (Array.isArray(data.images) && data.images.length === 0)
      ? []
      : data.images;

    const { error } = await supabase.from("inventory").insert({
      user_id: user.id,
      product_category: data.product_category ?? null,
      category_meta: data.category_meta ?? {},
      script_type: data.script_type ?? null,
      status: data.status ?? "available",
      cost_price: data.cost_price ?? null,
      target_price: data.target_price ?? null,
      scribe_id: data.scribe_id ?? null,
      scribe_code: data.scribe_code ?? null,
      images: imagesValue,
      description: data.description ?? null,
    });

    if (error) {
      logError("Inventory", "createInventoryItem DB error", { error: error.message, userId: user.id });
      return { success: false, error: error.message };
    }

    revalidatePath("/inventory");
    logInfo("Inventory", "createInventoryItem completed", { userId: user.id, product_category: data.product_category });
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    logError("Inventory", "createInventoryItem failed", { error: String(err) });
    return { success: false, error: msg };
  }
}

export async function updateInventoryItem(
  id: string,
  item: Partial<InventoryItem>
): Promise<ActionResult> {
  try {
    const parsed = inventoryItemSchema.safeParse(item);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().formErrors[0] ?? "נתונים לא תקינים" };
    }
    const data = parsed.data;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר" };
    }

    const imagesValue = data.images == null || (Array.isArray(data.images) && data.images.length === 0)
      ? []
      : data.images;

    const { error } = await supabase
      .from("inventory")
      .update({
        product_category: data.product_category ?? null,
        category_meta: data.category_meta ?? {},
        script_type: data.script_type ?? null,
        status: data.status ?? null,
        cost_price: data.cost_price ?? null,
        target_price: data.target_price ?? null,
        scribe_id: data.scribe_id ?? null,
        scribe_code: data.scribe_code ?? null,
        images: imagesValue,
        description: data.description ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      logError("Inventory", "updateInventoryItem DB error", { error: error.message, id, userId: user.id });
      return { success: false, error: error.message };
    }

    revalidatePath("/inventory");
    logInfo("Inventory", "updateInventoryItem completed", { id, userId: user.id });
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    logError("Inventory", "updateInventoryItem failed", { error: String(err) });
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
    logError("Inventory", "uploadInventoryImage failed", { error: String(err) });
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
      logError("Inventory", "deleteInventoryItem DB error", { error: error.message, id, userId: user.id });
      return { success: false, error: error.message };
    }

    revalidatePath("/inventory");
    logInfo("Inventory", "deleteInventoryItem completed", { id, userId: user.id });
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    logError("Inventory", "deleteInventoryItem failed", { error: String(err) });
    return { success: false, error: msg };
  }
}
