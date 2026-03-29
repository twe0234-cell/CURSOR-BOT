import { createClient } from "@/src/lib/supabase/server";

export type ParchmentPriceRow = { name: string; price?: number };

/**
 * שמות סוגי קלף מהמחשבון — `sys_calculator_config.config_key = 'parchment_prices'`
 * (אותו מקור כמו בהגדרות המחשבון; type=parchment במפרט המשתמש).
 */
export async function fetchTorahParchmentLabelsFromCalculator(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sys_calculator_config")
      .select("config_data")
      .eq("config_key", "parchment_prices")
      .maybeSingle();

    if (error || !data?.config_data) return [];

    const raw = data.config_data as unknown;
    if (!Array.isArray(raw)) return [];

    const names: string[] = [];
    for (const item of raw) {
      if (item && typeof item === "object" && "name" in item) {
        const n = String((item as ParchmentPriceRow).name ?? "").trim();
        if (n) names.push(n);
      }
    }
    return names;
  } catch {
    return [];
  }
}
