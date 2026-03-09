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
  price: number | null;
  description: string | null;
};

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
      .select("id, user_id, product_type, item_type, script_type, hidur_level, status, price, description")
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
      price: r.price != null ? Number(r.price) : null,
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
      price: item.price,
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
        price: item.price,
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
