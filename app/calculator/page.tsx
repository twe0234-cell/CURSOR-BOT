import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { fetchCalculatorConfig } from "./actions";
import CalculatorClient from "./CalculatorClient";

export default async function CalculatorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { parchmentPrices, neviimData } = await fetchCalculatorConfig();

  return (
    <div className="min-h-screen bg-slate-50/50" dir="rtl">
      <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-hidden">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-2">מחשבון חכם</h1>
          <p className="text-muted-foreground">
            חישוב עלויות, רווח ותשואה לספר תורה ונביא
          </p>
        </div>
        <CalculatorClient
          parchmentPrices={parchmentPrices}
          neviimData={neviimData}
        />
      </div>
    </div>
  );
}
