"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ActionResult = { success: true } | { success: false; error: string };

export type SaleRecord = {
  id: string;
  item_id: string;
  buyer_id: string | null;
  sale_price: number;
  cost_price: number | null;
  profit: number | null;
  sale_date: string;
  notes: string | null;
  created_at: string;
  item_category?: string;
  buyer_name?: string;
};

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
      .select("id, item_id, buyer_id, sale_price, cost_price, profit, sale_date, notes, created_at")
      .eq("user_id", user.id)
      .order("sale_date", { ascending: false });

    if (error) return { success: false, error: error.message };

    const itemIds = [...new Set((data ?? []).map((r) => r.item_id).filter(Boolean))];
    const buyerIds = [...new Set((data ?? []).map((r) => r.buyer_id).filter(Boolean))];

    const { data: invData } = itemIds.length > 0
      ? await supabase.from("inventory").select("id, product_category").in("id", itemIds)
      : { data: [] };
    const { data: buyerData } = buyerIds.length > 0
      ? await supabase.from("crm_contacts").select("id, name").in("id", buyerIds)
      : { data: [] };

    const invMap = new Map((invData ?? []).map((i) => [i.id, i.product_category]));
    const buyerMap = new Map((buyerData ?? []).map((b) => [b.id, b.name]));

    const sales = (data ?? []).map((r) => ({
      id: r.id,
      item_id: r.item_id,
      buyer_id: r.buyer_id ?? null,
      sale_price: Number(r.sale_price ?? 0),
      cost_price: r.cost_price != null ? Number(r.cost_price) : null,
      profit: r.profit != null ? Number(r.profit) : null,
      sale_date: r.sale_date ?? "",
      notes: r.notes ?? null,
      created_at: r.created_at ?? "",
      item_category: invMap.get(r.item_id) ?? undefined,
      buyer_name: r.buyer_id ? buyerMap.get(r.buyer_id) ?? undefined : undefined,
    }));

    return { success: true, sales };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function createSale(
  itemId: string,
  buyerId: string | null,
  salePrice: number,
  notes?: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data: item } = await supabase
      .from("inventory")
      .select("id, cost_price, status")
      .eq("id", itemId)
      .eq("user_id", user.id)
      .single();

    if (!item) return { success: false, error: "פריט לא נמצא" };
    if (item.status === "sold") return { success: false, error: "הפריט כבר נמכר" };

    const costPrice = item.cost_price != null ? Number(item.cost_price) : null;
    const profit = costPrice != null ? salePrice - costPrice : null;

    const { error: saleErr } = await supabase.from("erp_sales").insert({
      user_id: user.id,
      item_id: itemId,
      buyer_id: buyerId || null,
      sale_price: salePrice,
      cost_price: costPrice,
      profit,
      notes: notes?.trim() || null,
    });

    if (saleErr) return { success: false, error: saleErr.message };

    const { error: invErr } = await supabase
      .from("inventory")
      .update({ status: "sold", updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .eq("user_id", user.id);

    if (invErr) return { success: false, error: invErr.message };

    revalidatePath("/sales");
    revalidatePath("/inventory");
    revalidatePath("/");
    return { success: true };
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
