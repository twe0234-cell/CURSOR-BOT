export interface DealType {
  code: string;
  label_he: string;
  has_client: boolean;
  has_scribe: boolean;
  has_parchment: boolean;
  profit_method: "margin_per_page" | "fixed_fee" | "cost_recovery";
  ui_route: string | null;
  list_page_route: string | null;
}

export const DEAL_TYPE_CODES = [
  "brokerage_scribe",
  "brokerage_book",
  "inventory_sale",
  "writing_investment",
  "managed_torah_project",
] as const;

export type DealTypeCode = (typeof DEAL_TYPE_CODES)[number];
