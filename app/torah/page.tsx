import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import TorahClient from "./TorahClient";
import { fetchTorahProjects } from "./actions";
import { fetchTorahParchmentLabelsFromCalculator } from "@/src/lib/torah/parchmentFromCalculator";

export const metadata = { title: "פרויקטי ספרי תורה" };

export default async function TorahPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [result, parchmentLabels] = await Promise.all([
    fetchTorahProjects(),
    fetchTorahParchmentLabelsFromCalculator(),
  ]);
  const projects = result.success ? result.projects : [];
  const fetchError = !result.success ? result.error : undefined;

  return (
    <TorahClient
      initialProjects={projects}
      parchmentLabels={parchmentLabels}
      fetchError={fetchError}
    />
  );
}
