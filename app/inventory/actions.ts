"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { inventoryItemSchema } from "@/lib/validations/inventory";
import { logError, logInfo } from "@/lib/logger";
import { generateInventorySku } from "@/lib/inventory/sku";

type ActionResult = { success: true } | { success: false; error: string };

export type InventoryItem = {
  id: string;
  sku: string | null;
  user_id: string | null;
  product_category: string | null;
  purchase_date: string | null;
  category_meta: Record<string, unknown> | null;
  script_type: string | null;
  status: string | null;
  quantity: number;
  cost_price: number | null;
  total_cost: number | null;
  amount_paid: number;
  target_price: number | null;
  total_target_price: number | null;
  scribe_id: string | null;
  scribe_code: string | null;
  images: string[] | null;
  description: string | null;
  parchment_type: string | null;
  computer_proofread: boolean;
  human_proofread: boolean;
  is_sewn: boolean;
  is_public?: boolean;
  public_slug?: string | null;
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
      .select("id, sku, user_id, product_category, purchase_date, category_meta, script_type, status, quantity, cost_price, total_cost, amount_paid, target_price, total_target_price, scribe_id, scribe_code, images, description, parchment_type, computer_proofread, human_proofread, is_sewn, is_public, public_slug")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const items = (data ?? []).map((r) => {
      const qty = Number(r.quantity ?? 1);
      const cost = r.cost_price != null ? Number(r.cost_price) : null;
      const paid = Number(r.amount_paid ?? 0);
      const total = r.total_cost != null ? Number(r.total_cost) : (cost != null ? qty * cost : null);
      return {
        id: r.id,
        sku: r.sku ?? null,
        user_id: r.user_id,
        product_category: r.product_category ?? null,
        purchase_date: r.purchase_date ?? null,
        category_meta: (r.category_meta ?? null) as Record<string, unknown> | null,
        script_type: r.script_type ?? null,
        status: r.status ?? null,
        quantity: qty,
        cost_price: cost,
        total_cost: total,
        amount_paid: paid,
        target_price: r.target_price != null ? Number(r.target_price) : null,
        total_target_price: r.total_target_price != null ? Number(r.total_target_price) : null,
        scribe_id: r.scribe_id ?? null,
        scribe_code: r.scribe_code ?? null,
        images: (r.images ?? null) as string[] | null,
        description: r.description ?? null,
        parchment_type: r.parchment_type ?? null,
        computer_proofread: Boolean(r.computer_proofread ?? false),
        human_proofread: Boolean(r.human_proofread ?? false),
        is_sewn: Boolean(r.is_sewn ?? false),
        is_public: r.is_public ?? false,
        public_slug: r.public_slug ?? null,
      };
    });

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

    const qty = (data.quantity ?? 1) > 0 ? (data.quantity ?? 1) : 1;
    const costPerUnit = data.cost_price ?? null;
    const totalCost = costPerUnit != null ? qty * costPerUnit : null; // total_cost = quantity * cost_price
    const amountPaid = data.amount_paid ?? 0;
    const targetPrice = data.target_price ?? null;
    const totalTargetPrice = targetPrice != null ? qty * targetPrice : null; // total_target_price = quantity * target_price

    const imagesValue = Array.isArray(data.images)
      ? data.images
      : data.images == null || data.images === undefined
        ? []
        : [];

    const sku = generateInventorySku();
    try {
      const { error } = await supabase.from("inventory").insert({
        sku,
        user_id: user.id,
        product_category: data.product_category ?? null,
        purchase_date: data.purchase_date ?? null,
        category_meta: data.category_meta ?? {},
        script_type: data.script_type ?? null,
        status: data.status ?? "available",
        quantity: qty,
        cost_price: costPerUnit,
        total_cost: totalCost,
        amount_paid: amountPaid,
        target_price: targetPrice,
        total_target_price: totalTargetPrice,
        scribe_id: data.scribe_id ?? null,
        scribe_code: data.scribe_code ?? null,
        images: imagesValue ?? [],
        description: data.description ?? null,
        parchment_type: data.parchment_type ?? null,
        computer_proofread: data.computer_proofread ?? false,
        human_proofread: data.human_proofread ?? false,
        is_sewn: data.is_sewn ?? false,
      });

      if (error) {
        console.error("DB_INSERT_ERROR:", error);
        logError("Inventory", "createInventoryItem DB error", { error: error.message, userId: user.id });
        return { success: false, error: error.message };
      }
    } catch (dbErr) {
      console.error("DB_INSERT_ERROR:", dbErr);
      const msg = dbErr instanceof Error ? dbErr.message : "שגיאת מסד נתונים";
      return { success: false, error: msg };
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

    const qty = (data.quantity ?? 1) > 0 ? (data.quantity ?? 1) : 1;
    const costPerUnit = data.cost_price ?? null;
    const totalCost = costPerUnit != null ? qty * costPerUnit : null; // total_cost = quantity * cost_price
    const amountPaid = data.amount_paid ?? 0;
    const targetPrice = data.target_price ?? null;
    const totalTargetPrice = targetPrice != null ? qty * targetPrice : null; // total_target_price = quantity * target_price

    const imagesValue = Array.isArray(data.images)
      ? data.images
      : data.images == null || data.images === undefined
        ? []
        : [];

    try {
      const { error } = await supabase
        .from("inventory")
        .update({
          product_category: data.product_category ?? null,
          purchase_date: data.purchase_date ?? null,
          category_meta: data.category_meta ?? {},
          script_type: data.script_type ?? null,
          status: data.status ?? null,
          quantity: qty,
          cost_price: costPerUnit,
          total_cost: totalCost,
          amount_paid: amountPaid,
          target_price: targetPrice,
          total_target_price: totalTargetPrice,
          scribe_id: data.scribe_id ?? null,
          scribe_code: data.scribe_code ?? null,
          images: imagesValue ?? [],
          description: data.description ?? null,
          parchment_type: data.parchment_type ?? null,
          computer_proofread: data.computer_proofread ?? false,
          human_proofread: data.human_proofread ?? false,
          is_sewn: data.is_sewn ?? false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("DB_UPDATE_ERROR:", error);
        logError("Inventory", "updateInventoryItem DB error", { error: error.message, id, userId: user.id });
        return { success: false, error: error.message };
      }
    } catch (dbErr) {
      console.error("DB_UPDATE_ERROR:", dbErr);
      const msg = dbErr instanceof Error ? dbErr.message : "שגיאת מסד נתונים";
      return { success: false, error: msg };
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
    const raw = formData.get("file");
    if (raw == null || typeof raw !== "object") {
      return { success: false, error: "לא נבחר קובץ" };
    }
    if (!(raw instanceof Blob)) {
      return { success: false, error: "קובץ לא תקין" };
    }
    const blob = raw as Blob;
    if (blob.size > IMAGE_SIZE_LIMIT_BYTES) {
      return { success: false, error: "התמונה חורגת ממגבלת 5MB" };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const name = raw instanceof File && raw.name ? raw.name : "image.jpg";
    const ext = name.split(".").pop() || "jpg";
    const path = `inventory/${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, blob, {
        contentType: (raw instanceof File && raw.type) ? raw.type : "image/jpeg",
        upsert: true,
      });

    if (error) {
      console.error("[uploadInventoryImage] storage.upload:", error.message, error);
      logError("Inventory", "uploadInventoryImage storage.upload", {
        message: error.message,
        name: error.name,
      });
      throw new Error(error.message);
    }

    const { data: { publicUrl } } = supabase.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(path);

    return { success: true, url: publicUrl };
  } catch (err) {
    console.error("[uploadInventoryImage]", err);
    if (err instanceof Error) console.error(err.stack);
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
