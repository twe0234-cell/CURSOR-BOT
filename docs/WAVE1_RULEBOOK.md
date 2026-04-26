# ספר חוקים — גל 1: תשתית עסקאות וסטטוסים
## הידור הסת"ם ERP/CRM

> **קהל יעד:** כל כלי IDE / AI-agent שמבצע את גל 1.
> **תאריך:** 2026-04-24
> **ענף עבודה:** `claude/analyze-business-structure-RZImz`
> **מקור:** תכנון מאושר ב-`/root/.claude/plans/goofy-jingling-pudding.md`

---

## 0. STOP — קרא לפני שנוגע בקוד

### כללי ברזל (אסור לפרוץ)

| # | חוק | עונש על הפרה |
|---|-----|--------------|
| 1 | **Additive only** — אין `DROP`, אין `RENAME`, אין `ALTER TYPE` | שבירת production data |
| 2 | **אין `NOT NULL` על עמודה חדשה** בלי DEFAULT מוגדר קודם | migration תיפול |
| 3 | **אין שינוי UI** בגל 1 — רק DB + types | regression בלתי נראה |
| 4 | **`npm test` חייב לעבור** לפני כל commit | 57 בדיקות חייבות להיות ירוקות |
| 5 | **אין `sys_deal_types` FK** עד שהטבלה קיימת ובנויה במלואה | FK violation |
| 6 | **`financial_status` = VIEW בלבד** — אסור כעמודה ב-DB | drift בין נתונים |
| 7 | **אין merge ל-main** — רק לברנץ' `claude/...` | deploy לפרודקשן מוקדם |

---

## 1. מצב DB לפני גל 1 (confirmed 2026-04-24)

```
erp_sales:        sale_type TEXT (ממלאי/תיווך), ← אין deal_type עדיין
erp_investments:  status TEXT,                   ← אין deal_type עדיין
torah_projects:   status TEXT (contract/writing/qa/completed/delivered)
                  ← אין commercial_status / production_status עדיין
sys_deal_types:   לא קיימת עדיין
```

**נתונים קיימים:**
- `erp_sales`: 2 שורות — אחת `sale_type='תיווך'`, אחת `sale_type='ממלאי'`
- `torah_projects`: 2 שורות — שתיהן `status='writing'`

---

## 2. Migration 079 — sys_deal_types + deal_type

**קובץ לייצור:** `supabase/migrations/079_add_deal_type_discriminator.sql`

```sql
-- 079: add deal_type discriminator — ADDITIVE ONLY
-- ⚠️ אסור להוסיף NOT NULL constraint — נתונים קיימים יפלו

-- 1. טבלת ייחוס (single source of truth לסוגי עסקאות)
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

-- 2. הוספת deal_type לטבלאות קיימות — nullable ← חובה בשלב הזה
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
```

**בדיקה לאחר migration:**
```sql
SELECT deal_type, COUNT(*) FROM erp_sales GROUP BY deal_type;
-- צפוי: brokerage_book=1, inventory_sale=1

SELECT deal_type, COUNT(*) FROM erp_investments GROUP BY deal_type;
-- צפוי: writing_investment=N (כל השורות)

SELECT * FROM sys_deal_types ORDER BY code;
-- צפוי: 5 שורות
```

---

## 3. Migration 080 — torah_projects 3D status + VIEW

**קובץ לייצור:** `supabase/migrations/080_torah_projects_3d_status.sql`

```sql
-- 080: torah_projects — 3-dimensional status model
-- ⚠️ ADDITIVE ONLY — status הישן נשאר, שום UI לא נשבר

-- 1. הוספת שני צירים כעמודות אמיתיות (עם DEFAULT — חייב!)
ALTER TABLE torah_projects
  ADD COLUMN IF NOT EXISTS commercial_status TEXT NOT NULL
    DEFAULT 'contract_signed'
    CHECK (commercial_status IN (
      'lead','quoted','contract_signed','delivered','closed','cancelled'
    )),
  ADD COLUMN IF NOT EXISTS production_status TEXT NOT NULL
    DEFAULT 'not_started'
    CHECK (production_status IN (
      'not_started','writing','sheets_received',
      'in_qa','qa_approved','sewn','delivered'
    ));

-- 2. Backfill מ-status הישן
UPDATE torah_projects SET
  production_status = CASE status
    WHEN 'contract'  THEN 'not_started'
    WHEN 'writing'   THEN 'writing'
    WHEN 'qa'        THEN 'in_qa'
    WHEN 'completed' THEN 'qa_approved'
    WHEN 'delivered' THEN 'delivered'
    ELSE 'not_started'
  END,
  commercial_status = CASE status
    WHEN 'delivered' THEN 'delivered'
    WHEN 'completed' THEN 'delivered'
    ELSE 'contract_signed'
  END;

-- 3. financial_status = VIEW בלבד (לא עמודה — מונע drift)
CREATE OR REPLACE VIEW torah_projects_with_financials AS
SELECT
  tp.*,
  COALESCE(paid.total_paid, 0)          AS client_total_paid,
  COALESCE(scheduled.total_scheduled, 0) AS client_total_scheduled,
  CASE
    WHEN COALESCE(paid.total_paid, 0) = 0                          THEN 'no_payment'
    WHEN COALESCE(paid.total_paid, 0) >= COALESCE(tp.total_agreed_price, 0)
                                                                    THEN 'fully_paid'
    WHEN COALESCE(paid.total_paid, 0) > 0                          THEN 'partially_paid'
    ELSE 'no_payment'
  END AS financial_status
FROM torah_projects tp
LEFT JOIN (
  SELECT project_id, SUM(amount) AS total_paid
  FROM torah_project_transactions
  WHERE transaction_type = 'client_payment'
  GROUP BY project_id
) paid ON paid.project_id = tp.id
LEFT JOIN (
  SELECT project_id, SUM(amount) AS total_scheduled
  FROM torah_payment_schedules
  WHERE party = 'client'
  GROUP BY project_id
) scheduled ON scheduled.project_id = tp.id;
```

**בדיקה לאחר migration:**
```sql
SELECT commercial_status, production_status, COUNT(*)
FROM torah_projects GROUP BY 1,2;
-- צפוי: contract_signed, writing, 2

SELECT id, financial_status, client_total_paid, client_total_scheduled
FROM torah_projects_with_financials LIMIT 5;
-- צפוי: no_payment (אם אין תשלומים) או partially_paid
```

---

## 4. TypeScript — src/lib/types/torah.ts

**פעולה:** הוסף בסוף הקובץ הקיים (לא להחליף — רק append).

```typescript
// ── 3D Status (גל 1) ──────────────────────────────────────────

export const COMMERCIAL_STATUSES = [
  'lead', 'quoted', 'contract_signed', 'delivered', 'closed', 'cancelled',
] as const;

export const PRODUCTION_STATUSES = [
  'not_started', 'writing', 'sheets_received',
  'in_qa', 'qa_approved', 'sewn', 'delivered',
] as const;

export const FINANCIAL_STATUSES = [
  'no_payment', 'deposit_received', 'partially_paid', 'fully_paid',
] as const;

export type CommercialStatus = typeof COMMERCIAL_STATUSES[number];
export type ProductionStatus = typeof PRODUCTION_STATUSES[number];
export type FinancialStatus  = typeof FINANCIAL_STATUSES[number];

export const COMMERCIAL_STATUS_LABELS: Record<CommercialStatus, string> = {
  lead:             'ליד',
  quoted:           'הוצע מחיר',
  contract_signed:  'חוזה חתום',
  delivered:        'נמסר',
  closed:           'סגור',
  cancelled:        'מבוטל',
};

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  not_started:     'טרם התחיל',
  writing:         'בכתיבה',
  sheets_received: 'יריעות התקבלו',
  in_qa:           'בהגהה',
  qa_approved:     'הגהה אושרה',
  sewn:            'תפור',
  delivered:       'נמסר',
};

export const FINANCIAL_STATUS_LABELS: Record<FinancialStatus, string> = {
  no_payment:       'טרם שולם',
  deposit_received: 'מקדמה התקבלה',
  partially_paid:   'שולם חלקית',
  fully_paid:       'שולם במלואו',
};

// עדכון TorahProject interface — הוסף לאחר השדות הקיימים:
// commercial_status: CommercialStatus;
// production_status: ProductionStatus;
// deal_type: string | null;
// ⚠️ financial_status מגיע מ-VIEW בלבד, אין שדה ב-DB
```

**עדכון TorahProject interface** — הוסף את השדות האלה לממשק הקיים:

```typescript
// בתוך interface TorahProject — אחרי שדה `status`:
commercial_status: CommercialStatus;
production_status: ProductionStatus;
deal_type: string | null;
```

---

## 5. סדר ביצוע מדויק (10 שלבים)

```
שלב 1:  git checkout claude/analyze-business-structure-RZImz
שלב 2:  צור קובץ supabase/migrations/079_add_deal_type_discriminator.sql (תוכן לעיל §2)
שלב 3:  החל migration דרך Supabase MCP → apply_migration
שלב 4:  הרץ שאילתות בדיקה מ-§2 (deal_type counts)
שלב 5:  צור קובץ supabase/migrations/080_torah_projects_3d_status.sql (תוכן לעיל §3)
שלב 6:  החל migration דרך Supabase MCP → apply_migration
שלב 7:  הרץ שאילתות בדיקה מ-§3 (status counts, view)
שלב 8:  עדכן src/lib/types/torah.ts (append §4 + עדכון interface)
שלב 9:  הרץ: npm test → חייב 57+ ירוקות
שלב 10: הרץ: npm run build → חייב 0 שגיאות TypeScript
שלב 11: git add + git commit + git push origin claude/analyze-business-structure-RZImz
```

---

## 6. שאילתות בדיקה מלאות

```sql
-- א. sys_deal_types קיים ומכיל 5 שורות
SELECT code, label_he, profit_method FROM sys_deal_types ORDER BY code;

-- ב. erp_sales backfill הושלם
SELECT deal_type, sale_type, COUNT(*)
FROM erp_sales GROUP BY deal_type, sale_type;

-- ג. torah_projects statuses תקינים
SELECT status, commercial_status, production_status, COUNT(*)
FROM torah_projects GROUP BY 1,2,3;

-- ד. VIEW עובדת
SELECT id, financial_status, client_total_paid
FROM torah_projects_with_financials
LIMIT 5;

-- ה. אין שורות NULL ב-deal_type (אחרי backfill)
SELECT COUNT(*) AS nulls FROM erp_sales WHERE deal_type IS NULL;
-- צפוי: 0
```

---

## 7. מה גל 1 לא עושה (גבולות ברורים)

- ❌ **אין שינוי UI** — אפס קומפוננטות נגעות
- ❌ **אין מחיקת שדות** — `torah_projects.status` הישן נשאר
- ❌ **אין merge ל-main** — הכל נשאר ב-`claude/...`
- ❌ **אין בניית פיצ'רים** — רק תשתית schema
- ❌ **אין שינוי בלוגיקה הפיננסית** (`crm.logic.ts` לא נגע)

---

## 8. גל 2 — מה הולך אחרי (לתכנון)

```
◻ torah_qa_batch_movements  — תיעוד תנועת יריעות בין מגיהים
◻ שרשרת הגהה→תיקון→קיזוז  — קישור qa_batch לעלויות מקוזזות
◻ תיוג (תיוג גיטמן/מחשב)   — סטטוס "תויג" ועלות
◻ Budget vs Actual          — השוואת תקציב מתוכנן לביצוע
◻ Net Worth snapshot        — ערך מלאי + פרויקטים פתוחים - חובות
```

---

## 9. גל 3 — אופק (לתכנון)

```
◻ unified_ledger            — לג'ר מרכזי לכל תנועה (IN/OUT)
◻ deal_type → פורטל מתאים  — UI מותאם לפי סוג עסקה
◻ dashboard כולל            — "כמה הרווחתי החודש" מכל הסוגים
◻ SaaS multi-tenant         — RLS קיים, צריך user_id hooks
```

---

## 10. כתובות קריטיות

| מה | איפה |
|----|------|
| קובץ תכנון (מאושר) | `/root/.claude/plans/goofy-jingling-pudding.md` |
| ספר חוקים זה | `docs/WAVE1_RULEBOOK.md` (ב-repo) |
| TypeScript types | `src/lib/types/torah.ts` |
| Migration 079 | `supabase/migrations/079_add_deal_type_discriminator.sql` |
| Migration 080 | `supabase/migrations/080_torah_projects_3d_status.sql` |
| Migration 081 (PATCH) | `supabase/migrations/081_sys_audit_log.sql` |
| בדיקות | `src/services/crm.logic.test.ts` |
| ארכיטקטורה כללית | `ARCHITECTURE.md`, `CLAUDE.md`, `ENGINEERING_QA_PROTOCOL.md` |

---

## 11. PATCH — Migration 081: sys_audit_log

> **מטרה:** מערכת פיננסית חיה חייבת audit trail. מי שינה, מה שונה, מתי, מ→ל.
> **מקור:** סיכום 1 מומלץ §4 (audit trail).

**קובץ:** `supabase/migrations/081_sys_audit_log.sql`

```sql
-- 081: sys_audit_log — audit trail for all financial mutations
-- ⚠️ APPEND-ONLY — never UPDATE or DELETE rows

CREATE TABLE IF NOT EXISTS sys_audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES auth.users(id),
  table_name   TEXT        NOT NULL,
  record_id    UUID        NOT NULL,
  action       TEXT        NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  column_name  TEXT,
  old_value    JSONB,
  new_value    JSONB,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  source       TEXT,  -- 'web' | 'cron' | 'admin' | 'trigger'
  notes        TEXT
);

-- Indexes לשאילתות
CREATE INDEX IF NOT EXISTS idx_audit_log_record
  ON sys_audit_log (table_name, record_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_date
  ON sys_audit_log (user_id, changed_at DESC);

-- RLS — קריאה בלבד ע"י admin + יוצר השורה
ALTER TABLE sys_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_read_own" ON sys_audit_log
  FOR SELECT USING (user_id = auth.uid());

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION public.sys_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO sys_audit_log (user_id, table_name, record_id, action, new_value, source)
    VALUES (auth.uid(), TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), 'trigger');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO sys_audit_log (user_id, table_name, record_id, action, old_value, new_value, source)
    VALUES (auth.uid(), TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), 'trigger');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO sys_audit_log (user_id, table_name, record_id, action, old_value, source)
    VALUES (auth.uid(), TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), 'trigger');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach trigger לטבלאות פיננסיות קריטיות
DROP TRIGGER IF EXISTS audit_erp_sales           ON erp_sales;
DROP TRIGGER IF EXISTS audit_erp_payments        ON erp_payments;
DROP TRIGGER IF EXISTS audit_erp_investments     ON erp_investments;
DROP TRIGGER IF EXISTS audit_torah_projects      ON torah_projects;
DROP TRIGGER IF EXISTS audit_torah_transactions  ON torah_project_transactions;

CREATE TRIGGER audit_erp_sales
  AFTER INSERT OR UPDATE OR DELETE ON erp_sales
  FOR EACH ROW EXECUTE FUNCTION sys_audit_trigger();

CREATE TRIGGER audit_erp_payments
  AFTER INSERT OR UPDATE OR DELETE ON erp_payments
  FOR EACH ROW EXECUTE FUNCTION sys_audit_trigger();

CREATE TRIGGER audit_erp_investments
  AFTER INSERT OR UPDATE OR DELETE ON erp_investments
  FOR EACH ROW EXECUTE FUNCTION sys_audit_trigger();

CREATE TRIGGER audit_torah_projects
  AFTER INSERT OR UPDATE OR DELETE ON torah_projects
  FOR EACH ROW EXECUTE FUNCTION sys_audit_trigger();

CREATE TRIGGER audit_torah_transactions
  AFTER INSERT OR UPDATE OR DELETE ON torah_project_transactions
  FOR EACH ROW EXECUTE FUNCTION sys_audit_trigger();
```

**⚠️ PITFALL:** `to_jsonb(NEW)` שומר את **כל** השדות. אם יש שדות רגישים (tokens, passwords) — הם נכנסים ל-log. ודא שאין כאלה בטבלאות המסומנות.

**⚠️ PITFALL 2:** triggers מוסיפים I/O לכל INSERT/UPDATE. בדוק performance על טבלאות גדולות לפני שמפעילים בפרודקשן.

**בדיקה:**
```sql
-- א. הטבלה קיימת
SELECT COUNT(*) FROM sys_audit_log;

-- ב. triggers מוצמדים
SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_name LIKE 'audit_%'
ORDER BY event_object_table;

-- ג. שינוי פיננסי יוצר רשומה
UPDATE torah_projects SET notes = 'test audit' WHERE id = (SELECT id FROM torah_projects LIMIT 1);
SELECT action, changed_at, new_value->>'notes' FROM sys_audit_log
WHERE table_name = 'torah_projects' ORDER BY changed_at DESC LIMIT 1;
```
