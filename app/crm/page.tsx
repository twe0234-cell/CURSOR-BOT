import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import CrmClient from "./CrmClient";
import { fetchCrmContacts } from "@/src/services/crm.service";

export const dynamic = "force-dynamic";

export default async function CrmPage() {
  // Auth check – must happen in the page so we can redirect unauthenticated users
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch contacts via the service (single source of truth for mapping logic)
  // and user settings in parallel to avoid sequential round-trips
  const [contactsResult, settingsResult] = await Promise.all([
    fetchCrmContacts(),
    supabase
      .from("user_settings")
      .select("gmail_refresh_token")
      .eq("user_id", user.id)
      .single(),
  ]);

  return (
    <CrmClient
      initialContacts={contactsResult.success ? contactsResult.contacts : []}
      gmailConnected={!!settingsResult.data?.gmail_refresh_token}
    />
  );
}
