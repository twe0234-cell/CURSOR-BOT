"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ParchmentPrice = { name: string; price: number };
export type NeviimEntry = { pages: number; yeriot: number };
export type NeviimData = Record<string, NeviimEntry>;

export async function fetchCalculatorConfigForSettings(): Promise<{
  parchmentPrices: ParchmentPrice[];
  neviimData: NeviimData;
}> {
  const supabase = await createClient();
  const { data: parchmentRow } = await supabase
    .from("sys_calculator_config")
    .select("config_data")
    .eq("config_key", "parchment_prices")
    .single();

  const { data: neviimRow } = await supabase
    .from("sys_calculator_config")
    .select("config_data")
    .eq("config_key", "neviim_data")
    .single();

  const parchmentPrices = (parchmentRow?.config_data as ParchmentPrice[] | null) ?? [];
  const neviimData = (neviimRow?.config_data as NeviimData | null) ?? {};

  return { parchmentPrices, neviimData };
}

export async function saveCalculatorConfig(
  parchmentPrices: ParchmentPrice[],
  neviimData: NeviimData
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error: err1 } = await supabase
      .from("sys_calculator_config")
      .upsert(
        { config_key: "parchment_prices", config_data: parchmentPrices },
        { onConflict: "config_key" }
      );

    if (err1) return { success: false, error: err1.message };

    const { error: err2 } = await supabase
      .from("sys_calculator_config")
      .upsert(
        { config_key: "neviim_data", config_data: neviimData },
        { onConflict: "config_key" }
      );

    if (err2) return { success: false, error: err2.message };

    revalidatePath("/calculator");
    revalidatePath("/settings/calculator");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
