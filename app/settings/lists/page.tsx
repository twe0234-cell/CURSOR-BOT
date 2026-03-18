import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";
import ListsClient from "./ListsClient";
import { Button } from "@/components/ui/button";

export default async function ListsSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: lists, error } = await supabase
    .from("sys_dropdowns")
    .select("list_key, options")
    .order("list_key");

  const initialLists = error ? [] : (lists ?? []).map((r) => ({
    list_key: r.list_key,
    options: Array.isArray(r.options) ? (r.options as string[]) : [],
  }));

  if (error && initialLists.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-6" dir="rtl">
        <h1 className="mb-6 text-3xl font-bold text-teal-800">רשימות נפתחות</h1>
        <p className="mb-4 text-muted-foreground">
          אנא העתק את קוד ה-SQL מ־supabase/migrations/020_setup_sys_tables.sql והרץ אותו ב-SQL Editor בתוך Supabase כדי ליצור את הטבלאות החסרות.
        </p>
        <Link href="/settings">
          <Button variant="outline" className="rounded-xl">חזרה להגדרות</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-x-hidden" dir="rtl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-teal-800">רשימות נפתחות</h1>
          <p className="mt-1 text-muted-foreground">
            ערוך את האפשרויות ברשימות הנפתחות של המלאי והמחשבון
          </p>
        </div>
        <Link href="/settings">
          <Button variant="outline" className="rounded-xl">חזרה להגדרות</Button>
        </Link>
      </div>
      <ListsClient initialLists={initialLists} />
    </div>
  );
}
