import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import AudienceClient from "./AudienceClient";

export default async function AudiencePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: audience } = await supabase
    .from("audience")
    .select("id, name, wa_chat_id, tags, active")
    .eq("user_id", user.id)
    .order("name");

  const allTags = [...new Set((audience ?? []).flatMap((a) => (a.tags ?? []) as string[]))].sort();

  return (
    <AudienceClient
      initialAudience={audience ?? []}
      allTags={allTags}
    />
  );
}
