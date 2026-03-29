-- 051: Market torah books — inventory sizes, calculator parchment, script_type; drop legacy columns

ALTER TABLE public.market_torah_books DROP COLUMN IF EXISTS owner_name;

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS torah_size VARCHAR(8);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'market_torah_books' AND column_name = 'size_cm'
  ) THEN
    UPDATE public.market_torah_books
    SET torah_size = CASE
      WHEN size_cm IS NULL THEN NULL
      WHEN size_cm::numeric <= 39 THEN '36'
      WHEN size_cm::numeric <= 43.5 THEN '42'
      WHEN size_cm::numeric <= 46.5 THEN '45'
      WHEN size_cm::numeric <= 49 THEN '48'
      WHEN size_cm::numeric <= 53 THEN '50'
      ELSE '56'
    END;
  END IF;
END $$;

ALTER TABLE public.market_torah_books DROP COLUMN IF EXISTS size_cm;

ALTER TABLE public.market_torah_books DROP CONSTRAINT IF EXISTS market_torah_books_torah_size_check;
ALTER TABLE public.market_torah_books
  ADD CONSTRAINT market_torah_books_torah_size_check
  CHECK (torah_size IS NULL OR torah_size IN ('36', '42', '45', '48', '50', '56'));

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS script_type VARCHAR(16);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'market_torah_books' AND column_name = 'style'
  ) THEN
    UPDATE public.market_torah_books b
    SET script_type = CASE
      WHEN b.style IS NULL OR btrim(b.style) = '' THEN NULL
      WHEN b.style ~* 'ארי|ari' THEN 'ארי'
      WHEN b.style ~* 'ספרד' THEN 'ספרדי'
      WHEN b.style ~* 'ב״י|בי"|velish|וועליש|חב[״"]ד' THEN 'ב״י'
      ELSE NULL
    END
    WHERE b.script_type IS NULL;
  END IF;
END $$;

ALTER TABLE public.market_torah_books DROP COLUMN IF EXISTS style;

ALTER TABLE public.market_torah_books DROP CONSTRAINT IF EXISTS market_torah_books_script_type_check;
ALTER TABLE public.market_torah_books
  ADD CONSTRAINT market_torah_books_script_type_check
  CHECK (script_type IS NULL OR script_type IN ('ארי', 'ב״י', 'ספרדי'));

UPDATE public.market_torah_books
SET parchment_type = CASE
  WHEN parchment_type IS NULL OR btrim(parchment_type) = '' THEN NULL
  WHEN btrim(parchment_type) IN ('שליל', 'עור', 'משוח') THEN btrim(parchment_type)
  WHEN parchment_type ~* 'שליל|shlil' THEN 'שליל'
  WHEN parchment_type ~* 'משוח|mishuch' THEN 'משוח'
  WHEN parchment_type ~* '^עור$|עבודת יד|גוויל' THEN 'עור'
  ELSE NULL
END;

ALTER TABLE public.market_torah_books DROP CONSTRAINT IF EXISTS market_torah_books_parchment_type_check;
ALTER TABLE public.market_torah_books
  ADD CONSTRAINT market_torah_books_parchment_type_check
  CHECK (parchment_type IS NULL OR parchment_type IN ('שליל', 'עור', 'משוח'));

ALTER TABLE public.market_torah_books ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.market_torah_books ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN public.market_torah_books.torah_size IS 'גודל ס״ת — קוד כמו במלאי: 36–56';
COMMENT ON COLUMN public.market_torah_books.script_type IS 'כתב: ארי | ב״י | ספרדי';
COMMENT ON COLUMN public.market_torah_books.parchment_type IS 'שליל | עור | משוח';

NOTIFY pgrst, 'reload schema';
