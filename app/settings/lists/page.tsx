import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import ListsClient from "./ListsClient";

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
      <div className="w-full max-w-2xl mx-auto px-4 py-6">
        <h1 className="mb-6 text-3xl font-bold text-teal-800">רשימות נפתחות</h1>
        <p className="text-muted-foreground">הרץ את migration 013 כדי ליצור את טבלת sys_dropdowns</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-x-hidden">
      <h1 className="mb-6 text-3xl font-bold text-teal-800">רשימות נפתחות</h1>
      <p className="mb-6 text-slate-600">
        ערוך את האפשרויות ברשימות הנפתחות של המלאי והמחשבון
      </p>
      <ListsClient initialLists={initialLists} />
    </div>
  );
}
