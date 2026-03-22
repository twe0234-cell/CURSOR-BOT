"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { marketTorahBookSchema } from "@/lib/validations/marketTorah";

const MARKET_SELECT_FULL =
  "id, sofer_id, external_sofer_name, style, size_cm, parchment_type, influencer_style, current_progress, asking_price, target_brokerage_price, potential_profit, currency, expected_completion_date, notes, created_at";

const MARKET_SELECT_LEGACY =
  "id, sofer_id, external_sofer_name, style, size_cm, parchment_type, influencer_style, current_progress, asking_price, currency, expected_completion_date, notes, created_at";

function isMissingColumnError(msg: string | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    (m.includes("column") && m.includes("does not exist")) ||
    m.includes("42703") ||
    m.includes("schema cache") ||
    m.includes("could not find")
  );
}

export type MarketTorahBookRow = {
  id: string;
  sofer_id: string | null;
  external_sofer_name: string | null;
  style: string | null;
  size_cm: number | null;
  parchment_type: string | null;
  influencer_style: string | null;
  current_progress: string | null;
  asking_price: number | null;
  /** DB-generated: target_brokerage_price − asking_price */
  target_brokerage_price: number | null;
  potential_profit: number | null;
  currency: string | null;
  expected_completion_date: string | null;
  notes: string | null;
  created_at: string;
  sofer_name: string | null;
};

export async function fetchMarketTorahBooks(): Promise<
  { success: true; rows: MarketTorahBookRow[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    let books: Record<string, unknown>[] | null = null;
    let selErr = null as { message?: string; code?: string; details?: string; hint?: string } | null;
    let hasBrokerageCols = true;

    const res1 = await supabase
      .from("market_torah_books")
      .select(MARKET_SELECT_FULL)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    books = res1.data as Record<string, unknown>[] | null;
    selErr = res1.error;

    if (selErr) {
      console.error("[fetchMarketTorahBooks] select error (full):", JSON.stringify(selErr, null, 2));
    }

    if (selErr && isMissingColumnError(selErr.message)) {
      const res2 = await supabase
        .from("market_torah_books")
        .select(MARKET_SELECT_LEGACY)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      books = res2.data as Record<string, unknown>[] | null;
      selErr = res2.error;
      hasBrokerageCols = false;
      if (selErr) {
        console.error("[fetchMarketTorahBooks] legacy select error (full):", JSON.stringify(selErr, null, 2));
      } else {
        console.warn(
          "[fetchMarketTorahBooks] Using legacy columns (run migration 037 / fix-schema-crash for brokerage fields)."
        );
      }
    }

    if (selErr) {
      return { success: false, error: selErr.message ?? "שגיאת מסד נתונים" };
    }

    const soferIds = [...new Set((books ?? []).map((b) => b.sofer_id).filter(Boolean))] as string[];
    let nameMap = new Map<string, string>();
    if (soferIds.length > 0) {
      const { data: contacts } = await supabase
        .from("crm_contacts")
        .select("id, name")
        .eq("user_id", user.id)
        .in("id", soferIds);
      nameMap = new Map((contacts ?? []).map((c) => [c.id, c.name ?? ""]));
    }

    const rows: MarketTorahBookRow[] = (books ?? []).map((b) => {
      const ask = b.asking_price != null ? Number(b.asking_price) : null;
      const target = hasBrokerageCols && b.target_brokerage_price != null
        ? Number(b.target_brokerage_price)
        : null;
      const pot =
        hasBrokerageCols && b.potential_profit != null
          ? Number(b.potential_profit)
          : ask != null && target != null
            ? target - ask
            : null;
      return {
        id: b.id as string,
        sofer_id: (b.sofer_id as string | null) ?? null,
        external_sofer_name: (b.external_sofer_name as string | null) ?? null,
        style: (b.style as string | null) ?? null,
        size_cm: b.size_cm != null ? Number(b.size_cm) : null,
        parchment_type: (b.parchment_type as string | null) ?? null,
        influencer_style: (b.influencer_style as string | null) ?? null,
        current_progress: (b.current_progress as string | null) ?? null,
        asking_price: ask,
        target_brokerage_price: target,
        potential_profit: pot,
        currency: (b.currency as string | null) ?? "ILS",
        expected_completion_date: (b.expected_completion_date as string | null) ?? null,
        notes: (b.notes as string | null) ?? null,
        created_at: (b.created_at as string) ?? "",
        sofer_name: b.sofer_id ? nameMap.get(b.sofer_id as string) ?? null : null,
      };
    });

    return { success: true, rows };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function fetchScribesForMarketForm(): Promise<
  { success: true; contacts: { id: string; name: string }[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("crm_contacts")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("type", "Scribe")
      .order("name");

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      contacts: (data ?? []).map((r) => ({ id: r.id, name: r.name ?? "" })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function createMarketTorahBook(
  input: Record<string, unknown>
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const parsed = marketTorahBookSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().formErrors[0] ?? "נתונים לא תקינים" };
    }
    const v = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    if (v.sofer_id) {
      const { data: ok } = await supabase
        .from("crm_contacts")
        .select("id")
        .eq("id", v.sofer_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!ok) return { success: false, error: "הסופר שנבחר לא נמצא" };
    }

    const { error } = await supabase.from("market_torah_books").insert({
      user_id: user.id,
      sofer_id: v.sofer_id ?? null,
      external_sofer_name: v.external_sofer_name ?? null,
      style: v.style ?? null,
      size_cm: v.size_cm ?? null,
      parchment_type: v.parchment_type ?? null,
      influencer_style: v.influencer_style ?? null,
      current_progress: v.current_progress ?? null,
      asking_price: v.asking_price ?? null,
      target_brokerage_price: v.target_brokerage_price ?? null,
      currency: v.currency ?? "ILS",
      expected_completion_date: v.expected_completion_date || null,
      notes: v.notes ?? null,
    });

    if (error) {
      console.error("[createMarketTorahBook] insert error (full):", JSON.stringify(error, null, 2));
      return { success: false, error: error.message };
    }

    revalidatePath("/market");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function deleteMarketTorahBook(id: string): Promise<
  { success: true } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("market_torah_books")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/market");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}
