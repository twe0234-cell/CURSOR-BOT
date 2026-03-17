"use server";

import { createClient } from "@/src/lib/supabase/server";

export type DashboardKpis = {
  totalInventoryValue: number;
  monthlyNetProfit: number;
  activeInvestmentsBalance: number;
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
      .select("cost_price, status")
      .eq("user_id", user.id)
      .neq("status", "sold");

    let totalInventoryValue = 0;
    for (const i of inv ?? []) {
      const cost = i.cost_price != null ? Number(i.cost_price) : 0;
      totalInventoryValue += cost;
    }

    const { data: salesThisMonth } = await supabase
      .from("erp_sales")
      .select("profit")
      .eq("user_id", user.id)
      .gte("sale_date", thisMonthStart);

    let monthlyProfit = 0;
    for (const s of salesThisMonth ?? []) {
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
      .select("total_agreed_price, amount_paid")
      .eq("user_id", user.id)
      .eq("status", "active");

    let activeInvestmentsBalance = 0;
    for (const inv of investments ?? []) {
      const total = Number(inv.total_agreed_price ?? 0);
      const paid = Number(inv.amount_paid ?? 0);
      activeInvestmentsBalance += total - paid;
    }

    return {
      success: true,
      kpis: {
        totalInventoryValue,
        monthlyNetProfit,
        activeInvestmentsBalance,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
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
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}
