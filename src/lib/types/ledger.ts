export type LedgerDirection = "in" | "out";

export type LedgerCategory =
  | "sale_income"
  | "cost_recovery"
  | "profit"
  | "scribe_payment"
  | "parchment"
  | "qa_cost"
  | "tagging_cost"
  | "sewing_cost"
  | "investment_payment"
  | "other_income"
  | "other_expense";

export type LedgerSourceType =
  | "erp_payment"
  | "torah_transaction"
  | "erp_investment";

export interface LedgerEntry {
  id: string;
  user_id: string;
  entry_date: string;
  direction: LedgerDirection;
  amount: number;
  category: LedgerCategory;
  source_type: LedgerSourceType;
  source_id: string;
  deal_type: string | null;
  sale_id: string | null;
  project_id: string | null;
  investment_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface MonthlyDashboardRow {
  user_id: string;
  month: string;
  deal_type: string | null;
  total_income: number;
  total_expenses: number;
  net_cash_flow: number;
  entry_count: number;
}

export interface MonthlyProfitByDealType extends MonthlyDashboardRow {
  realized_profit_sales: number;
  combined_profit: number;
}
