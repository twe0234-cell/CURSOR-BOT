"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type DropdownList = {
  list_key: string;
  options: string[];
};

export async function fetchDropdownLists(): Promise<
  { success: true; lists: DropdownList[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("sys_dropdowns")
      .select("list_key, options")
      .order("list_key");

    if (error) return { success: false, error: error.message };

    const lists = (data ?? []).map((r) => ({
      list_key: r.list_key,
      options: Array.isArray(r.options) ? (r.options as string[]) : [],
    }));

    return { success: true, lists };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function fetchDropdownOptions(listKey: string): Promise<
  { success: true; options: string[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("sys_dropdowns")
      .select("options")
      .eq("list_key", listKey)
      .single();

    if (error || !data) return { success: false, error: error?.message ?? "לא נמצא" };

    const options = Array.isArray(data.options) ? (data.options as string[]) : [];
    return { success: true, options };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function updateDropdownOptions(
  listKey: string,
  options: string[]
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("sys_dropdowns")
      .upsert({ list_key: listKey, options }, { onConflict: "list_key" });

    if (error) return { success: false, error: error.message };
    revalidatePath("/settings/lists");
    revalidatePath("/inventory");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
