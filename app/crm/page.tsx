import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import CrmClient from "./CrmClient";

export default async function CrmPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: contacts } = await supabase
    .from("crm_contacts")
    .select("id, name, type, preferred_contact, wa_chat_id, email, phone, tags, notes, certification, phone_type, created_at")
    .eq("user_id", user.id)
    .order("name");

  const { data: settings } = await supabase
    .from("user_settings")
    .select("gmail_refresh_token")
    .eq("user_id", user.id)
    .single();

  const mapped = (contacts ?? []).map((c) => ({
    id: c.id,
    name: c.name ?? "",
    type: c.type ?? "Other",
    preferred_contact: c.preferred_contact ?? "WhatsApp",
    wa_chat_id: c.wa_chat_id ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    tags: (c.tags ?? []) as string[],
    notes: c.notes ?? null,
    certification: c.certification ?? null,
    phone_type: c.phone_type ?? null,
    created_at: c.created_at ?? "",
  }));

  return (
    <CrmClient
      initialContacts={mapped}
      gmailConnected={!!settings?.gmail_refresh_token}
    />
  );
}
