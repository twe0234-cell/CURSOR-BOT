"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { buildInventorySaleLabelSkuPrecise } from "@/lib/sales/inventoryDisplay";
import {
  INVENTORY_ACTIVE_STATUSES,
  INVENTORY_SOLD_STATUS_HE,
  isInventorySoldStatus,
} from "@/lib/inventory/status";
import { recordLedgerPayment, type LedgerDirection } from "@/app/payments/actions";

type ActionResult = { success: true } | { success: false; error: string };

export type SaleRecord = {
  id: string;
  item_id: string | null;
  buyer_id: string | null;
  sale_price: number;
  cost_price: number | null;
  profit: number | null;
  sale_date: string;
  notes: string | null;
  created_at: string;
  sale_type?: string;
  item_description?: string | null;
  seller_id?: string | null;
  investment_id?: string | null;
  commission_profit?: number | null;
  commission_received?: number | null;
  quantity?: number | null;
  total_price?: number | null;
  amount_paid_row?: number | null;
  total_paid?: number;
  remaining_balance?: number | null;
  item_category?: string;
  buyer_name?: string;
  seller_name?: string;
  investment_details?: string;
  /** Cost-recovery: margin recognized only after payments exceed cost (capped at paper margin). */
  realized_recovery_profit?: number | null;
  actual_commission_received?: number | null;
};

export type InventorySaleOption = {
  id: string;
  sku: string | null;
  product_category: string | null;
  category_meta: Record<string, unknown> | null;
  quantity: number;
  status: string | null;
  scribe_name: string | null;
  display_label: string;
};

export async function fetchInventoryForSales(): Promise<
  { success: true; items: InventorySaleOption[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("inventory")
      .select("id, sku, product_category, category_meta, quantity, status, scribe_id")
      .eq("user_id", user.id)
      .in("status", [...INVENTORY_ACTIVE_STATUSES])
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const rows = data ?? [];

    const items: InventorySaleOption[] = rows
      .map((r) => {
        const qty = Math.max(0, Math.floor(Number(r.quantity ?? 1)));
        return {
          id: r.id as string,
          sku: (r.sku as string | null) ?? null,
          product_category: (r.product_category as string | null) ?? null,
          category_meta: (r.category_meta as Record<string, unknown> | null) ?? null,
          quantity: qty,
          status: (r.status as string | null) ?? null,
          scribe_name: null as string | null,
          display_label: "",
        };
      })
      .filter((i) => i.quantity > 0)
      .map((i) => ({
        ...i,
        display_label: buildInventorySaleLabelSkuPrecise(i),
      }));

    return { success: true, items };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export type ExpenseRecord = {
  id: string;
  category: string;
  amount: number;
  expense_date: string;
  notes: string | null;
  created_at: string;
};

export async function fetchSales(): Promise<
  { success: true; sales: SaleRecord[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("erp_sales")
      .select(
        "id, item_id, buyer_id, sale_price, cost_price, profit, sale_date, notes, created_at, sale_type, item_description, seller_id, investment_id, commission_profit, commission_received, actual_commission_received, quantity, total_price, amount_paid"
      )
      .eq("user_id", user.id)
      .order("sale_date", { ascending: false });

    if (error) return { success: false, error: error.message };

    const rows = data ?? [];
    const itemIds = [...new Set(rows.map((r) => r.item_id).filter(Boolean))];
    const buyerIds = [...new Set(rows.map((r) => r.buyer_id).filter(Boolean))];
    const sellerIds = [...new Set(rows.map((r) => r.seller_id).filter(Boolean))];
    const invIds = [...new Set(rows.map((r) => r.investment_id).filter(Boolean))];
    const saleIds = rows.map((r) => r.id);

    const { data: invData } = itemIds.length > 0
      ? await supabase.from("inventory").select("id, product_category").in("id", itemIds as string[])
      : { data: [] };
    const { data: buyerData } = buyerIds.length > 0 || sellerIds.length > 0
      ? await supabase.from("crm_contacts").select("id, name").in("id", [...buyerIds, ...sellerIds] as string[])
      : { data: [] };
    const { data: investData } = invIds.length > 0
      ? await supabase.from("erp_investments").select("id, item_details").in("id", invIds as string[])
      : { data: [] };

    const paySumBySale = new Map<string, number>();
    if (saleIds.length > 0) {
      const { data: payments, error: payErr } = await supabase
        .from("erp_payments")
        .select("entity_id, amount, direction")
        .eq("user_id", user.id)
        .eq("entity_type", "sale")
        .in("entity_id", saleIds);
      if (!payErr && payments) {
        for (const p of payments) {
          const eid = p.entity_id as string;
          const amt = Number(p.amount ?? 0);
          const signed = (p as { direction?: string }).direction === "outgoing" ? -amt : amt;
          paySumBySale.set(eid, (paySumBySale.get(eid) ?? 0) + signed);
        }
      }
    }

    const invMap = new Map((invData ?? []).map((i) => [i.id, i.product_category]));
    const contactMap = new Map((buyerData ?? []).map((b) => [b.id, b.name]));
    const investMap = new Map((investData ?? []).map((i) => [i.id, i.item_details]));

    const sales: SaleRecord[] = rows.map((r) => {
      const qty = Math.max(1, Math.floor(Number(r.quantity ?? 1)));
      const totalPrice =
        r.total_price != null ? Number(r.total_price) : Number(r.sale_price ?? 0) * qty;
      const amountPaidRow = Number(r.amount_paid ?? 0);
      const extraPaid = paySumBySale.get(r.id) ?? 0;
      const totalPaid = amountPaidRow + extraPaid;
      const remaining = totalPrice - totalPaid;
      const cost = r.cost_price != null ? Number(r.cost_price) : null;
      const paperMargin = cost != null ? Math.max(0, totalPrice - cost) : null;
      let realizedRecovery: number | null = null;
      if (cost != null) {
        if (totalPaid > cost) {
          realizedRecovery = Math.min(totalPaid - cost, paperMargin ?? Number.POSITIVE_INFINITY);
        } else {
          realizedRecovery = 0;
        }
      }

      const acr =
        (r as { actual_commission_received?: unknown }).actual_commission_received != null
          ? Number((r as { actual_commission_received: unknown }).actual_commission_received)
          : r.commission_received != null
            ? Number(r.commission_received)
            : null;

      return {
        id: r.id,
        item_id: r.item_id ?? null,
        buyer_id: r.buyer_id ?? null,
        sale_price: Number(r.sale_price ?? 0),
        cost_price: cost,
        profit: r.profit != null ? Number(r.profit) : null,
        sale_date: r.sale_date ?? "",
        notes: r.notes ?? null,
        created_at: r.created_at ?? "",
        sale_type: r.sale_type ?? "ממלאי",
        item_description: r.item_description ?? null,
        seller_id: r.seller_id ?? null,
        investment_id: r.investment_id ?? null,
        commission_profit: r.commission_profit != null ? Number(r.commission_profit) : null,
        commission_received:
          r.commission_received != null ? Number(r.commission_received) : null,
        actual_commission_received: acr,
        quantity: qty,
        total_price: totalPrice,
        amount_paid_row: amountPaidRow,
        total_paid: totalPaid,
        remaining_balance: remaining,
        realized_recovery_profit: realizedRecovery,
        item_category: r.item_id ? invMap.get(r.item_id) ?? undefined : undefined,
        buyer_name: r.buyer_id ? contactMap.get(r.buyer_id) ?? undefined : undefined,
        seller_name: r.seller_id ? contactMap.get(r.seller_id) ?? undefined : undefined,
        investment_details: r.investment_id ? investMap.get(r.investment_id) ?? undefined : undefined,
      };
    });

    return { success: true, sales };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export type CreateSaleParams =
  | { sale_type: "ממלאי"; item_id: string; buyer_id?: string | null; quantity?: number; sale_price: number; amount_paid?: number; notes?: string }
  | { sale_type: "תיווך"; item_description: string; buyer_id?: string | null; seller_id?: string | null; actual_commission_received: number; notes?: string }
  | { sale_type: "פרויקט חדש"; investment_id: string; buyer_id?: string | null; quantity?: number; sale_price: number; amount_paid?: number; notes?: string };

export async function addSalePayment(
  saleId: string,
  amount: number,
  paymentDate?: string,
  notes?: string,
  opts?: { method?: string | null; direction?: LedgerDirection }
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: sale } = await supabase
      .from("erp_sales")
      .select("id")
      .eq("id", saleId)
      .eq("user_id", user.id)
      .single();
    if (!sale) return { success: false, error: "מכירה לא נמצאה" };

    return recordLedgerPayment({
      entityId: saleId,
      entityType: "sale",
      amount,
      paymentDate,
      notes,
      method: opts?.method ?? null,
      direction: opts?.direction ?? "incoming",
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function createSale(params: CreateSaleParams): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    if (params.sale_type === "ממלאי") {
      const { data: item } = await supabase
        .from("inventory")
        .select("id, cost_price, target_price, status, quantity")
        .eq("id", params.item_id)
        .eq("user_id", user.id)
        .single();

      if (!item) return { success: false, error: "פריט לא נמצא" };
      if (isInventorySoldStatus(item.status as string)) return { success: false, error: "הפריט כבר נמכר" };

      const invQty = Math.max(0, Math.floor(Number(item.quantity ?? 1)));
      if (invQty <= 0) return { success: false, error: "אין כמות זמינה במלאי" };

      let qty = Math.floor(Number(params.quantity ?? 1));
      if (qty < 1) qty = 1;
      if (qty > invQty) {
        return { success: false, error: `הכמות המקסימלית הזמינה היא ${invQty}` };
      }

      const totalPrice = qty * params.sale_price;
      const amountPaid = params.amount_paid ?? 0;
      const cpu = item.cost_price != null ? Number(item.cost_price) : null;
      const tpu = item.target_price != null ? Number(item.target_price) : null;
      const costPrice = cpu != null ? cpu * qty : null;
      const profit = costPrice != null ? totalPrice - costPrice : null;

      const { error: saleErr } = await supabase.from("erp_sales").insert({
        user_id: user.id,
        sale_type: "ממלאי",
        item_id: params.item_id,
        buyer_id: params.buyer_id || null,
        quantity: qty,
        sale_price: params.sale_price,
        total_price: totalPrice,
        amount_paid: amountPaid,
        cost_price: costPrice,
        profit,
        notes: params.notes?.trim() || null,
      });

      if (saleErr) return { success: false, error: saleErr.message };

      const newQty = invQty - qty;
      const newTotalCost = cpu != null && newQty > 0 ? cpu * newQty : null;
      const newTotalTarget = tpu != null && newQty > 0 ? tpu * newQty : null;

      const { error: invErr } = await supabase
        .from("inventory")
        .update({
          quantity: newQty,
          total_cost: newTotalCost,
          total_target_price: newTotalTarget,
          status: newQty <= 0 ? INVENTORY_SOLD_STATUS_HE : item.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.item_id)
        .eq("user_id", user.id);

      if (invErr) return { success: false, error: invErr.message };
    } else if (params.sale_type === "תיווך") {
      const cr = params.actual_commission_received;
      const { error: saleErr } = await supabase.from("erp_sales").insert({
        user_id: user.id,
        sale_type: "תיווך",
        item_id: null,
        item_description: params.item_description.trim() || null,
        buyer_id: params.buyer_id || null,
        seller_id: params.seller_id || null,
        quantity: 1,
        sale_price: cr,
        total_price: cr,
        amount_paid: 0,
        cost_price: null,
        profit: cr,
        commission_profit: cr,
        commission_received: cr,
        actual_commission_received: cr,
        notes: params.notes?.trim() || null,
      });
      if (saleErr) return { success: false, error: saleErr.message };
    } else if (params.sale_type === "פרויקט חדש") {
      const { data: inv } = await supabase
        .from("erp_investments")
        .select("id, total_agreed_price")
        .eq("id", params.investment_id)
        .eq("user_id", user.id)
        .single();
      if (!inv) return { success: false, error: "השקעה לא נמצאה" };

      const totalPrice = params.sale_price;
      const amountPaid = params.amount_paid ?? 0;
      const costPrice = Number(inv.total_agreed_price ?? 0);
      const profit = totalPrice - costPrice;

      const { error: saleErr } = await supabase.from("erp_sales").insert({
        user_id: user.id,
        sale_type: "פרויקט חדש",
        item_id: null,
        investment_id: params.investment_id,
        buyer_id: params.buyer_id || null,
        quantity: 1,
        sale_price: totalPrice,
        total_price: totalPrice,
        amount_paid: amountPaid,
        cost_price: costPrice,
        profit,
        notes: params.notes?.trim() || null,
      });
      if (saleErr) return { success: false, error: saleErr.message };

      const { error: invErr } = await supabase
        .from("erp_investments")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", params.investment_id)
        .eq("user_id", user.id);
      if (invErr) return { success: false, error: invErr.message };
    } else {
      return { success: false, error: "סוג מכירה לא תקין" };
    }

    revalidatePath("/sales");
    revalidatePath("/inventory");
    revalidatePath("/investments");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function bulkImportSales(
  rows: Record<string, unknown>[]
): Promise<{ success: true; imported: number; errors: string[] } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: invItems } = await supabase
      .from("inventory")
      .select("id, product_category, status")
      .eq("user_id", user.id)
      .in("status", [...INVENTORY_ACTIVE_STATUSES]);
    const invByCategory = new Map((invItems ?? []).map((i) => [i.product_category?.trim().toLowerCase() ?? "", i]));
    const invList = (invItems ?? []).filter((i) => !isInventorySoldStatus(i.status));

    const { data: contacts } = await supabase
      .from("crm_contacts")
      .select("id, name")
      .eq("user_id", user.id);
    const contactByName = new Map((contacts ?? []).map((c) => [c.name?.trim().toLowerCase() ?? "", c.id]));

    const errors: string[] = [];
    let imported = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const saleType = String(r["sale_type"] ?? r["סוג מכירה"] ?? "ממלאי").trim() || "ממלאי";
      const salePrice = Number(r["sale_price"] ?? r["מחיר"] ?? r["מחיר מכירה"] ?? 0) || 0;
      const buyerName = String(r["buyer"] ?? r["קונה"] ?? "").trim();
      const buyerId = buyerName ? contactByName.get(buyerName.toLowerCase()) ?? null : null;
      const notes = String(r["notes"] ?? r["הערות"] ?? "").trim() || null;

      if (saleType === "ממלאי") {
        const itemCategory = String(r["item_category"] ?? r["פריט"] ?? r["קטגוריה"] ?? "").trim();
        const itemId = itemCategory ? invByCategory.get(itemCategory.toLowerCase())?.id : invList[0]?.id;
        if (!itemId) {
          errors.push(`שורה ${i + 1}: לא נמצא פריט במלאי`);
          continue;
        }
        const res = await createSale({
          sale_type: "ממלאי",
          item_id: itemId,
          buyer_id: buyerId ?? undefined,
          sale_price: salePrice,
          notes: notes ?? undefined,
        });
        if (res.success) imported++;
        else errors.push(`שורה ${i + 1}: ${res.error}`);
      } else if (saleType === "תיווך") {
        const itemDesc = String(r["item_description"] ?? r["תיאור פריט"] ?? "").trim();
        const sellerName = String(r["seller"] ?? r["מוכר"] ?? "").trim();
        const sellerId = sellerName ? contactByName.get(sellerName.toLowerCase()) ?? null : null;
        const commission = Number(r["commission_profit"] ?? r["עמלת תיווך"] ?? r["עמלה"] ?? 0) || 0;
        if (!itemDesc || commission <= 0) {
          errors.push(`שורה ${i + 1}: הזן תיאור פריט ועמלת תיווך`);
          continue;
        }
        const res = await createSale({
          sale_type: "תיווך",
          item_description: itemDesc,
          buyer_id: buyerId ?? undefined,
          seller_id: sellerId ?? undefined,
          actual_commission_received: commission,
          notes: notes ?? undefined,
        });
        if (res.success) imported++;
        else errors.push(`שורה ${i + 1}: ${res.error}`);
      } else {
        errors.push(`שורה ${i + 1}: ייבוא פרויקט חדש לא נתמך ב-CSV`);
      }
    }
    revalidatePath("/sales");
    return { success: true, imported, errors };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function fetchExpenses(): Promise<
  { success: true; expenses: ExpenseRecord[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("erp_expenses")
      .select("id, category, amount, expense_date, notes, created_at")
      .eq("user_id", user.id)
      .order("expense_date", { ascending: false });

    if (error) return { success: false, error: error.message };

    const expenses = (data ?? []).map((r) => ({
      id: r.id,
      category: r.category ?? "",
      amount: Number(r.amount ?? 0),
      expense_date: r.expense_date ?? "",
      notes: r.notes ?? null,
      created_at: r.created_at ?? "",
    }));

    return { success: true, expenses };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function createExpense(
  category: string,
  amount: number,
  expenseDate?: string,
  notes?: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };
    if (!category.trim()) return { success: false, error: "הזן קטגוריה" };

    const { error } = await supabase.from("erp_expenses").insert({
      user_id: user.id,
      category: category.trim(),
      amount,
      expense_date: expenseDate || new Date().toISOString().slice(0, 10),
      notes: notes?.trim() || null,
    });

    if (error) return { success: false, error: error.message };
    revalidatePath("/sales");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("erp_expenses")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };
    revalidatePath("/sales");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
