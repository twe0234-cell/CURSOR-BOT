import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import QuickEntryClient from "./QuickEntryClient";
import { fetchTorahQuickEntryProjects } from "./actions";

export default async function TorahQuickEntryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const res = await fetchTorahQuickEntryProjects();
  const projects = res.success ? res.projects : [];

  return (
    <div dir="rtl" className="min-h-screen bg-background px-4 py-8">
      <QuickEntryClient initialProjects={projects} />
    </div>
  );
}
