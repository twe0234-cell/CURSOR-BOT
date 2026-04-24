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

---

## 9. PATCHES — פערים שנמצאו בניתוח שקלול

> **מקור:** שקלול 3 מסמכי סיכום (2026-04-24). 4 migrations חדשים + שיפור tagging.
> **הרץ אחרי** migrations 081–084 של גל 2.

### 9.1 Migration 085 — `torah_qa_batch_movements` (event log)

> **מטרה:** תמלול "שקית הגהה כיחידת עבודה". כל תנועה של שקית — יצא/חזר/מחזיק/פעולה/עלות — ברשומה אחת.

**קובץ:** `supabase/migrations/085_torah_qa_batch_movements.sql`

```sql
-- 085: torah_qa_batch_movements — full lifecycle log per QA bag

CREATE TABLE IF NOT EXISTS torah_qa_batch_movements (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        UUID        NOT NULL REFERENCES torah_qa_batches(id) ON DELETE CASCADE,
  action          TEXT        NOT NULL CHECK (action IN (
    'created',
    'sent_to_computer_qa', 'returned_from_computer_qa',
    'sent_to_gavra_qa',    'returned_from_gavra_qa',
    'sent_to_repair',      'returned_from_repair',
    'sent_to_tagging',     'returned_from_tagging',
    'sent_to_sofer',       'returned_from_sofer',
    'approved',            'voided'
  )),
  direction       TEXT        CHECK (direction IN ('out','in','none')),
  holder_id       UUID        REFERENCES crm_contacts(id),
  holder_label    TEXT,        -- כשאין CRM contact (למשל "הגהת מחשב")
  cost_amount     NUMERIC      DEFAULT 0 CHECK (cost_amount >= 0),
  transaction_id  UUID        REFERENCES torah_project_transactions(id),
  report_url      TEXT,
  notes           TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qa_movements_batch_date
  ON torah_qa_batch_movements (batch_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_qa_movements_holder
  ON torah_qa_batch_movements (holder_id, occurred_at DESC);

ALTER TABLE torah_qa_batch_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qa_movements_user_policy" ON torah_qa_batch_movements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM torah_qa_batches b
      JOIN torah_projects p ON p.id = b.project_id
      WHERE b.id = torah_qa_batch_movements.batch_id
        AND p.user_id = auth.uid()
    )
  );

-- VIEW: מצב נוכחי של כל שקית (מחזיק אחרון, סטטוס אחרון)
CREATE OR REPLACE VIEW torah_qa_batch_current_location AS
SELECT DISTINCT ON (batch_id)
  batch_id,
  action          AS last_action,
  direction       AS last_direction,
  holder_id       AS current_holder_id,
  holder_label    AS current_holder_label,
  occurred_at     AS last_movement_at
FROM torah_qa_batch_movements
ORDER BY batch_id, occurred_at DESC;
```

**⚠️ PITFALL:** `holder_id` nullable כי יש פעולות ללא איש קשר (הגהת מחשב). השתמש ב-`holder_label` כ-fallback.

**בדיקה:**
```sql
-- הוסף תנועה ידנית וודא שהשינוי ב-current_location
SELECT * FROM torah_qa_batch_current_location LIMIT 5;
```

---

### 9.2 Migration 086 — Payment Schedule Variance VIEW

> **מטרה:** כמה היה אמור להיגבות/להישלם עד היום? כמה בוצע? פיגור?
> **מקור:** סיכום 1 חובה §6.

**קובץ:** `supabase/migrations/086_payment_schedule_variance_view.sql`

```sql
-- 086: torah_payment_schedule_variance — expected vs actual per party

CREATE OR REPLACE VIEW torah_payment_schedule_variance AS
WITH scheduled AS (
  SELECT
    project_id,
    party,
    SUM(CASE WHEN due_date <= CURRENT_DATE THEN amount ELSE 0 END) AS expected_by_now,
    SUM(amount)                                                    AS total_scheduled,
    MIN(CASE WHEN status != 'paid' AND due_date <= CURRENT_DATE
             THEN due_date END)                                    AS earliest_overdue
  FROM torah_payment_schedules
  GROUP BY project_id, party
),
actual_client AS (
  SELECT project_id, SUM(amount) AS paid
  FROM torah_project_transactions
  WHERE transaction_type = 'client_payment'
  GROUP BY project_id
),
actual_scribe AS (
  SELECT project_id, SUM(amount) AS paid
  FROM torah_project_transactions
  WHERE transaction_type = 'scribe_payment'
  GROUP BY project_id
)
SELECT
  s.project_id,
  s.party,
  s.total_scheduled,
  s.expected_by_now,
  CASE s.party
    WHEN 'client' THEN COALESCE(ac.paid, 0)
    WHEN 'scribe' THEN COALESCE(asc_.paid, 0)
    ELSE 0
  END                                                 AS actual_paid,
  s.expected_by_now
    - CASE s.party
        WHEN 'client' THEN COALESCE(ac.paid, 0)
        WHEN 'scribe' THEN COALESCE(asc_.paid, 0)
        ELSE 0
      END                                             AS variance_amount,
  CASE WHEN s.earliest_overdue IS NULL
       THEN 0
       ELSE (CURRENT_DATE - s.earliest_overdue)
  END                                                 AS days_overdue
FROM scheduled s
LEFT JOIN actual_client  ac  ON ac.project_id  = s.project_id AND s.party = 'client'
LEFT JOIN actual_scribe  asc_ ON asc_.project_id = s.project_id AND s.party = 'scribe';
```

**⚠️ PITFALL:** `party` ב-`torah_payment_schedules` מקבל 'client' או 'scribe'. ודא ב-DB.

**בדיקה:**
```sql
SELECT project_id, party, expected_by_now, actual_paid,
       variance_amount, days_overdue
FROM torah_payment_schedule_variance
WHERE variance_amount > 0
ORDER BY days_overdue DESC;
-- פרויקטים בפיגור גבייה/תשלום
```

---

### 9.3 Migration 087 — Writing Pace Analysis VIEW

> **מטרה:** קצב נדרש vs קצב בפועל. האם הפרויקט בפיגור?
> **מקור:** סיכום 1 חובה §8 + סיכום 3 §3. `torahCompletionForecast.ts` קיים אך אין VIEW.

**קובץ:** `supabase/migrations/087_project_pace_analysis_view.sql`

```sql
-- 087: torah_project_pace_analysis — required vs actual writing pace

CREATE OR REPLACE VIEW torah_project_pace_analysis AS
WITH sheet_progress AS (
  SELECT
    project_id,
    SUM(columns_count) FILTER (WHERE status IN (
      'written','reported_written','received','in_qa',
      'needs_fixing','approved','sewn'
    )) AS columns_written,
    SUM(columns_count) AS columns_total
  FROM torah_sheets
  GROUP BY project_id
)
SELECT
  tp.id                                     AS project_id,
  tp.title,
  tp.start_date,
  tp.target_date,
  tp.columns_per_day                        AS required_pace,
  COALESCE(sp.columns_total, 245)           AS columns_total,
  COALESCE(sp.columns_written, 0)           AS columns_written,

  -- ימי עבודה שעברו
  GREATEST((CURRENT_DATE - tp.start_date), 0) AS days_since_start,

  -- קצב בפועל
  CASE WHEN GREATEST((CURRENT_DATE - tp.start_date), 0) > 0
       THEN COALESCE(sp.columns_written, 0)::numeric
          / GREATEST((CURRENT_DATE - tp.start_date), 1)
       ELSE 0
  END                                       AS actual_pace,

  -- עמודות נדרשות עד היום
  tp.columns_per_day * GREATEST((CURRENT_DATE - tp.start_date), 0)
                                            AS expected_columns_by_now,

  -- פיגור
  (tp.columns_per_day * GREATEST((CURRENT_DATE - tp.start_date), 0))
    - COALESCE(sp.columns_written, 0)      AS columns_behind,

  CASE
    WHEN tp.target_date IS NULL THEN 'no_deadline'
    WHEN tp.columns_per_day = 0 THEN 'no_pace_set'
    WHEN COALESCE(sp.columns_written, 0) >= COALESCE(sp.columns_total, 245) THEN 'completed'
    WHEN (tp.columns_per_day * GREATEST((CURRENT_DATE - tp.start_date), 0))
         - COALESCE(sp.columns_written, 0) > (tp.columns_per_day * 7)
      THEN 'at_risk'
    WHEN (tp.columns_per_day * GREATEST((CURRENT_DATE - tp.start_date), 0))
         - COALESCE(sp.columns_written, 0) > 0
      THEN 'behind'
    ELSE 'on_track'
  END                                       AS pace_status

FROM torah_projects tp
LEFT JOIN sheet_progress sp ON sp.project_id = tp.id
WHERE tp.status NOT IN ('delivered','completed');
```

**⚠️ PITFALL:** אם `start_date` NULL — ה-VIEW מחזיר 0 ימים. ודא שהפרויקטים הפעילים בעלי start_date.

**בדיקה:**
```sql
SELECT project_id, title, columns_behind, pace_status
FROM torah_project_pace_analysis
WHERE pace_status IN ('behind','at_risk')
ORDER BY columns_behind DESC;
```

---

### 9.4 Migration 088 — Calculator Snapshot vs Actual VIEW

> **מטרה:** השוואה בין הצעת מחיר מקורית (`calculator_snapshot` JSONB) לעלויות בפועל.
> **מקור:** סיכום 3 §6.

**קובץ:** `supabase/migrations/088_calculator_vs_actual_view.sql`

```sql
-- 088: torah_calculator_vs_actual — original quote vs actual expenses

CREATE OR REPLACE VIEW torah_calculator_vs_actual AS
SELECT
  tp.id                                         AS project_id,
  tp.title,
  tp.snapshot_locked_at,

  -- מהצעת המחיר (calculator_snapshot JSONB)
  COALESCE((tp.calculator_snapshot->>'scribe_total')::numeric, 0)        AS quoted_scribe,
  COALESCE((tp.calculator_snapshot->>'parchment_total')::numeric, 0)     AS quoted_parchment,
  COALESCE((tp.calculator_snapshot->>'proofreading_total')::numeric, 0)  AS quoted_proofreading,
  COALESCE((tp.calculator_snapshot->>'tagging_total')::numeric, 0)       AS quoted_tagging,
  COALESCE((tp.calculator_snapshot->>'total_cost')::numeric, 0)          AS quoted_total,

  -- בפועל
  bva.actual_scribe,
  bva.actual_parchment,
  bva.actual_proofreading,
  bva.actual_total_cost,

  -- חריגה לכל קטגוריה
  bva.actual_scribe
    - COALESCE((tp.calculator_snapshot->>'scribe_total')::numeric, 0)    AS scribe_variance,
  bva.actual_parchment
    - COALESCE((tp.calculator_snapshot->>'parchment_total')::numeric, 0) AS parchment_variance,
  bva.actual_proofreading
    - COALESCE((tp.calculator_snapshot->>'proofreading_total')::numeric, 0)
                                                                         AS proofreading_variance,
  bva.actual_total_cost
    - COALESCE((tp.calculator_snapshot->>'total_cost')::numeric, 0)      AS total_variance

FROM torah_projects tp
LEFT JOIN torah_project_budget_vs_actual bva ON bva.id = tp.id
WHERE tp.calculator_snapshot IS NOT NULL;
```

**⚠️ PITFALL:** מבנה `calculator_snapshot` תלוי איך הוא נשמר. בדוק דוגמה אמיתית לפני deploy:
```sql
SELECT calculator_snapshot FROM torah_projects
WHERE calculator_snapshot IS NOT NULL LIMIT 1;
```
אם המפתחות שונים (למשל `scribe_cost` במקום `scribe_total`) — תקן את ה-VIEW.

---

### 9.5 Enhancement ל-§3 — Tagging Cost Flow אוטומטי

> **מקור:** סיכום 3 §5 + תמלול "תיוג".
> **מטרה:** כש-tagging_status עובר ל-'completed' — נוצרת transaction אוטומטית.

**קובץ נוסף:** `supabase/migrations/089_tagging_cost_automation.sql`

```sql
-- 089: tagging cost per column + auto-transaction trigger

ALTER TABLE torah_projects
  ADD COLUMN IF NOT EXISTS tagging_cost_per_column NUMERIC
    NOT NULL DEFAULT 30
    CHECK (tagging_cost_per_column >= 0),
  ADD COLUMN IF NOT EXISTS tagger_contact_id UUID REFERENCES crm_contacts(id);

-- Function: יצירת transaction של עלות תיוג
CREATE OR REPLACE FUNCTION public.create_tagging_cost_tx()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_columns INTEGER;
  v_cost NUMERIC;
BEGIN
  -- רק כשעברו ל-completed ולא היו שם קודם
  IF NEW.tagging_status = 'completed'
     AND (OLD.tagging_status IS NULL OR OLD.tagging_status != 'completed')
  THEN
    -- סכום עמודות מהיריעות
    SELECT COALESCE(SUM(columns_count), 245)
    INTO v_total_columns
    FROM torah_sheets
    WHERE project_id = NEW.id;

    v_cost := v_total_columns * NEW.tagging_cost_per_column;

    -- הימנע מכפילויות — בדוק שאין כבר transaction תיוג
    IF NOT EXISTS (
      SELECT 1 FROM torah_project_transactions
      WHERE project_id = NEW.id
        AND transaction_type = 'tagging_payment'
    ) THEN
      INSERT INTO torah_project_transactions (
        project_id, transaction_type, amount, date, notes
      ) VALUES (
        NEW.id, 'tagging_payment', v_cost, now(),
        format('תיוג אוטומטי: %s עמודות × %s ₪', v_total_columns, NEW.tagging_cost_per_column)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tagging_cost_auto ON torah_projects;
CREATE TRIGGER trg_tagging_cost_auto
  AFTER UPDATE OF tagging_status ON torah_projects
  FOR EACH ROW
  EXECUTE FUNCTION create_tagging_cost_tx();
```

**⚠️ PITFALL:** ה-trigger **מוסיף רק פעם אחת** (בדיקת EXISTS). אם מישהו מעביר completed→pending→completed — לא ייצור כפילות.

**בדיקה:**
```sql
-- א. עמודה חדשה
SELECT id, title, tagging_status, tagging_cost_per_column
FROM torah_projects;

-- ב. תדגים trigger
UPDATE torah_projects SET tagging_status = 'completed'
WHERE id = '...' AND requires_tagging = TRUE;

SELECT transaction_type, amount, notes FROM torah_project_transactions
WHERE project_id = '...' AND transaction_type = 'tagging_payment';
```

---

## 10. סדר ביצוע גל 2 (מעודכן — 16 שלבים)

```
שלבים 1-11: כמו בסעיף §6 לעיל (081-084 + TypeScript)
שלב 12: צור 085_torah_qa_batch_movements.sql → apply_migration
שלב 13: צור 086_payment_schedule_variance_view.sql → apply_migration
שלב 14: צור 087_project_pace_analysis_view.sql → apply_migration
שלב 15: צור 088_calculator_vs_actual_view.sql → apply_migration
שלב 16: צור 089_tagging_cost_automation.sql → apply_migration
שלב 17: npm test + commit + push
```
