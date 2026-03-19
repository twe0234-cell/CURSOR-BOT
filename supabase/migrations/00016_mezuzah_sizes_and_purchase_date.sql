-- Add mezuzah_sizes to sys_dropdowns
INSERT INTO public.sys_dropdowns (list_key, options) VALUES ('mezuzah_sizes', '["10", "12", "15", "אחר"]'::jsonb) ON CONFLICT (list_key) DO UPDATE SET options = EXCLUDED.options;

-- Add purchase_date to inventory
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS purchase_date DATE DEFAULT CURRENT_DATE;
