"use server";

import { createClient } from "@/src/lib/supabase/server";
import { INVENTORY_ACTIVE_STATUSES } from "@/lib/inventory/status";

export type DashboardKpis = {
  /** עלות מלאי קיים - SUM total_cost where status != 'sold' */
  totalInvested: number;
  /** שווי שוק / צפי הכנסות - SUM total_target_price where status != 'sold' */
  expectedRevenue: number;
  /** רווח צפוי - expectedRevenue - totalInvested */
  potentialProfit: number;
  /** השקעות פתוחות - remaining balance on active investments */
  activeInvestmentsBalance: number;
  /** מכירות החודש - SUM sale_price from erp_sales this month */
  monthlySales: number;
  monthlyNetProfit: number;
  /** Unpaid investments with target_date - money needed in bank until writing completion */
  cashFlowRequired: Array<{ id: string; scribe_name: string | null; item_details: string | null; remaining_balance: number; target_date: string }>;
};

export type CategoryCostRevenueItem = {
  category: string;
  cost: number;
  revenue: number;
};

export type InventoryDistributionItem = {
  name: string;
  value: number;
  fill?: string;
};

export type RecentInventoryItem = {
  id: string;
  product_category: string | null;
  created_at: string;
};

export type MonthlyDataPoint = {
  month: string;
  income: number;
  expenses: number;
};

export async function fetchDashboardKpis(): Promise<
  { success: true; kpis: DashboardKpis } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const now = new Date();
    const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const { data: inv } = await supabase
      .from("inventory")
      .select("total_cost, total_target_price, status")
      .eq("user_id", user.id)
      .in("status", [...INVENTORY_ACTIVE_STATUSES]);

    let totalInvested = 0;
    let expectedRevenue = 0;
    for (const i of inv ?? []) {
      totalInvested += i.total_cost != null ? Number(i.total_cost) : 0;
      expectedRevenue += i.total_target_price != null ? Number(i.total_target_price) : 0;
    }
    const potentialProfit = expectedRevenue - totalInvested;

    const { data: salesThisMonth } = await supabase
      .from("erp_sales")
      .select("sale_price, profit")
      .eq("user_id", user.id)
      .gte("sale_date", thisMonthStart);

    let monthlySales = 0;
    let monthlyProfit = 0;
    for (const s of salesThisMonth ?? []) {
      monthlySales += s.sale_price != null ? Number(s.sale_price) : 0;
      monthlyProfit += s.profit != null ? Number(s.profit) : 0;
    }

    const { data: expensesThisMonth } = await supabase
      .from("erp_expenses")
      .select("amount")
      .eq("user_id", user.id)
      .gte("expense_date", thisMonthStart);

    let monthlyExpenses = 0;
    for (const e of expensesThisMonth ?? []) {
      monthlyExpenses += Number(e.amount ?? 0);
    }

    const monthlyNetProfit = monthlyProfit - monthlyExpenses;

    const { data: investments } = await supabase
      .from("erp_investments")
      .select("id, scribe_id, item_details, total_agreed_price, amount_paid, target_date")
      .eq("user_id", user.id)
      .eq("status", "active");

    let activeInvestmentsBalance = 0;
    const cashFlowRequired: Array<{ id: string; scribe_name: string | null; item_details: string | null; remaining_balance: number; target_date: string }> = [];
    const scribeIds = [...new Set((investments ?? []).map((r) => r.scribe_id).filter(Boolean))];
    const { data: scribeData } = scribeIds.length > 0
      ? await supabase.from("crm_contacts").select("id, name").in("id", scribeIds)
      : { data: [] };
    const scribeMap = new Map((scribeData ?? []).map((s) => [s.id, s.name]));

    for (const inv of investments ?? []) {
      const total = Number(inv.total_agreed_price ?? 0);
      const paid = Number(inv.amount_paid ?? 0);
      const remaining = total - paid;
      activeInvestmentsBalance += remaining;
      if (remaining > 0) {
        cashFlowRequired.push({
          id: inv.id,
          scribe_name: inv.scribe_id ? (scribeMap.get(inv.scribe_id) ?? null) : null,
          item_details: inv.item_details ?? null,
          remaining_balance: remaining,
          target_date: inv.target_date ?? "",
        });
      }
    }
    cashFlowRequired.sort((a, b) => (a.target_date || "9999").localeCompare(b.target_date || "9999"));

    return {
      success: true,
      kpis: {
        totalInvested,
        expectedRevenue,
        potentialProfit,
        monthlySales,
        monthlyNetProfit,
        activeInvestmentsBalance,
        cashFlowRequired,
      },
    };
  } catch {
    return {
      success: true,
      kpis: {
        totalInvested: 0,
        expectedRevenue: 0,
        potentialProfit: 0,
        monthlySales: 0,
        monthlyNetProfit: 0,
        activeInvestmentsBalance: 0,
        cashFlowRequired: [],
      },
    };
  }
}

export async function fetchCategoryCostRevenue(): Promise<
  { success: true; data: CategoryCostRevenueItem[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data } = await supabase
      .from("inventory")
      .select("product_category, total_cost, total_target_price")
      .eq("user_id", user.id)
      .in("status", [...INVENTORY_ACTIVE_STATUSES]);

    const byCategory: Record<string, { cost: number; revenue: number }> = {};
    for (const r of data ?? []) {
      const cat = r.product_category?.trim() || "אחר";
      if (!byCategory[cat]) byCategory[cat] = { cost: 0, revenue: 0 };
      byCategory[cat].cost += r.total_cost != null ? Number(r.total_cost) : 0;
      byCategory[cat].revenue += r.total_target_price != null ? Number(r.total_target_price) : 0;
    }
    const result: CategoryCostRevenueItem[] = Object.entries(byCategory).map(([category, v]) => ({
      category,
      cost: v.cost,
      revenue: v.revenue,
    }));
    return { success: true, data: result };
  } catch {
    return { success: true, data: [] };
  }
}

export async function fetchInventoryDistribution(): Promise<
  { success: true; data: InventoryDistributionItem[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data } = await supabase
      .from("inventory")
      .select("product_category")
      .eq("user_id", user.id)
      .in("status", [...INVENTORY_ACTIVE_STATUSES]);

    const counts: Record<string, number> = {};
    for (const r of data ?? []) {
      const cat = r.product_category?.trim() || "אחר";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    const colors = ["#0ea5e9", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899"];
    const result: InventoryDistributionItem[] = Object.entries(counts).map(([name, value], i) => ({
      name,
      value,
      fill: colors[i % colors.length],
    }));
    return { success: true, data: result };
  } catch {
    return { success: true, data: [] };
  }
}

export async function fetchRecentInventory(): Promise<
  { success: true; data: RecentInventoryItem[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data } = await supabase
      .from("inventory")
      .select("id, product_category, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    const items: RecentInventoryItem[] = (data ?? []).map((r) => ({
      id: r.id,
      product_category: r.product_category ?? null,
      created_at: r.created_at ?? "",
    }));
    return { success: true, data: items };
  } catch {
    return { success: true, data: [] };
  }
}

export async function fetchIncomeExpensesChart(): Promise<
  { success: true; data: MonthlyDataPoint[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const months: MonthlyDataPoint[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthStart = `${monthKey}-01`;
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const monthEnd = nextMonth.toISOString().slice(0, 10);

      const { data: sales } = await supabase
        .from("erp_sales")
        .select("sale_price")
        .eq("user_id", user.id)
        .gte("sale_date", monthStart)
        .lt("sale_date", monthEnd);

      let income = 0;
      for (const s of sales ?? []) income += Number(s.sale_price ?? 0);

      const { data: expenses } = await supabase
        .from("erp_expenses")
        .select("amount")
        .eq("user_id", user.id)
        .gte("expense_date", monthStart)
        .lt("expense_date", monthEnd);

      let exp = 0;
      for (const e of expenses ?? []) exp += Number(e.amount ?? 0);

      const labels: Record<string, string> = {
        "01": "ינו", "02": "פבר", "03": "מרץ", "04": "אפר", "05": "מאי", "06": "יוני",
        "07": "יולי", "08": "אוג", "09": "ספט", "10": "אוק", "11": "נוב", "12": "דצמ",
      };
      const label = labels[monthKey.slice(-2)] ?? monthKey;

      months.push({ month: label, income, expenses: exp });
    }

    return { success: true, data: months };
  } catch {
    return { success: true, data: [] };
  }
}
