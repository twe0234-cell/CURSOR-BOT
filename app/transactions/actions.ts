"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type QuickTxType =
  | "payment_in"    // תשלום שהתקבל — על מכירה
  | "payment_out";  // תשלום לסופר — על השקעה

export type QuickTxRow = {
  id: string;
  amount: number;
  direction: string;
  payment_date: string;
  method: string | null;
  notes: string | null;
  entity_type: string;
  entity_label: string;
};

export type EntityOption = {
  id: string;
  label: string;
  type: "sale" | "investment";
  remaining: number;
};

export async function fetchOpenEntities(): Promise<
  { success: true; entities: EntityOption[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    // מכירות פתוחות
    const { data: sales } = await supabase
      .from("erp_sales")
      .select("id, sale_type, sale_date, total_price, total_paid, item_description, buyer_id")
      .eq("user_id", user.id)
      .order("sale_date", { ascending: false })
      .limit(60);

    // שמות קונים
    const buyerIds = [...new Set((sales ?? []).map((s) => s.buyer_id).filter(Boolean))] as string[];
    const nameMap = new Map<string, string>();
    if (buyerIds.length > 0) {
      const { data: contacts } = await supabase
        .from("crm_contacts")
        .select("id, name")
        .in("id", buyerIds);
      (contacts ?? []).forEach((c) => nameMap.set(c.id, c.name ?? ""));
    }

    const saleEntities: EntityOption[] = (sales ?? []).map((s) => {
      const paid = Number(s.total_paid ?? 0);
      const total = Number(s.total_price ?? 0);
      const buyer = s.buyer_id ? (nameMap.get(s.buyer_id) ?? "לקוח") : "לקוח";
      const desc = s.item_description?.slice(0, 40) ?? s.sale_type ?? "מכירה";
      return {
        id: s.id,
        label: `${buyer} — ${desc} (${new Date(s.sale_date).toLocaleDateString("he-IL")}) יתרה: ₪${Math.max(0, total - paid).toLocaleString("he-IL")}`,
        type: "sale" as const,
        remaining: Math.max(0, total - paid),
      };
    });

    // השקעות פתוחות
    const { data: investments } = await supabase
      .from("erp_investments")
      .select("id, item_details, total_agreed_price, amount_paid, status, target_date")
      .eq("user_id", user.id)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(40);

    const investmentEntities: EntityOption[] = (investments ?? []).map((inv) => {
      const paid = Number(inv.amount_paid ?? 0);
      const total = Number(inv.total_agreed_price ?? 0);
      return {
        id: inv.id,
        label: `סופר — ${inv.item_details?.slice(0, 40) ?? "השקעה"} נותר: ₪${Math.max(0, total - paid).toLocaleString("he-IL")}`,
        type: "investment" as const,
        remaining: Math.max(0, total - paid),
      };
    });

    return { success: true, entities: [...saleEntities, ...investmentEntities] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

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

export async function fetchRecentPayments(): Promise<
  { success: true; payments: QuickTxRow[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("erp_payments")
      .select("id, amount, direction, payment_date, method, notes, entity_type, entity_id")
      .eq("user_id", user.id)
      .order("payment_date", { ascending: false })
      .limit(30);

    if (error) return { success: false, error: error.message };

    const rows: QuickTxRow[] = (data ?? []).map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      direction: r.direction,
      payment_date: r.payment_date,
      method: r.method,
      notes: r.notes,
      entity_type: r.entity_type,
      entity_label: r.entity_type === "sale" ? "מכירה" : "השקעה",
    }));
    return { success: true, payments: rows };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}
