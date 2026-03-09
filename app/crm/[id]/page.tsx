import { redirect, notFound } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import ContactDetailClient from "./ContactDetailClient";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: contact } = await supabase
    .from("crm_contacts")
    .select("id, name, type, preferred_contact, wa_chat_id, email, phone, tags, notes, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!contact) notFound();

  const [txRes, docsRes, logsRes] = await Promise.all([
    supabase.from("crm_transactions").select("id, amount, type, description, date").eq("contact_id", id).order("date", { ascending: false }),
    supabase.from("crm_documents").select("id, file_url, doc_type, name").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("crm_communication_logs").select("id, channel, content, timestamp").eq("contact_id", id).order("timestamp", { ascending: false }).limit(20),
  ]);

  const transactions = txRes.data ?? [];

  return (
    <ContactDetailClient
      contact={{
        id: contact.id,
        name: contact.name ?? "",
        type: contact.type ?? "Other",
        preferred_contact: contact.preferred_contact ?? "WhatsApp",
        wa_chat_id: contact.wa_chat_id ?? null,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        tags: (contact.tags ?? []) as string[],
        notes: contact.notes ?? null,
        created_at: contact.created_at ?? "",
      }}
      transactions={transactions.map((t) => ({
        id: t.id,
        amount: Number(t.amount ?? 0),
        type: t.type ?? "",
        description: t.description ?? null,
        date: t.date ?? "",
      }))}
      documents={(docsRes.data ?? []).map((d) => ({
        id: d.id,
        file_url: d.file_url ?? "",
        doc_type: d.doc_type ?? "Other",
        name: d.name ?? null,
      }))}
      logs={(logsRes.data ?? []).map((l) => ({
        id: l.id,
        channel: l.channel ?? "",
        content: l.content ?? null,
        timestamp: l.timestamp ?? "",
      }))}
    />
  );
}
