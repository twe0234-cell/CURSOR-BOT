-- 071: CRM Phase 3 — Identity (כתובות מפורשות, ערוץ מועדף בפורמט API, קהילה + sys_dropdowns)
-- לא מסירים עמודות legacy (phone, email, city, address, preferred_contact) — Global Impact Rule.

-- ── 1) עמודות כתובת ומועדף ───────────────────────────────────────────────────
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS address_city TEXT,
  ADD COLUMN IF NOT EXISTS address_physical TEXT,
  ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT
    DEFAULT 'whatsapp'
    CHECK (preferred_contact_method IN ('whatsapp', 'email', 'phone')),
  ADD COLUMN IF NOT EXISTS community TEXT;

COMMENT ON COLUMN public.crm_contacts.address_city IS
  'עיר (מקור אמת מומלץ לשלב 3; מוגבה מ-city הקיים במיגרציה)';
COMMENT ON COLUMN public.crm_contacts.address_physical IS
  'כתובת פיזית (רחוב וכו׳; מוגבה מ-address הקיים במיגרציה)';
COMMENT ON COLUMN public.crm_contacts.preferred_contact_method IS
  'ערוץ מועדף בפורמט יציב (lowercase). legacy: preferred_contact (WhatsApp/Email/Phone) נשאר לתאימות.';
COMMENT ON COLUMN public.crm_contacts.community IS
  'קהילה / מוסד — ערך מתוך רשימת sys_dropdowns (crm_community), ניתן להרחבה.';

-- Backfill מעמודות קיימות (ללא מחיקת city/address)
UPDATE public.crm_contacts
SET address_city = NULLIF(TRIM(city), '')
WHERE (address_city IS NULL OR TRIM(COALESCE(address_city, '')) = '')
  AND city IS NOT NULL
  AND TRIM(city) <> '';

UPDATE public.crm_contacts
SET address_physical = NULLIF(TRIM(address), '')
WHERE (address_physical IS NULL OR TRIM(COALESCE(address_physical, '')) = '')
  AND address IS NOT NULL
  AND TRIM(address) <> '';

UPDATE public.crm_contacts
SET preferred_contact_method = CASE TRIM(COALESCE(preferred_contact, 'WhatsApp'))
  WHEN 'WhatsApp' THEN 'whatsapp'
  WHEN 'Email' THEN 'email'
  WHEN 'Phone' THEN 'phone'
  ELSE 'whatsapp'
END;

-- העתקת קהילה מפרופיל סופר לאיש הקשר (כאשר ריק)
UPDATE public.crm_contacts c
SET community = NULLIF(TRIM(p.community), '')
FROM public.crm_sofer_profiles p
WHERE p.contact_id = c.id
  AND p.community IS NOT NULL
  AND TRIM(p.community) <> ''
  AND (c.community IS NULL OR TRIM(COALESCE(c.community, '')) = '');

CREATE INDEX IF NOT EXISTS idx_crm_contacts_community
  ON public.crm_contacts(user_id, community)
  WHERE community IS NOT NULL;

-- ── 2) רשימת קהילות מרכזית (ניתן להוסיף ערכים דרך sys_dropdowns) ───────────────
INSERT INTO public.sys_dropdowns (list_key, options)
VALUES (
  'crm_community',
  '["ישיבה", "בית כנסת", "קהילה כללית", "ארגון", "אחר"]'::jsonb
)
ON CONFLICT (list_key) DO UPDATE
SET options = CASE
  WHEN public.sys_dropdowns.options = '[]'::jsonb OR public.sys_dropdowns.options IS NULL
    THEN EXCLUDED.options
  ELSE public.sys_dropdowns.options
END;

-- list_key=crm_community נוסף/מעודכן לעיל — הרחבת options דרך INSERT/UPDATE על sys_dropdowns

-- ── 3) תיעוד ריבוי טלפונים/מיילים (061) — ללא שינוי סכמה כאן ────────────────
COMMENT ON COLUMN public.crm_contacts.phone IS
  'טלפון ראשי; ריבוי מלא: extra_phones (JSONB) + עמודה זו.';
COMMENT ON COLUMN public.crm_contacts.email IS
  'דוא״ל ראשי (אילוץ ייחודיות per-user במיגרציה 016); ריבוי: extra_emails (JSONB).';

NOTIFY pgrst, 'reload schema';
