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
    .select("id, name, type, preferred_contact, wa_chat_id, email, phone, tags, notes, certification, phone_type, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!contact) notFound();

  const [txRes, docsRes, logsRes, invRes, investRes] = await Promise.all([
    supabase.from("crm_transactions").select("id, amount, type, description, date").eq("contact_id", id).order("date", { ascending: false }),
    supabase.from("crm_documents").select("id, file_url, doc_type, name").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("crm_communication_logs").select("id, channel, content, timestamp").eq("contact_id", id).order("timestamp", { ascending: false }).limit(20),
    supabase.from("inventory").select("quantity, cost_price, total_cost, amount_paid").eq("scribe_id", id).neq("status", "sold"),
    supabase.from("erp_investments").select("total_agreed_price, amount_paid").eq("scribe_id", id).eq("status", "active"),
  ]);

  const salesRes = await supabase
    .from("erp_sales")
    .select("id, sale_price, quantity, total_price, amount_paid")
    .eq("buyer_id", id);

  const saleIds = (salesRes.data ?? []).map((s) => s.id);
  const paymentExtraBySale = new Map<string, number>();
  if (saleIds.length > 0) {
    const { data: pays } = await supabase
      .from("erp_payments")
      .select("target_id, amount")
      .eq("user_id", user.id)
      .eq("target_type", "sale")
      .in("target_id", saleIds);
    for (const p of pays ?? []) {
      const tid = p.target_id as string;
      paymentExtraBySale.set(tid, (paymentExtraBySale.get(tid) ?? 0) + Number(p.amount ?? 0));
    }
  }

  const transactions = txRes.data ?? [];

  let debtToContact = 0;
  for (const inv of invRes.data ?? []) {
    const total = inv.total_cost != null ? Number(inv.total_cost) : (Number(inv.quantity ?? 1) * Number(inv.cost_price ?? 0));
    debtToContact += Math.max(0, total - Number(inv.amount_paid ?? 0));
  }
  for (const inv of investRes.data ?? []) {
    debtToContact += Math.max(0, Number(inv.total_agreed_price ?? 0) - Number(inv.amount_paid ?? 0));
  }

  let debtFromContact = 0;
  for (const s of salesRes.data ?? []) {
    const qty = Math.max(1, Math.floor(Number(s.quantity ?? 1)));
    const total =
      s.total_price != null ? Number(s.total_price) : Number(s.sale_price ?? 0) * qty;
    const paid = Number(s.amount_paid ?? 0) + (paymentExtraBySale.get(s.id) ?? 0);
    debtFromContact += Math.max(0, total - paid);
  }

  const TYPE_LABELS: Record<string, string> = {
    Scribe: "סופר",
    Merchant: "סוחר",
    End_Customer: "לקוח",
    Other: "אחר",
  };

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
        certification: contact.certification ?? null,
        phone_type: contact.phone_type ?? null,
        created_at: contact.created_at ?? "",
      }}
      debtToContact={debtToContact}
      debtFromContact={debtFromContact}
      typeLabel={TYPE_LABELS[contact.type ?? "Other"] ?? contact.type ?? "אחר"}
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
