"use server";

import { createClient } from "@/src/lib/supabase/server";

export type NetWorthSnapshot = {
  snapshot_at: string | null;
  inventory_cost_value: number;
  open_projects_receivable: number;
  open_sales_receivable: number;
  realized_profit_total: number;
  net_worth_estimate: number;
};

export type MonthlyBusinessDashboardRow = {
  month: string;
  deal_type: string | null;
  total_income: number;
  total_expenses: number;
  net_cash_flow: number;
  entry_count: number;
};

export type BusinessExceptionRow = {
  exception_type: string;
  severity: string;
  entity_id: string | null;
  entity_type: string | null;
  entity_label: string | null;
  message: string | null;
  detected_at: string | null;
};

export type LedgerEntryRow = {
  id: string;
  entry_date: string;
  source_type: string;
  category: string;
  direction: "in" | "out" | string;
  amount: number;
  deal_type: string | null;
  sale_id: string | null;
  project_id: string | null;
  investment_id: string | null;
  notes: string | null;
};

export type TorahFinancialSnapshotRow = {
  user_id: string;
  project_id: string;
  project_label: string | null;
  customer_label: string | null;
  commercial_status: string | null;
  production_status: string | null;
  contract_amount: number;
  received_amount: number;
  actual_cost: number;
  expected_profit: number;
  realized_profit: number;
  cashflow_status: string | null;
};

export type ReadOnlyErpDashboard = {
  netWorth: NetWorthSnapshot | null;
  monthlyCashflow: MonthlyBusinessDashboardRow[];
  businessExceptions: BusinessExceptionRow[];
  recentLedgerEntries: LedgerEntryRow[];
  torahFinancialSnapshot: TorahFinancialSnapshotRow[];
  errors: string[];
  loadedAt: string;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeNetWorth(value: unknown): NetWorthSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    snapshot_at: typeof row.snapshot_at === "string" ? row.snapshot_at : null,
    inventory_cost_value: toNumber(row.inventory_cost_value),
    open_projects_receivable: toNumber(row.open_projects_receivable),
    open_sales_receivable: toNumber(row.open_sales_receivable),
    realized_profit_total: toNumber(row.realized_profit_total),
    net_worth_estimate: toNumber(row.net_worth_estimate),
  };
}

export async function fetchReadOnlyErpDashboard(): Promise<
  { success: true; dashboard: ReadOnlyErpDashboard } | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "יש להתחבר כדי לצפות בלוח ה-ERP" };

  const errors: string[] = [];
  const loadedAt = new Date().toISOString();

  const { data: netWorthData, error: netWorthError } =
    await supabase.rpc("get_net_worth_snapshot");
  if (netWorthError) errors.push(`get_net_worth_snapshot: ${netWorthError.message}`);

  const { data: monthlyRows, error: monthlyError } = await supabase
    .from("monthly_business_dashboard")
    .select("month, deal_type, total_income, total_expenses, net_cash_flow, entry_count")
    .eq("user_id", user.id)
    .order("month", { ascending: false })
    .limit(12);
  if (monthlyError) errors.push(`monthly_business_dashboard: ${monthlyError.message}`);

  const { data: exceptionRows, error: exceptionsError } = await supabase
    .from("business_exceptions")
    .select("exception_type, severity, entity_id, entity_type, entity_label, message, detected_at")
    .order("detected_at", { ascending: false })
    .limit(12);
  if (exceptionsError) errors.push(`business_exceptions: ${exceptionsError.message}`);

  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("ledger_entries")
    .select("id, entry_date, source_type, category, direction, amount, deal_type, sale_id, project_id, investment_id, notes")
    .eq("user_id", user.id)
    .order("entry_date", { ascending: false })
    .limit(12);
  if (ledgerError) errors.push(`ledger_entries: ${ledgerError.message}`);

  const { data: torahSnapshotRows, error: torahSnapshotError } = await supabase
    .from("torah_financial_dashboard_snapshot")
    .select(
      "user_id, project_id, project_label, customer_label, commercial_status, production_status, contract_amount, received_amount, actual_cost, expected_profit, realized_profit, cashflow_status",
    )
    .eq("user_id", user.id)
    .order("project_label", { ascending: true })
    .limit(12);
  if (torahSnapshotError) {
    errors.push(`torah_financial_dashboard_snapshot: ${torahSnapshotError.message}`);
  }

  return {
    success: true,
    dashboard: {
      netWorth: normalizeNetWorth(netWorthData),
      monthlyCashflow: (monthlyRows ?? []).map((row) => ({
        month: String(row.month),
        deal_type: row.deal_type ?? null,
        total_income: toNumber(row.total_income),
        total_expenses: toNumber(row.total_expenses),
        net_cash_flow: toNumber(row.net_cash_flow),
        entry_count: toNumber(row.entry_count),
      })),
      businessExceptions: (exceptionRows ?? []).map((row) => ({
        exception_type: String(row.exception_type ?? ""),
        severity: String(row.severity ?? ""),
        entity_id: row.entity_id ?? null,
        entity_type: row.entity_type ?? null,
        entity_label: row.entity_label ?? null,
        message: row.message ?? null,
        detected_at: row.detected_at ?? null,
      })),
      recentLedgerEntries: (ledgerRows ?? []).map((row) => ({
        id: String(row.id),
        entry_date: String(row.entry_date),
        source_type: String(row.source_type ?? ""),
        category: String(row.category ?? ""),
        direction: String(row.direction ?? ""),
        amount: toNumber(row.amount),
        deal_type: row.deal_type ?? null,
        sale_id: row.sale_id ?? null,
        project_id: row.project_id ?? null,
        investment_id: row.investment_id ?? null,
        notes: row.notes ?? null,
      })),
      torahFinancialSnapshot: (torahSnapshotRows ?? []).map((row) => ({
        user_id: String(row.user_id),
        project_id: String(row.project_id),
        project_label: row.project_label ?? null,
        customer_label: row.customer_label ?? null,
        commercial_status: row.commercial_status ?? null,
        production_status: row.production_status ?? null,
        contract_amount: toNumber(row.contract_amount),
        received_amount: toNumber(row.received_amount),
        actual_cost: toNumber(row.actual_cost),
        expected_profit: toNumber(row.expected_profit),
        realized_profit: toNumber(row.realized_profit),
        cashflow_status: row.cashflow_status ?? null,
      })),
      errors,
      loadedAt,
    },
  };
}
