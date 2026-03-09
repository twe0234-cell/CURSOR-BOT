import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import EmailClient from "./EmailClient";

export default async function EmailPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: contacts } = await supabase
    .from("email_contacts")
    .select("id, email, name, phone, tags, subscribed, source, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const mapped = (contacts ?? []).map((c) => ({
    id: c.id,
    email: c.email ?? "",
    name: c.name ?? null,
    phone: c.phone ?? null,
    tags: (c.tags ?? []) as string[],
    subscribed: c.subscribed ?? true,
    source: c.source ?? null,
    created_at: c.created_at ?? "",
  }));

  return <EmailClient initialContacts={mapped} />;
}
