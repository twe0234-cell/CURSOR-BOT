-- 067: הרחבת torah_qa_batches — סוג הגעה, עלות, דוח, מגיה אופציונלי (מחשב ללא איש קשר)

ALTER TABLE public.torah_qa_batches
  ALTER COLUMN magiah_id DROP NOT NULL;

ALTER TABLE public.torah_qa_batches
  ADD COLUMN IF NOT EXISTS qa_kind TEXT
    CHECK (qa_kind IS NULL OR qa_kind IN ('gavra', 'computer', 'repair', 'other'));

ALTER TABLE public.torah_qa_batches
  ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(14, 2) NOT NULL DEFAULT 0
    CHECK (cost_amount >= 0);

ALTER TABLE public.torah_qa_batches
  ADD COLUMN IF NOT EXISTS report_url TEXT;

ALTER TABLE public.torah_qa_batches
  ADD COLUMN IF NOT EXISTS vendor_label TEXT;

COMMENT ON COLUMN public.torah_qa_batches.qa_kind IS 'סוג סבב: גברה / מחשב / תיקון / אחר';
COMMENT ON COLUMN public.torah_qa_batches.cost_amount IS 'עלות סבב (₪)';
COMMENT ON COLUMN public.torah_qa_batches.report_url IS 'קישור לדוח/תמונה מהגהה';
COMMENT ON COLUMN public.torah_qa_batches.vendor_label IS 'תיאור חיצוני כשאין איש קשר ב-CRM';

NOTIFY pgrst, 'reload schema';
