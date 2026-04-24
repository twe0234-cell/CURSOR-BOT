# ספר חוקים — גל 2: Budget vs Actual + שרשרת QA + Net Worth
## הידור הסת"ם ERP/CRM

> **תנאי מוקדם:** גל 1 הושלם ואושר (`sys_deal_types`, `deal_type`, `commercial_status`, `production_status` קיימים)
> **ענף עבודה:** `claude/analyze-business-structure-RZImz` (או ענף חדש `claude/wave2-...`)
> **תאריך:** 2026-04-24

---

## 0. STOP — כללי ברזל

| # | חוק |
|---|-----|
| 1 | **Additive only** — אין DROP/RENAME/ALTER TYPE |
| 2 | **אין לוגיקה ב-TypeScript** שנוגעת לרווח — רק ב-PostgreSQL |
| 3 | **transaction_type** = ערכים מרשימה קנונית בלבד (ראה §1) |
| 4 | **net_worth** = פונקציה PostgreSQL בלבד — אין חישוב ב-Frontend |
| 5 | **npm test** חייב לעבור לפני כל commit |
| 6 | **אין שינוי** לטבלאות `erp_profit_ledger` / `erp_payments` / `erp_sales` בגל זה |

---

## 1. Migration 081 — Canon transaction types

> **מטרה:** `torah_project_transactions.transaction_type` היום חסר validation.
> גל 2 מוסיף טבלת ייחוס וממלא ברירות מחדל.

**קובץ:** `supabase/migrations/081_canon_transaction_types.sql`

```sql
-- 081: canonicalize torah_project_transactions.transaction_type

CREATE TABLE IF NOT EXISTS sys_transaction_types (
  code        TEXT PRIMARY KEY,
  label_he    TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('income','expense')),
  affects_profit BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO sys_transaction_types (code, label_he, direction, affects_profit) VALUES
  ('client_payment',    'תשלום מלקוח',      'income',  TRUE),
  ('client_refund',     'החזר ללקוח',        'expense', TRUE),
  ('scribe_payment',    'תשלום לסופר',       'expense', FALSE),
  ('parchment_purchase','קניית קלף',         'expense', FALSE),
  ('qa_payment',        'תשלום למגיה',       'expense', FALSE),
  ('tagging_payment',   'תשלום לתיוג',       'expense', FALSE),
  ('sewing_payment',    'תשלום לתפירה',      'expense', FALSE),
  ('other_expense',     'הוצאה אחרת',        'expense', FALSE),
  ('internal_transfer', 'העברה פנימית',      'income',  FALSE)
ON CONFLICT (code) DO NOTHING;

-- FK על transaction_type — nullable עד backfill
ALTER TABLE torah_project_transactions
  ADD COLUMN IF NOT EXISTS transaction_type_code TEXT
    REFERENCES sys_transaction_types(code);

-- backfill: אם transaction_type קיים — נסה להתאים
UPDATE torah_project_transactions
SET transaction_type_code = CASE
  WHEN transaction_type = 'client_payment'    THEN 'client_payment'
  WHEN transaction_type = 'scribe_payment'    THEN 'scribe_payment'
  WHEN transaction_type = 'parchment'         THEN 'parchment_purchase'
  WHEN transaction_type = 'qa'                THEN 'qa_payment'
  WHEN transaction_type = 'tagging'           THEN 'tagging_payment'
  ELSE 'other_expense'
END
WHERE transaction_type_code IS NULL AND transaction_type IS NOT NULL;
```

**⚠️ PITFALL:** אל תמחק את `transaction_type` המקורי — הוא בשימוש בקוד קיים. הוסף עמודה חדשה, מגר בהדרגה.

**בדיקה:**
```sql
SELECT code, label_he, direction FROM sys_transaction_types ORDER BY direction, code;
-- 9 שורות
```

---

## 2. Migration 082 — Budget vs Actual VIEW

> **מטרה:** `torah_projects` כבר יש שדות `planned_*`. גל 2 מוסיף VIEW שמשווה אותם לביצוע בפועל.

**קובץ:** `supabase/migrations/082_torah_budget_vs_actual_view.sql`

```sql
-- 082: torah_project_budget_vs_actual VIEW

CREATE OR REPLACE VIEW torah_project_budget_vs_actual AS
SELECT
  tp.id,
  tp.title,
  tp.status,
  tp.commercial_status,
  tp.production_status,
  tp.total_agreed_price                       AS contract_price,

  -- תקציב מתוכנן
  COALESCE(tp.planned_scribe_budget, 0)       AS planned_scribe,
  COALESCE(tp.planned_parchment_budget, 0)    AS planned_parchment,
  COALESCE(tp.planned_proofreading_budget, 0) AS planned_proofreading,
  COALESCE(tp.estimated_expenses_total, 0)    AS planned_total_cost,

  -- ביצוע בפועל לפי סוג
  COALESCE(SUM(CASE WHEN tpt.transaction_type IN ('scribe_payment')
                THEN tpt.amount END), 0)      AS actual_scribe,
  COALESCE(SUM(CASE WHEN tpt.transaction_type IN ('parchment_purchase')
                THEN tpt.amount END), 0)      AS actual_parchment,
  COALESCE(SUM(CASE WHEN tpt.transaction_type IN ('qa_payment','tagging_payment','sewing_payment')
                THEN tpt.amount END), 0)      AS actual_proofreading,
  COALESCE(SUM(CASE WHEN tpt.transaction_type NOT IN ('client_payment','client_refund')
                THEN tpt.amount END), 0)      AS actual_total_cost,

  -- הכנסות מלקוח
  COALESCE(SUM(CASE WHEN tpt.transaction_type = 'client_payment'
                THEN tpt.amount END), 0)      AS actual_income,
  COALESCE(SUM(CASE WHEN tpt.transaction_type = 'client_refund'
                THEN tpt.amount END), 0)      AS actual_refunds,

  -- רווחיות מחושבת
  tp.total_agreed_price
    - COALESCE(SUM(CASE WHEN tpt.transaction_type NOT IN ('client_payment','client_refund')
                    THEN tpt.amount END), 0)  AS projected_profit,

  COALESCE(SUM(CASE WHEN tpt.transaction_type = 'client_payment'   THEN tpt.amount END), 0)
  - COALESCE(SUM(CASE WHEN tpt.transaction_type = 'client_refund'  THEN tpt.amount END), 0)
  - COALESCE(SUM(CASE WHEN tpt.transaction_type NOT IN ('client_payment','client_refund')
                  THEN tpt.amount END), 0)    AS realized_profit,

  -- חריגות (actual - planned)
  COALESCE(SUM(CASE WHEN tpt.transaction_type NOT IN ('client_payment','client_refund')
                THEN tpt.amount END), 0)
    - COALESCE(tp.estimated_expenses_total, 0) AS cost_variance

FROM torah_projects tp
LEFT JOIN torah_project_transactions tpt ON tpt.project_id = tp.id
GROUP BY
  tp.id, tp.title, tp.status, tp.commercial_status, tp.production_status,
  tp.total_agreed_price,
  tp.planned_scribe_budget, tp.planned_parchment_budget,
  tp.planned_proofreading_budget, tp.estimated_expenses_total;
```

**⚠️ PITFALL:** `cost_variance` חיובי = חריגה. שלילי = חיסכון. וודא שה-UI מציג בהתאם.

**בדיקה:**
```sql
SELECT id, title, contract_price, planned_total_cost, actual_total_cost,
       projected_profit, cost_variance
FROM torah_project_budget_vs_actual;
```

---

## 3. Migration 083 — QA Batch cost settlement + tagging status

> **מטרה:** `torah_qa_batches.cost_amount` קיים אך אין ניהול תשלום בפועל.
> + הוספת `tagging_status` לפרויקט.

**קובץ:** `supabase/migrations/083_qa_cost_settlement_tagging.sql`

```sql
-- 083: QA batch cost settlement + tagging status

-- א. מעקב תשלום בפועל לסבב הגהה
ALTER TABLE torah_qa_batches
  ADD COLUMN IF NOT EXISTS is_cost_settled  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS settled_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settlement_tx_id UUID
    REFERENCES torah_project_transactions(id);

-- ב. תיוג
ALTER TABLE torah_projects
  ADD COLUMN IF NOT EXISTS tagging_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (tagging_status IN (
      'not_required','pending','in_progress','completed'
    ));

-- backfill: אם requires_tagging=true ועדיין לא הושלם → pending
UPDATE torah_projects
SET tagging_status = 'pending'
WHERE requires_tagging = TRUE
  AND status NOT IN ('completed','delivered')
  AND tagging_status = 'not_required';

UPDATE torah_projects
SET tagging_status = 'completed'
WHERE requires_tagging = TRUE
  AND status IN ('completed','delivered')
  AND tagging_status = 'not_required';
```

**⚠️ PITFALL:** `settlement_tx_id` הוא FK ל-`torah_project_transactions`. ודא שה-transaction קיים לפני שמקשרים.

**בדיקה:**
```sql
SELECT tagging_status, COUNT(*) FROM torah_projects GROUP BY tagging_status;
SELECT is_cost_settled, COUNT(*) FROM torah_qa_batches GROUP BY is_cost_settled;
```

---

## 4. Migration 084 — Net Worth snapshot function

> **מטרה:** פונקציה PostgreSQL אחת שמחשבת שווי נקי של העסק ברגע נתון.

**קובץ:** `supabase/migrations/084_net_worth_snapshot_fn.sql`

```sql
-- 084: get_net_worth_snapshot() — שווי נקי של העסק

CREATE OR REPLACE FUNCTION public.get_net_worth_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_inventory_cost_value      numeric := 0;
  v_open_projects_receivable  numeric := 0;
  v_open_sales_receivable     numeric := 0;
  v_realized_profit_total     numeric := 0;
BEGIN

  -- 1. ערך מלאי לפי עלות (פריטים שלא נמכרו)
  SELECT COALESCE(SUM(cost_price), 0)
  INTO v_inventory_cost_value
  FROM inventory
  WHERE status NOT IN ('sold', 'נמכר');

  -- 2. חוב לקוחות על פרויקטי תורה פתוחים
  SELECT COALESCE(SUM(
    GREATEST(total_agreed_price - client_total_paid, 0)
  ), 0)
  INTO v_open_projects_receivable
  FROM torah_projects_with_financials
  WHERE status NOT IN ('delivered');

  -- 3. חוב לקוחות על מכירות פתוחות (erp_sales)
  SELECT COALESCE(SUM(
    GREATEST(s.total_price - COALESCE(p.total_paid, 0), 0)
  ), 0)
  INTO v_open_sales_receivable
  FROM erp_sales s
  LEFT JOIN (
    SELECT entity_id, SUM(amount) AS total_paid
    FROM erp_payments
    WHERE direction = 'incoming'
    GROUP BY entity_id
  ) p ON p.entity_id = s.id
  WHERE s.status NOT IN ('נמכר','sold','cancelled');

  -- 4. רווח ממומש מכל המכירות (erp_profit_ledger)
  SELECT COALESCE(SUM(
    CASE WHEN profit_type = 'PROFIT' THEN amount ELSE 0 END
  ), 0)
  INTO v_realized_profit_total
  FROM erp_profit_ledger;

  RETURN jsonb_build_object(
    'snapshot_at',                    now(),
    'inventory_cost_value',           v_inventory_cost_value,
    'open_projects_receivable',       v_open_projects_receivable,
    'open_sales_receivable',          v_open_sales_receivable,
    'realized_profit_total',          v_realized_profit_total,
    'net_worth_estimate',             (
      v_inventory_cost_value
      + v_open_projects_receivable
      + v_open_sales_receivable
      + v_realized_profit_total
    )
  );
END;
$$;
```

**⚠️ PITFALL:** `net_worth_estimate` כולל מלאי **בעלות** (לא במחיר מכירה) — זה שמרני ונכון. אל תשנה לאומדן מכירה בלי דיון.

**בדיקה:**
```sql
SELECT get_net_worth_snapshot();
-- מחזיר jsonb עם 6 מפתחות
```

---

## 5. TypeScript — עדכון src/lib/types/torah.ts

**הוסף בסוף הקובץ:**

```typescript
// ── Tagging Status — גל 2 ─────────────────────────────────────

export const TAGGING_STATUSES = [
  'not_required', 'pending', 'in_progress', 'completed',
] as const;

export type TaggingStatus = typeof TAGGING_STATUSES[number];

export const TAGGING_STATUS_LABELS: Record<TaggingStatus, string> = {
  not_required: 'לא נדרש',
  pending:      'ממתין לתיוג',
  in_progress:  'בתיוג',
  completed:    'תויג',
};
```

**עדכון `TorahProject` interface — הוסף אחרי `deal_type`:**

```typescript
tagging_status?: TaggingStatus;
```

**טיפוס חדש לתצוגת Budget vs Actual:**

```typescript
export interface TorahBudgetVsActual {
  id: string;
  title: string;
  contract_price: number;
  planned_scribe: number;
  planned_parchment: number;
  planned_proofreading: number;
  planned_total_cost: number;
  actual_scribe: number;
  actual_parchment: number;
  actual_proofreading: number;
  actual_total_cost: number;
  actual_income: number;
  actual_refunds: number;
  projected_profit: number;
  realized_profit: number;
  cost_variance: number;   // חיובי = חריגה, שלילי = חיסכון
}
```

---

## 6. סדר ביצוע גל 2 (11 שלבים)

```
שלב 1:  git checkout claude/analyze-business-structure-RZImz
שלב 2:  צור 081_canon_transaction_types.sql
שלב 3:  apply_migration → bדוק sys_transaction_types (9 שורות)
שלב 4:  צור 082_torah_budget_vs_actual_view.sql
שלב 5:  apply_migration → בדוק VIEW (SELECT * LIMIT 5)
שלב 6:  צור 083_qa_cost_settlement_tagging.sql
שלב 7:  apply_migration → בדוק tagging_status counts
שלב 8:  צור 084_net_worth_snapshot_fn.sql
שלב 9:  apply_migration → בדוק SELECT get_net_worth_snapshot()
שלב 10: עדכן src/lib/types/torah.ts (append)
שלב 11: npm test (244+ ירוקות) → commit + push
```

---

## 7. שאילתות בדיקה מלאות

```sql
-- א. canon types
SELECT code, direction FROM sys_transaction_types ORDER BY direction, code;

-- ב. budget vs actual
SELECT title, contract_price, planned_total_cost, actual_total_cost,
       projected_profit, cost_variance
FROM torah_project_budget_vs_actual;

-- ג. QA batch settlement
SELECT id, qa_kind, cost_amount, is_cost_settled FROM torah_qa_batches LIMIT 10;

-- ד. tagging
SELECT title, requires_tagging, tagging_status FROM torah_projects;

-- ה. net worth
SELECT get_net_worth_snapshot();
-- צפוי: jsonb עם net_worth_estimate > 0

-- ו. אין NULL ב-tagging_status
SELECT COUNT(*) FROM torah_projects WHERE tagging_status IS NULL;
-- צפוי: 0
```

---

## 8. מה גל 2 לא עושה

- ❌ אין UI חדש — מסכים קיימים לא נשברים
- ❌ אין שינוי ב-`crm.logic.ts`
- ❌ אין גדרת transaction_type ישנה — `transaction_type` המקורי נשמר
- ❌ אין unified ledger — זה גל 3
