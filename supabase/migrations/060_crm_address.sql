-- 060: הוספת שדה כתובת לכל אנשי קשר ב-CRM (city קיים כבר מ-049)
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS address TEXT;

COMMENT ON COLUMN public.crm_contacts.address IS
  'כתובת מלאה (רחוב + מספר). city נמצא בעמודה נפרדת.';
