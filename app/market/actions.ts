"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { marketTorahBookSchema } from "@/lib/validations/marketTorah";
import { marketDbToK, marketKToDb } from "@/lib/market/kPricing";
import { generateSku, marketSkuPrefix } from "@/lib/sku";
import type { MarketStage } from "./stages";

/** כולל סוחר + משא ומתן + SKU + דוגמת כתב + שלב pipeline (מיגרציה 058) */
const MARKET_SELECT_EXT =
  "id, sku, sofer_id, dealer_id, external_sofer_name, script_type, torah_size, parchment_type, influencer_style, asking_price, target_brokerage_price, potential_profit, currency, last_contact_date, negotiation_notes, expected_completion_date, notes, handwriting_image_url, market_stage, created_at";

export type MarketTorahBookRow = {
  id: string;
  sku: string | null;
  sofer_id: string | null;
  dealer_id: string | null;
  external_sofer_name: string | null;
  script_type: string | null;
  torah_size: string | null;
  parchment_type: string | null;
  influencer_style: string | null;
  /** מחירי תצוגה (אלפי ש״ח / K) אחרי המרה ממאגר — הערכים ב-DB נשמרים ×1000 */
  asking_price: number | null;
  target_brokerage_price: number | null;
  potential_profit: number | null;
  currency: string | null;
  last_contact_date: string | null;
  negotiation_notes: string | null;
  expected_completion_date: string | null;
  notes: string | null;
  handwriting_image_url: string | null;
  market_stage: MarketStage | null;
  created_at: string;
  sofer_name: string | null;
  dealer_name: string | null;
};

function mapBookRow(
  b: Record<string, unknown>,
  hasBrokerageCols: boolean,
  hasExtendedDealer: boolean
): Omit<MarketTorahBookRow, "sofer_name" | "dealer_name"> {
  const ask =
    b.asking_price != null ? marketDbToK(Number(b.asking_price)) : null;
  const target =
    hasBrokerageCols && b.target_brokerage_price != null
      ? marketDbToK(Number(b.target_brokerage_price))
      : null;
  const pot =
    hasBrokerageCols && b.potential_profit != null
      ? marketDbToK(Number(b.potential_profit))
      : ask != null && target != null
        ? target - ask
        : null;
  return {
    id: b.id as string,
    sku: (b.sku as string | null) ?? null,
    sofer_id: (b.sofer_id as string | null) ?? null,
    dealer_id: hasExtendedDealer ? ((b.dealer_id as string | null) ?? null) : null,
    external_sofer_name: (b.external_sofer_name as string | null) ?? null,
    script_type: (b.script_type as string | null) ?? null,
    torah_size: (b.torah_size as string | null) ?? null,
    parchment_type: (b.parchment_type as string | null) ?? null,
    influencer_style: (b.influencer_style as string | null) ?? null,
    asking_price: ask,
    target_brokerage_price: target,
    potential_profit: pot,
    currency: (b.currency as string | null) ?? "ILS",
    last_contact_date: hasExtendedDealer
      ? ((b.last_contact_date as string | null) ?? null)
      : null,
    negotiation_notes: hasExtendedDealer
      ? ((b.negotiation_notes as string | null) ?? null)
      : null,
    expected_completion_date: (b.expected_completion_date as string | null) ?? null,
    notes: (b.notes as string | null) ?? null,
    handwriting_image_url: (b.handwriting_image_url as string | null) ?? null,
    created_at: (b.created_at as string) ?? "",
    market_stage: (b.market_stage as MarketStage | null) ?? null,
  };
}

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
    const hasBrokerageCols = true;
    const hasExtendedDealer = true;

    const resExt = await supabase
      .from("market_torah_books")
      .select(MARKET_SELECT_EXT)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    books = resExt.data as Record<string, unknown>[] | null;
    selErr = resExt.error;

    if (selErr) {
      console.error("[fetchMarketTorahBooks] select error:", JSON.stringify(selErr, null, 2));
    }

    if (selErr) {
      return { success: false, error: selErr.message ?? "שגיאת מסד נתונים" };
    }

    const soferIds = [...new Set((books ?? []).map((b) => b.sofer_id).filter(Boolean))] as string[];
    const dealerIds = [...new Set((books ?? []).map((b) => b.dealer_id).filter(Boolean))] as string[];

    let nameMap = new Map<string, string>();
    const idSet = [...new Set([...soferIds, ...dealerIds])];
    if (idSet.length > 0) {
      const { data: contacts } = await supabase
        .from("crm_contacts")
        .select("id, name")
        .eq("user_id", user.id)
        .in("id", idSet);
      nameMap = new Map((contacts ?? []).map((c) => [c.id, c.name ?? ""]));
    }

    const rows: MarketTorahBookRow[] = (books ?? []).map((b) => {
      const core = mapBookRow(b, hasBrokerageCols, hasExtendedDealer);
      return {
        ...core,
        sofer_name: b.sofer_id ? nameMap.get(b.sofer_id as string) ?? null : null,
        dealer_name: hasExtendedDealer && b.dealer_id
          ? nameMap.get(b.dealer_id as string) ?? null
          : null,
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
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors).flat()[0];
      return { success: false, error: (firstError as string) ?? "שגיאת ולידציה בנתונים" };
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

    if (v.dealer_id) { const { data: d } = await supabase.from("crm_contacts").select("id").eq("id", v.dealer_id).eq("user_id", user.id).maybeSingle(); if (!d) return { success: false, error: "הסוחר לא נמצא ב-CRM" }; }

    const askDb = marketKToDb(v.asking_price ?? null);
    const targetDb = marketKToDb(v.target_brokerage_price ?? null);
    const sku = generateSku(marketSkuPrefix);

    const { error } = await supabase.from("market_torah_books").insert({
      user_id: user.id,
      sku,
      sofer_id: v.sofer_id ?? null,
      dealer_id: v.dealer_id ?? null,
      external_sofer_name: null,
      script_type: v.script_type ?? null,
      torah_size: v.torah_size ?? null,
      parchment_type: v.parchment_type ?? null,
      influencer_style: v.influencer_style ?? null,
      asking_price: askDb,
      target_brokerage_price: targetDb,
      currency: v.currency ?? "ILS",
      expected_completion_date: v.expected_completion_date || null,
      notes: v.notes ?? null,
      last_contact_date: v.last_contact_date || null,
      negotiation_notes: v.negotiation_notes ?? null,
      handwriting_image_url: v.handwriting_image_url ?? null,
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

export async function updateMarketTorahBook(
  id: string,
  input: Record<string, unknown>
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const parsed = marketTorahBookSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors).flat()[0];
      return { success: false, error: (firstError as string) ?? "שגיאת ולידציה בנתונים" };
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

    if (v.dealer_id) {
      const { data: d } = await supabase
        .from("crm_contacts")
        .select("id")
        .eq("id", v.dealer_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!d) return { success: false, error: "הסוחר לא נמצא ב-CRM" };
    }

    const askDb = marketKToDb(v.asking_price ?? null);
    const targetDb = marketKToDb(v.target_brokerage_price ?? null);

    const { error } = await supabase
      .from("market_torah_books")
      .update({
        sofer_id: v.sofer_id ?? null,
        dealer_id: v.dealer_id ?? null,
        script_type: v.script_type ?? null,
        torah_size: v.torah_size ?? null,
        parchment_type: v.parchment_type ?? null,
        influencer_style: v.influencer_style ?? null,
        asking_price: askDb,
        target_brokerage_price: targetDb,
        currency: v.currency ?? "ILS",
        expected_completion_date: v.expected_completion_date || null,
        notes: v.notes ?? null,
        last_contact_date: v.last_contact_date || null,
        negotiation_notes: v.negotiation_notes ?? null,
        handwriting_image_url: v.handwriting_image_url ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[updateMarketTorahBook] update error:", JSON.stringify(error, null, 2));
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

export async function updateMarketStage(
  id: string,
  stage: MarketStage
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("market_torah_books")
      .update({ market_stage: stage, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/market");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

