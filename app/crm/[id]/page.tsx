import { redirect, notFound } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import ContactDetailClient from "./ContactDetailClient";
import { INVENTORY_ACTIVE_STATUSES } from "@/lib/inventory/status";

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

  const [txRes, docsRes, logsRes, invRes, investActiveRes, salesBuyerRes, salesSellerRes, investAllRes] =
    await Promise.all([
      supabase
        .from("crm_transactions")
        .select("id, amount, type, description, date")
        .eq("contact_id", id)
        .order("date", { ascending: false }),
      supabase
        .from("crm_documents")
        .select("id, file_url, doc_type, name")
        .eq("contact_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("crm_communication_logs")
        .select("id, channel, content, timestamp")
        .eq("contact_id", id)
        .order("timestamp", { ascending: false })
        .limit(50),
      supabase
        .from("inventory")
        .select("quantity, cost_price, total_cost, amount_paid")
        .eq("scribe_id", id)
        .in("status", [...INVENTORY_ACTIVE_STATUSES]),
      supabase
        .from("erp_investments")
        .select("id, total_agreed_price, amount_paid")
        .eq("scribe_id", id)
        .eq("status", "active")
        .eq("user_id", user.id),
      supabase
        .from("erp_sales")
        .select(
          "id, sale_price, quantity, total_price, amount_paid, sale_type, sale_date, item_description, item_id, investment_id, buyer_id, seller_id"
        )
        .eq("buyer_id", id)
        .eq("user_id", user.id)
        .order("sale_date", { ascending: false }),
      supabase
        .from("erp_sales")
        .select(
          "id, sale_price, quantity, total_price, amount_paid, sale_type, sale_date, item_description, item_id, investment_id, buyer_id, seller_id"
        )
        .eq("seller_id", id)
        .eq("user_id", user.id)
        .order("sale_date", { ascending: false }),
      supabase
        .from("erp_investments")
        .select("id, item_details, status, total_agreed_price, amount_paid, target_date")
        .eq("scribe_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

  const buyerRows = salesBuyerRes.data ?? [];
  const sellerRows = salesSellerRes.data ?? [];
  const buyerSaleIds = buyerRows.map((s) => s.id);
  const sellerSaleIds = sellerRows.map((s) => s.id);
  const investRows = investAllRes.data ?? [];
  const investmentIds = investRows.map((i) => i.id);

  const allEntityIds = [...new Set([...buyerSaleIds, ...sellerSaleIds, ...investmentIds])];

  const paymentExtraBySale = new Map<string, number>();
  const ledgerRows: Array<{
    id: string;
    amount: number;
    payment_date: string;
    entity_type: string;
    entity_id: string;
    direction: string;
    method: string | null;
    notes: string | null;
  }> = [];

  if (allEntityIds.length > 0) {
    const { data: pays } = await supabase
      .from("erp_payments")
      .select("id, entity_id, entity_type, amount, payment_date, direction, method, notes")
      .eq("user_id", user.id)
      .in("entity_id", allEntityIds);

    for (const p of pays ?? []) {
      const eid = p.entity_id as string;
      const amt = Number(p.amount ?? 0);
      const signed = (p.direction as string) === "outgoing" ? -amt : amt;
      if ((p.entity_type as string) === "sale") {
        paymentExtraBySale.set(eid, (paymentExtraBySale.get(eid) ?? 0) + signed);
      }
      ledgerRows.push({
        id: p.id as string,
        amount: amt,
        payment_date: (p.payment_date as string) ?? "",
        entity_type: (p.entity_type as string) ?? "",
        entity_id: eid,
        direction: (p.direction as string) ?? "incoming",
        method: (p.method as string | null) ?? null,
        notes: (p.notes as string | null) ?? null,
      });
    }
    ledgerRows.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
  }

  let debtToContact = 0;
  for (const inv of invRes.data ?? []) {
    const total = inv.total_cost != null ? Number(inv.total_cost) : Number(inv.quantity ?? 1) * Number(inv.cost_price ?? 0);
    debtToContact += Math.max(0, total - Number(inv.amount_paid ?? 0));
  }
  for (const inv of investActiveRes.data ?? []) {
    debtToContact += Math.max(0, Number(inv.total_agreed_price ?? 0) - Number(inv.amount_paid ?? 0));
  }

  let debtFromContact = 0;
  for (const s of buyerRows) {
    const qty = Math.max(1, Math.floor(Number(s.quantity ?? 1)));
    const total =
      s.total_price != null ? Number(s.total_price) : Number(s.sale_price ?? 0) * qty;
    const paid = Number(s.amount_paid ?? 0) + (paymentExtraBySale.get(s.id) ?? 0);
    debtFromContact += Math.max(0, total - paid);
  }

  const itemIds = [...new Set(buyerRows.map((r) => r.item_id).filter(Boolean))] as string[];
  const invIds = [...new Set(buyerRows.map((r) => r.investment_id).filter(Boolean))] as string[];

  const { data: invMeta } =
    itemIds.length > 0
      ? await supabase.from("inventory").select("id, product_category").in("id", itemIds)
      : { data: [] };
  const { data: investMeta } =
    invIds.length > 0
      ? await supabase.from("erp_investments").select("id, item_details").in("id", invIds)
      : { data: [] };

  const invCat = new Map((invMeta ?? []).map((i) => [i.id, i.product_category as string]));
  const investDet = new Map((investMeta ?? []).map((i) => [i.id, i.item_details as string]));

  function saleLabel(s: (typeof buyerRows)[0]): string {
    const st = s.sale_type ?? "ממלאי";
    if (st === "תיווך") return s.item_description ?? "תיווך";
    if (st === "פרויקט חדש" && s.investment_id) return investDet.get(s.investment_id) ?? "פרויקט";
    if (s.item_id) return invCat.get(s.item_id) ?? "ממלאי";
    return "מכירה";
  }

  function paidForSale(sid: string, amountPaidRow: number) {
    return Number(amountPaidRow ?? 0) + (paymentExtraBySale.get(sid) ?? 0);
  }

  const buyerSalesList = buyerRows.map((s) => {
    const qty = Math.max(1, Math.floor(Number(s.quantity ?? 1)));
    const total =
      s.total_price != null ? Number(s.total_price) : Number(s.sale_price ?? 0) * qty;
    return {
      id: s.id,
      sale_type: s.sale_type ?? "ממלאי",
      sale_date: s.sale_date ?? "",
      total_price: total,
      total_paid: paidForSale(s.id, Number(s.amount_paid ?? 0)),
      label: saleLabel(s),
    };
  });

  const sellerSalesList = sellerRows.map((s) => {
    const qty = Math.max(1, Math.floor(Number(s.quantity ?? 1)));
    const total =
      s.total_price != null ? Number(s.total_price) : Number(s.sale_price ?? 0) * qty;
    return {
      id: s.id,
      sale_type: s.sale_type ?? "ממלאי",
      sale_date: s.sale_date ?? "",
      total_price: total,
      total_paid: paidForSale(s.id, Number(s.amount_paid ?? 0)),
      label: saleLabel(s),
    };
  });

  const investmentsList = investRows.map((i) => ({
    id: i.id,
    item_details: i.item_details ?? null,
    status: i.status ?? "",
    total_agreed_price: Number(i.total_agreed_price ?? 0),
    amount_paid: Number(i.amount_paid ?? 0),
    target_date: i.target_date ?? null,
  }));

  const ledgerForUi = ledgerRows.map((p) => {
    let summary = "";
    if (p.entity_type === "sale") {
      const row = [...buyerRows, ...sellerRows].find((s) => s.id === p.entity_id);
      summary = row ? `מכירה: ${saleLabel(row)}` : "מכירה";
    } else {
      const inv = investRows.find((i) => i.id === p.entity_id);
      summary = inv ? `השקעה: ${inv.item_details ?? p.entity_id.slice(0, 8)}` : "השקעה";
    }
    return { ...p, summary };
  });

  const TYPE_LABELS: Record<string, string> = {
    Scribe: "סופר",
    Merchant: "סוחר",
    End_Customer: "לקוח",
    Other: "אחר",
  };

  const netMutual = debtFromContact - debtToContact;

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
      netMutual={netMutual}
      typeLabel={TYPE_LABELS[contact.type ?? "Other"] ?? contact.type ?? "אחר"}
      ledgerPayments={ledgerForUi}
      buyerSales={buyerSalesList}
      sellerSales={sellerSalesList}
      investments={investmentsList}
      transactions={(txRes.data ?? []).map((t) => ({
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
