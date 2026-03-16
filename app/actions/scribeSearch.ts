"use server";

import { createClient } from "@/src/lib/supabase/server";

export type ScribeSearchResult = {
  source: "broadcast" | "inventory";
  scribe_code: string | null;
  internal_notes: string | null;
  created_at: string;
  extra?: Record<string, unknown>;
};

export async function searchByScribeCode(
  query: string
): Promise<
  | { success: true; results: ScribeSearchResult[] }
  | { success: false; error: string }
> {
  try {
    const q = query.trim();
    if (!q) return { success: true, results: [] };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const code = q.startsWith("#") ? q.slice(1) : q;
    const pattern = `%${code}%`;

    const [broadcastRes, inventoryRes] = await Promise.all([
      supabase
        .from("broadcast_logs")
        .select("scribe_code, internal_notes, created_at")
        .eq("user_id", user.id)
        .or(`scribe_code.ilike.${pattern},internal_notes.ilike.${pattern}`)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("inventory")
        .select("scribe_code, internal_notes, created_at, product_category, status")
        .or(`scribe_code.ilike.${pattern},internal_notes.ilike.${pattern}`)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const results: ScribeSearchResult[] = [];

    for (const r of broadcastRes.data ?? []) {
      if (r.scribe_code?.includes(code) || r.internal_notes?.includes(code)) {
        results.push({
          source: "broadcast",
          scribe_code: r.scribe_code,
          internal_notes: r.internal_notes,
          created_at: r.created_at ?? "",
        });
      }
    }
    for (const r of inventoryRes.data ?? []) {
      if (r.scribe_code?.includes(code) || r.internal_notes?.includes(code)) {
        results.push({
          source: "inventory",
          scribe_code: r.scribe_code,
          internal_notes: r.internal_notes,
          created_at: r.created_at ?? "",
          extra: { product_category: r.product_category, status: r.status },
        });
      }
    }

    results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { success: true, results: results.slice(0, 10) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
