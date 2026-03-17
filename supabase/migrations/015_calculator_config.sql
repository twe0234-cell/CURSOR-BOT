-- sys_calculator_config: dynamic calculator configuration
CREATE TABLE IF NOT EXISTS public.sys_calculator_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT NOT NULL UNIQUE,
  config_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.sys_calculator_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sys_calculator_config"
  ON public.sys_calculator_config FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can update sys_calculator_config"
  ON public.sys_calculator_config FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Seed initial data
INSERT INTO public.sys_calculator_config (config_key, config_data) VALUES
  ('parchment_prices', '[
    {"name": "גולדמאן", "price": 190},
    {"name": "נפרשטק שליל", "price": 380},
    {"name": "נפרשטק ליצה", "price": 460},
    {"name": "בראון", "price": 245}
  ]'::jsonb),
  ('neviim_data', '{
    "יהושע": {"pages": 32, "yeriot": 8},
    "שופטים": {"pages": 31, "yeriot": 8},
    "שמואל": {"pages": 86, "yeriot": 22},
    "מלכים": {"pages": 90, "yeriot": 23},
    "ישעיה": {"pages": 64, "yeriot": 16},
    "ירמיה": {"pages": 82, "yeriot": 21},
    "יחזקאל": {"pages": 69, "yeriot": 18},
    "תרי עשר": {"pages": 56, "yeriot": 14}
  }'::jsonb)
ON CONFLICT (config_key) DO NOTHING;
