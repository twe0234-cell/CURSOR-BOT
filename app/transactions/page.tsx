import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import TransactionsClient from "./TransactionsClient";

export default async function TransactionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50/50">
      <TransactionsClient />
    </div>
  );
}
