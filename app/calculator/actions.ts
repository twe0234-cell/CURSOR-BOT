"use server";

import { createClient } from "@/src/lib/supabase/server";

export type ParchmentPrice = { name: string; price: number };
export type NeviimEntry = { pages: number; yeriot: number };
export type NeviimData = Record<string, NeviimEntry>;

export async function fetchCalculatorConfig(): Promise<{
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
