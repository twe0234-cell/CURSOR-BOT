import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import SoferimClient from "./SoferimClient";
import { fetchSoferimDirectory } from "./actions";

export default async function SoferimPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const res = await fetchSoferimDirectory();
  const rows = res.success ? res.rows : [];

  return <SoferimClient initialRows={rows} />;
}
