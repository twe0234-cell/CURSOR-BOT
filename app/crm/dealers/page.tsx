import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import DealerEmailOpsClient from "./DealerEmailOpsClient";
import { classifyEmail, type DealerEmailRow } from "./actions";

export const dynamic = "force-dynamic";

export default async function DealerEmailOpsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // All active Merchant contacts
  const { data: contacts } = await supabase
    .from("crm_contacts")
    .select("id, name, email, phone, tags, city, community")
    .eq("user_id", user.id)
    .eq("type", "Merchant")
    .is("archived_at", null)
    .order("name");

  // Emails explicitly unsubscribed in email_contacts
  const { data: unsubbed } = await supabase
    .from("email_contacts")
    .select("email")
    .eq("user_id", user.id)
    .eq("subscribed", false);

  const unsubSet = new Set(
    (unsubbed ?? [])
      .map((r: { email: string | null }) => r.email?.toLowerCase().trim())
      .filter((e): e is string => Boolean(e))
  );

  const dealers: DealerEmailRow[] = (contacts ?? []).map(
    (c: {
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      tags: string[] | null;
      city?: string | null;
      community?: string | null;
    }) => ({
      id: c.id,
      name: c.name ?? "",
      email: c.email?.trim() || null,
      phone: c.phone?.trim() || null,
      tags: (c.tags ?? []) as string[],
      city: c.city ?? null,
      community: c.community ?? null,
      emailStatus: classifyEmail(c.email, unsubSet),
    })
  );

  const allTags = [...new Set(dealers.flatMap((d) => d.tags))].sort();

  return <DealerEmailOpsClient dealers={dealers} allTags={allTags} />;
}
