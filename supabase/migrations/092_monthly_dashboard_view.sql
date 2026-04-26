-- 092: monthly_business_dashboard + monthly_profit_by_deal_type

CREATE OR REPLACE VIEW monthly_business_dashboard AS
SELECT
  user_id,
  date_trunc('month', entry_date)::DATE AS month,
  deal_type,
  SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END)  AS total_income,
  SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END) AS total_expenses,
  SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END)
    - SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END) AS net_cash_flow,
  COUNT(*) AS entry_count
FROM ledger_entries
GROUP BY user_id, date_trunc('month', entry_date), deal_type;

CREATE OR REPLACE VIEW monthly_profit_by_deal_type AS
SELECT
  u.user_id,
  u.month,
  u.deal_type,
  u.total_income,
  u.total_expenses,
  u.net_cash_flow,
  u.entry_count,
  COALESCE(m.total_profit, 0) AS realized_profit_sales,
  u.net_cash_flow + COALESCE(m.total_profit, 0) AS combined_profit
FROM monthly_business_dashboard u
LEFT JOIN monthly_realized_profit_view m
  ON m.user_id = u.user_id
 AND m.profit_month = u.month
 AND u.deal_type IN ('inventory_sale', 'brokerage_book', 'brokerage_scribe');
