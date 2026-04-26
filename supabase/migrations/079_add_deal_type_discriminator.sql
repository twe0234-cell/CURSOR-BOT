-- 079: add deal_type discriminator — ADDITIVE ONLY
-- ⚠️ אסור NOT NULL constraint — נתונים קיימים יפלו

-- 1. טבלת ייחוס לסוגי עסקאות (single source of truth)
CREATE TABLE IF NOT EXISTS sys_deal_types (
  code          TEXT PRIMARY KEY,
  label_he      TEXT NOT NULL,
  has_client    BOOLEAN NOT NULL DEFAULT TRUE,
  has_scribe    BOOLEAN NOT NULL DEFAULT FALSE,
  has_parchment BOOLEAN NOT NULL DEFAULT FALSE,
  profit_method TEXT NOT NULL
    CHECK (profit_method IN ('margin_per_page','fixed_fee','cost_recovery'))
);

INSERT INTO sys_deal_types (code, label_he, has_client, has_scribe, has_parchment, profit_method) VALUES
  ('brokerage_scribe',      'תיווך סופר',        TRUE,  TRUE,  FALSE, 'margin_per_page'),
  ('brokerage_book',        'תיווך ספר',          TRUE,  FALSE, FALSE, 'fixed_fee'),
  ('inventory_sale',        'מכירת מלאי',         TRUE,  FALSE, FALSE, 'cost_recovery'),
  ('writing_investment',    'השקעה בכתיבה',       FALSE, TRUE,  TRUE,  'cost_recovery'),
  ('managed_torah_project', 'פרויקט תורה מנוהל',  TRUE,  TRUE,  TRUE,  'cost_recovery')
ON CONFLICT (code) DO NOTHING;

-- 2. הוספת deal_type לטבלאות קיימות — nullable (חובה בשלב זה)
ALTER TABLE erp_sales
  ADD COLUMN IF NOT EXISTS deal_type TEXT
    REFERENCES sys_deal_types(code);

ALTER TABLE erp_investments
  ADD COLUMN IF NOT EXISTS deal_type TEXT
    REFERENCES sys_deal_types(code)
    DEFAULT 'writing_investment';

ALTER TABLE torah_projects
  ADD COLUMN IF NOT EXISTS deal_type TEXT
    REFERENCES sys_deal_types(code)
    DEFAULT 'managed_torah_project';

-- 3. Backfill נתונים קיימים
UPDATE erp_sales
SET deal_type = CASE
  WHEN sale_type = 'תיווך' THEN 'brokerage_book'
  ELSE 'inventory_sale'
END
WHERE deal_type IS NULL;

UPDATE erp_investments
SET deal_type = 'writing_investment'
WHERE deal_type IS NULL;

UPDATE torah_projects
SET deal_type = 'managed_torah_project'
WHERE deal_type IS NULL;
