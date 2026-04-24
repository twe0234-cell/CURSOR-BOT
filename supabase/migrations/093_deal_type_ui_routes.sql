-- 093: add ui routing to sys_deal_types

ALTER TABLE sys_deal_types
  ADD COLUMN IF NOT EXISTS ui_route TEXT,
  ADD COLUMN IF NOT EXISTS list_page_route TEXT;

UPDATE sys_deal_types
SET ui_route = '/sales/brokerage/scribe',
    list_page_route = '/sales/brokerage'
WHERE code = 'brokerage_scribe';

UPDATE sys_deal_types
SET ui_route = '/sales/brokerage/book',
    list_page_route = '/sales/brokerage'
WHERE code = 'brokerage_book';

UPDATE sys_deal_types
SET ui_route = '/sales/inventory',
    list_page_route = '/sales/inventory'
WHERE code = 'inventory_sale';

UPDATE sys_deal_types
SET ui_route = '/investments',
    list_page_route = '/investments'
WHERE code = 'writing_investment';

UPDATE sys_deal_types
SET ui_route = '/torah',
    list_page_route = '/torah'
WHERE code = 'managed_torah_project';
