-- Ensure sys_dropdowns and sys_calculator_config exist (fix for missing tables)
-- Run this in Supabase SQL Editor if migrations haven't been applied

CREATE TABLE IF NOT EXISTS sys_dropdowns (
  list_key TEXT PRIMARY KEY,
  options JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS sys_calculator_config (
  config_key TEXT PRIMARY KEY,
  config_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- RLS for sys_dropdowns (if not already present)
ALTER TABLE sys_dropdowns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read sys_dropdowns" ON sys_dropdowns;
DROP POLICY IF EXISTS "Authenticated can update sys_dropdowns" ON sys_dropdowns;
CREATE POLICY "Authenticated can read sys_dropdowns"
  ON sys_dropdowns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can update sys_dropdowns"
  ON sys_dropdowns FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RLS for sys_calculator_config (if not already present)
ALTER TABLE sys_calculator_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read sys_calculator_config" ON sys_calculator_config;
DROP POLICY IF EXISTS "Authenticated can update sys_calculator_config" ON sys_calculator_config;
CREATE POLICY "Authenticated can read sys_calculator_config"
  ON sys_calculator_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can update sys_calculator_config"
  ON sys_calculator_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
