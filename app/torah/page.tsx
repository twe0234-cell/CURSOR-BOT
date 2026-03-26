import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import TorahClient from "./TorahClient";
import { fetchTorahProjects } from "./actions";

export const metadata = { title: "פרויקטי ספרי תורה" };

export default async function TorahPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await fetchTorahProjects();
  const projects = result.success ? result.projects : [];

  return <TorahClient initialProjects={projects} />;
}
