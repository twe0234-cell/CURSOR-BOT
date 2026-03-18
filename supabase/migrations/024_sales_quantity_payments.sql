-- Sales: quantity, total_price, amount_paid for partial payments from buyer
ALTER TABLE public.erp_sales
  ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) DEFAULT 0;
