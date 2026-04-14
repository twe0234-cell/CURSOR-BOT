"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type EntityCategory =
  | "sale_regular"   // מכירה רגילה
  | "sale_brokerage" // תיווך
  | "investment"     // תשלום לסופר
  | "market_book";   // ספר תורה מהמאגר (הערת מו״מ)

export type EntityOption = {
  id: string;
  label: string;
  category: EntityCategory;
  subLabel: string;
  remaining: number;
  entityType: "sale" | "investment"; // for erp_payments
};

export type QuickTxRow = {
  id: string;
  amount: number;
  direction: string;
  payment_date: string;
  method: string | null;
  notes: string | null;
  entity_type: string;
  entity_label: string;
  category_label: string;
};

// ─── שליפת כל הישויות הפתוחות ───────────────────────────────────────────────

export async function fetchOpenEntities(): Promise<
  { success: true; entities: EntityOption[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    // ── מכירות ──────────────────────────────────────────────────────────────
    const { data: sales } = await supabase
      .from("erp_sales")
      .select("id, sale_type, sale_date, total_price, total_paid, item_description, buyer_id")
      .eq("user_id", user.id)
      .order("sale_date", { ascending: false })
      .limit(80);

    const buyerIds = [...new Set((sales ?? []).map((s) => s.buyer_id).filter(Boolean))] as string[];
    const nameMap = new Map<string, string>();
    if (buyerIds.length > 0) {
      const { data: contacts } = await supabase
        .from("crm_contacts").select("id, name").in("id", buyerIds);
      (contacts ?? []).forEach((c) => nameMap.set(c.id, c.name ?? ""));
    }

    const saleEntities: EntityOption[] = (sales ?? []).map((s) => {
      const paid = Number(s.total_paid ?? 0);
      const total = Number(s.total_price ?? 0);
      const remaining = Math.max(0, total - paid);
      const buyer = s.buyer_id ? (nameMap.get(s.buyer_id) ?? "לקוח") : "לקוח";
      const isBrokerage = s.sale_type === "תיווך";
      const dateStr = new Date(s.sale_date).toLocaleDateString("he-IL");
      const desc = s.item_description?.slice(0, 35) ?? (isBrokerage ? "תיווך" : "מכירה");
      return {
        id: s.id,
        label: `${buyer} — ${desc}`,
        subLabel: `${dateStr} · שולם ₪${paid.toLocaleString("he-IL")} / ₪${total.toLocaleString("he-IL")} · יתרה ₪${remaining.toLocaleString("he-IL")}`,
        category: isBrokerage ? "sale_brokerage" : "sale_regular",
        remaining,
        entityType: "sale",
      };
    });

    // ── השקעות (תשלומים לסופרים) ─────────────────────────────────────────────
    const { data: investments } = await supabase
      .from("erp_investments")
      .select("id, item_details, total_agreed_price, amount_paid, status, target_date, scribe_id")
      .eq("user_id", user.id)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(50);

    const scribeIds = [...new Set((investments ?? []).map((i) => i.scribe_id).filter(Boolean))] as string[];
    const scribeMap = new Map<string, string>();
    if (scribeIds.length > 0) {
      const { data: sc } = await supabase.from("crm_contacts").select("id, name").in("id", scribeIds);
      (sc ?? []).forEach((c) => scribeMap.set(c.id, c.name ?? ""));
    }

    const investmentEntities: EntityOption[] = (investments ?? []).map((inv) => {
      const paid = Number(inv.amount_paid ?? 0);
      const total = Number(inv.total_agreed_price ?? 0);
      const remaining = Math.max(0, total - paid);
      const scribeName = inv.scribe_id ? (scribeMap.get(inv.scribe_id) ?? "סופר") : "סופר";
      const desc = inv.item_details?.slice(0, 35) ?? "פרויקט";
      return {
        id: inv.id,
        label: `${scribeName} — ${desc}`,
        subLabel: `שולם ₪${paid.toLocaleString("he-IL")} / ₪${total.toLocaleString("he-IL")} · נותר ₪${remaining.toLocaleString("he-IL")}`,
        category: "investment",
        remaining,
        entityType: "investment",
      };
    });

    return { success: true, entities: [...saleEntities, ...investmentEntities] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ─── שליפת ספרי תורה מהמאגר (לרישום הערת תשלום) ────────────────────────────

export type MarketBookOption = {
  id: string;
  label: string;
  subLabel: string;
  asking_price: number | null;
};

export async function fetchMarketBooksForTx(): Promise<
  { success: true; books: MarketBookOption[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("market_torah_books")
      .select("id, sku, script_type, torah_size, asking_price, external_sofer_name, market_stage, sofer_id, dealer_id")
      .eq("user_id", user.id)
      .not("market_stage", "in", '("archived","deal_closed")')
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) return { success: false, error: error.message };

    const contactIds = [...new Set([
      ...(data ?? []).map(b => b.sofer_id),
      ...(data ?? []).map(b => b.dealer_id),
    ].filter(Boolean))] as string[];

    const nameMap = new Map<string, string>();
    if (contactIds.length > 0) {
      const { data: cList } = await supabase.from("crm_contacts").select("id, name").in("id", contactIds);
      (cList ?? []).forEach(c => nameMap.set(c.id, c.name ?? ""));
    }

    const books: MarketBookOption[] = (data ?? []).map((b) => {
      const owner = b.dealer_id ? nameMap.get(b.dealer_id) : b.sofer_id ? nameMap.get(b.sofer_id) : null;
      const size = b.torah_size ? `${b.torah_size}״` : "";
      const script = b.script_type ?? "";
      const price = b.asking_price != null
        ? `₪${(Number(b.asking_price) / 1000).toLocaleString("he-IL")} אל"ש`
        : "";
      return {
        id: b.id,
        label: `${owner ?? b.external_sofer_name ?? "—"} · ${script} ${size}`.trim(),
        subLabel: `${b.sku ?? ""} · ${price}`,
        asking_price: b.asking_price,
      };
    });

    return { success: true, books };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ─── רישום תשלום מהיר ────────────────────────────────────────────────────────

export async function recordQuickPayment(opts: {
  entityId: string;
  entityType: "sale" | "investment";
  amount: number;
  paymentDate: string;
  method: string | null;
  notes: string | null;
  direction: "incoming" | "outgoing";
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    if (opts.amount <= 0) return { success: false, error: "הזן סכום חיובי" };
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase.from("erp_payments").insert({
      user_id: user.id,
      entity_id: opts.entityId,
      entity_type: opts.entityType,
      amount: opts.amount,
      direction: opts.direction,
      payment_date: new Date(opts.paymentDate).toISOString(),
      method: opts.method?.trim() || null,
      notes: opts.notes?.trim() || null,
    });
    if (error) return { success: false, error: error.message };

    revalidatePath("/transactions");
    revalidatePath("/sales");
    revalidatePath("/investments");
    revalidatePath("/crm");
    revalidatePath("/");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ─── הוספת הערת מאגר (ללא תשלום ב-ledger) ──────────────────────────────────

export async function recordMarketBookNote(opts: {
  bookId: string;
  note: string;
  amount: number | null;
  paymentDate: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const noteText = opts.amount
      ? `[₪${opts.amount.toLocaleString("he-IL")}] ${opts.note}`.trim()
      : opts.note.trim();
    if (!noteText) return { success: false, error: "הזן הערה" };

    const { error } = await supabase.from("market_contact_logs").insert({
      user_id: user.id,
      book_id: opts.bookId,
      note: noteText,
      contacted_at: new Date(opts.paymentDate).toISOString(),
    });
    if (error) return { success: false, error: error.message };

    revalidatePath("/transactions");
    revalidatePath("/market");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ─── שליפת תנועות אחרונות ────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  "sale-incoming":        "מכירה — כסף נכנס",
  "sale-outgoing":        "מכירה — החזר",
  "investment-outgoing":  "תשלום לסופר",
  "investment-incoming":  "החזר מסופר",
};

export async function fetchRecentPayments(): Promise<
  { success: true; payments: QuickTxRow[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: payments, error } = await supabase
      .from("erp_payments")
      .select("id, amount, direction, payment_date, method, notes, entity_type, entity_id")
      .eq("user_id", user.id)
      .order("payment_date", { ascending: false })
      .limit(50);

    if (error) return { success: false, error: error.message };

    // שליפת labels ממכירות
    const saleIds = (payments ?? []).filter(p => p.entity_type === "sale").map(p => p.entity_id);
    const investIds = (payments ?? []).filter(p => p.entity_type === "investment").map(p => p.entity_id);
    const labelMap = new Map<string, string>();

    if (saleIds.length > 0) {
      const { data: sales } = await supabase
        .from("erp_sales").select("id, sale_type, item_description, buyer_id").in("id", saleIds);
      const bIds = [...new Set((sales ?? []).map(s => s.buyer_id).filter(Boolean))] as string[];
      const nm = new Map<string, string>();
      if (bIds.length > 0) {
        const { data: c } = await supabase.from("crm_contacts").select("id,name").in("id", bIds);
        (c ?? []).forEach(c => nm.set(c.id, c.name ?? ""));
      }
      (sales ?? []).forEach(s => {
        const buyer = s.buyer_id ? (nm.get(s.buyer_id) ?? "") : "";
        const isBrok = s.sale_type === "תיווך";
        const desc = s.item_description?.slice(0, 30) ?? (isBrok ? "תיווך" : "מכירה");
        labelMap.set(s.id, `${isBrok ? "🤝 " : "🛒 "}${buyer ? buyer + " — " : ""}${desc}`);
      });
    }

    if (investIds.length > 0) {
      const { data: invs } = await supabase
        .from("erp_investments").select("id, item_details, scribe_id").in("id", investIds);
      const scIds = [...new Set((invs ?? []).map(i => i.scribe_id).filter(Boolean))] as string[];
      const nm = new Map<string, string>();
      if (scIds.length > 0) {
        const { data: c } = await supabase.from("crm_contacts").select("id,name").in("id", scIds);
        (c ?? []).forEach(c => nm.set(c.id, c.name ?? ""));
      }
      (invs ?? []).forEach(i => {
        const scribe = i.scribe_id ? (nm.get(i.scribe_id) ?? "סופר") : "סופר";
        labelMap.set(i.id, `✍️ ${scribe} — ${i.item_details?.slice(0, 30) ?? "פרויקט"}`);
      });
    }

    const rows: QuickTxRow[] = (payments ?? []).map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      direction: r.direction,
      payment_date: r.payment_date,
      method: r.method,
      notes: r.notes,
      entity_type: r.entity_type,
      entity_label: labelMap.get(r.entity_id) ?? (r.entity_type === "sale" ? "מכירה" : "השקעה"),
      category_label: CATEGORY_LABELS[`${r.entity_type}-${r.direction}`] ?? r.entity_type,
    }));

    return { success: true, payments: rows };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}
