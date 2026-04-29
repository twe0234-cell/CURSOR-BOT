import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";
import SalesClient from "./SalesClient";
import { Button } from "@/components/ui/button";

export default async function SalesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-50/50" dir="rtl">
      <div className="mx-auto w-full max-w-[1680px] px-3 py-4 sm:px-4 sm:py-5 lg:px-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 lg:text-3xl">מכירות ותזרים</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">ניהול מכירות והוצאות</p>
          </div>
          <Link href="/">
            <Button variant="outline" className="h-8 rounded-lg px-3 text-xs sm:h-9 sm:text-sm">חזרה לדשבורד</Button>
          </Link>
        </div>
        <SalesClient />
      </div>
    </div>
  );
}
