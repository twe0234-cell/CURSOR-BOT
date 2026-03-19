-- Drop NOT NULL on legacy columns so product_category can be used without filling them
ALTER TABLE public.inventory ALTER COLUMN product_type DROP NOT NULL;
ALTER TABLE public.inventory ALTER COLUMN category DROP NOT NULL;
ALTER TABLE public.inventory ALTER COLUMN item_type DROP NOT NULL;
