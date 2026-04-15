"use server";

import { createClient } from "@/src/lib/supabase/server";
import { CRM_COMMUNITY_DROPDOWN_KEY } from "@/src/lib/types/crm";

export async function fetchCrmCommunityOptions(): Promise<
  { success: true; options: string[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sys_dropdowns")
      .select("options")
      .eq("list_key", CRM_COMMUNITY_DROPDOWN_KEY)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    const raw = data?.options;
    if (!Array.isArray(raw)) return { success: true, options: [] };
    const options = raw
      .map((x) => (typeof x === "string" ? x.trim() : String(x)))
      .filter(Boolean);
    return { success: true, options };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** מוסיף ערך חדש לרשימת הקהילה (אם חסר) */
export async function appendCrmCommunityOption(
  value: string
): Promise<{ success: true } | { success: false; error: string }> {
  const v = value.trim();
  if (!v) return { success: false, error: "ערך ריק" };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: row, error: readErr } = await supabase
      .from("sys_dropdowns")
      .select("options")
      .eq("list_key", CRM_COMMUNITY_DROPDOWN_KEY)
      .maybeSingle();
    if (readErr) return { success: false, error: readErr.message };

    const prev = Array.isArray(row?.options) ? (row!.options as unknown[]) : [];
    const set = new Set(
      prev.map((x) => (typeof x === "string" ? x.trim() : String(x)).toLowerCase())
    );
    if (set.has(v.toLowerCase())) return { success: true };

    const next = [...prev.map((x) => (typeof x === "string" ? x : String(x))), v];

    const { error: upErr } = await supabase.from("sys_dropdowns").upsert(
      {
        list_key: CRM_COMMUNITY_DROPDOWN_KEY,
        options: next,
      },
      { onConflict: "list_key" }
    );
    if (upErr) return { success: false, error: upErr.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}
