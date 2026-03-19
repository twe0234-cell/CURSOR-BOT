import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";
import InvestmentsClient from "./InvestmentsClient";
import { Button } from "@/components/ui/button";

export default async function InvestmentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="w-full max-w-5xl mx-auto px-4 py-6 sm:py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">תיק השקעות</h1>
            <p className="mt-1 text-muted-foreground">פרויקטי כתיבה פעילים</p>
          </div>
          <Link href="/">
            <Button variant="outline" className="rounded-xl">חזרה לדשבורד</Button>
          </Link>
        </div>
        <InvestmentsClient />
      </div>
    </div>
  );
}
