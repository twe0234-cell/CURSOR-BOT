import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";
import { fetchCalculatorConfigForSettings } from "./actions";
import CalculatorSettingsClient from "./CalculatorSettingsClient";
import { Button } from "@/components/ui/button";

export default async function CalculatorSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { parchmentPrices, neviimData } = await fetchCalculatorConfigForSettings();

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-x-hidden" dir="rtl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">הגדרות מחשבון</h1>
          <p className="mt-1 text-muted-foreground">
            ערוך מחירי קלף והגדרות נביאים
          </p>
        </div>
        <Link href="/settings">
          <Button variant="outline" className="rounded-xl">
            חזרה להגדרות
          </Button>
        </Link>
      </div>
      <CalculatorSettingsClient
        initialParchmentPrices={parchmentPrices}
        initialNeviimData={neviimData}
      />
    </div>
  );
}
