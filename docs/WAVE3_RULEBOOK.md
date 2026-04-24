# ספר חוקים — גל 3: Unified Ledger + Dashboard + SaaS-Ready
## הידור הסת"ם ERP/CRM

> **תנאי מוקדם:** גלים 1+2 הושלמו ואושרו
> **ענף עבודה:** `claude/wave3-...` (ענף חדש)
> **תאריך:** 2026-04-24
> **אזהרה:** גל 3 כולל UI חדש ו-schema שינויים — Preview deploy חובה לפני merge

---

## 0. STOP — כללי ברזל

| # | חוק |
|---|-----|
| 1 | **ledger_entries = append-only** — אין UPDATE, אין DELETE על רשומות קיימות |
| 2 | **backfill מ-erp_payments** — בדיקה לפני ואחרי ספירת שורות |
| 3 | **RLS חובה** על `ledger_entries` — `user_id = auth.uid()` |
| 4 | **dashboard = SQL views בלבד** — אפס חישוב ב-TypeScript/React |
| 5 | **אין לשבור** את `erp_profit_ledger` הקיים — הוא SECURITY DEFINER, לא נוגעים |
| 6 | **deal_type routing** = switch ב-Server Component בלבד — לא ב-Client |

---

## 1. Migration 090 — ledger_entries (Unified Ledger)

> **מטרה:** כל תנועת כסף בעסק — מכל מקור — ברשומה אחת.
> `erp_payments` (sales/investments) + `torah_project_transactions` → שורה אחת ב-ledger.

**קובץ:** `supabase/migrations/090_ledger_entries.sql`

```sql
-- 090: ledger_entries — unified ledger (append-only)
-- ⚠️ NEVER UPDATE OR DELETE rows — only INSERT (audit trail)

CREATE TABLE IF NOT EXISTS ledger_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id),
  entry_date    DATE        NOT NULL,
  direction     TEXT        NOT NULL CHECK (direction IN ('in','out')),
  amount        NUMERIC     NOT NULL CHECK (amount > 0),
  category      TEXT        NOT NULL
    CHECK (category IN (
      'sale_income','cost_recovery','profit',
      'scribe_payment','parchment','qa_cost','tagging_cost',
      'sewing_cost','investment_payment','other_income','other_expense'
    )),
  source_type   TEXT        NOT NULL
    CHECK (source_type IN (
      'erp_payment','torah_transaction','erp_investment'
    )),
  source_id     UUID        NOT NULL,
  deal_type     TEXT        REFERENCES sys_deal_types(code),
  sale_id       UUID        REFERENCES erp_sales(id),
  project_id    UUID        REFERENCES torah_projects(id),
  investment_id UUID        REFERENCES erp_investments(id),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ledger_entries_user_policy" ON ledger_entries
  FOR ALL USING (user_id = auth.uid());

-- Index לשאילתות תאריך
CREATE INDEX IF NOT EXISTS idx_ledger_entries_date_user
  ON ledger_entries (user_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_deal_type
  ON ledger_entries (deal_type, entry_date DESC);
```

**⚠️ PITFALL:** `source_id` + `source_type` = composite key לייחוד. אל תוסיף UNIQUE constraint — אחד source יכול להניב מספר entries (פיצול עלות/רווח).

---

## 2. Migration 091 — Backfill ledger_entries מ-erp_payments

**קובץ:** `supabase/migrations/091_ledger_backfill_erp_payments.sql`

```sql
-- 091: backfill ledger_entries from erp_payments
-- ⚠️ בדוק COUNT לפני ואחרי!

-- ספירה לפני:
-- SELECT COUNT(*) FROM erp_payments;  -- שמור את המספר

INSERT INTO ledger_entries (
  user_id, entry_date, direction, amount,
  category, source_type, source_id,
  deal_type, sale_id, notes, created_at
)
SELECT
  ep.user_id,
  ep.payment_date::date,
  CASE ep.direction
    WHEN 'incoming' THEN 'in'
    WHEN 'outgoing' THEN 'out'
    ELSE 'in'
  END,
  ep.amount,
  CASE
    WHEN ep.entity_type = 'sale' AND ep.direction = 'incoming' THEN 'sale_income'
    WHEN ep.entity_type = 'sale' AND ep.direction = 'outgoing' THEN 'other_expense'
    WHEN ep.entity_type = 'investment'                          THEN 'investment_payment'
    ELSE 'other_expense'
  END,
  'erp_payment',
  ep.id,
  s.deal_type,
  CASE WHEN ep.entity_type = 'sale' THEN ep.entity_id END,
  ep.notes,
  ep.created_at
FROM erp_payments ep
LEFT JOIN erp_sales s ON s.id = ep.entity_id AND ep.entity_type = 'sale'
ON CONFLICT DO NOTHING;
```

**⚠️ PITFALL:** `ON CONFLICT DO NOTHING` — אם מריצים פעמיים לא ייוצרו כפילויות (כי אין UNIQUE constraint, אז זה לא יעזור). פתרון: הרץ פעם אחת בלבד ובדוק ספירה.

**בדיקה חובה:**
```sql
-- לפני:
SELECT COUNT(*) FROM erp_payments;           -- שמור: N

-- אחרי:
SELECT COUNT(*) FROM ledger_entries
WHERE source_type = 'erp_payment';           -- חייב = N
```

---

## 3. Migration 092 — Monthly Dashboard View

> **מטרה:** שאילתה אחת שעונה "כמה הרווחתי החודש" מ**כל** סוגי העסקאות.

**קובץ:** `supabase/migrations/092_monthly_dashboard_view.sql`

```sql
-- 092: monthly_business_dashboard — unified P&L per month

CREATE OR REPLACE VIEW monthly_business_dashboard AS
SELECT
  user_id,
  date_trunc('month', entry_date)::date  AS month,
  deal_type,
  -- הכנסות
  SUM(CASE WHEN direction = 'in'  THEN amount ELSE 0 END) AS total_income,
  -- הוצאות
  SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END) AS total_expenses,
  -- תזרים נטו
  SUM(CASE WHEN direction = 'in'  THEN amount ELSE 0 END)
  - SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END) AS net_cash_flow,
  -- ספירות
  COUNT(*) AS entry_count
FROM ledger_entries
GROUP BY user_id, date_trunc('month', entry_date), deal_type;

-- ─── View נפרד: monthly_profit_by_deal_type ───────────────────
-- מצרף גם את הרווח הממומש מ-erp_profit_ledger (sale-based)
CREATE OR REPLACE VIEW monthly_profit_by_deal_type AS
SELECT
  u.month,
  u.deal_type,
  u.total_income,
  u.total_expenses,
  u.net_cash_flow,
  -- רווח ממומש ממכירות (מה-profit ledger הקיים)
  COALESCE(m.total_profit, 0)  AS realized_profit_sales,
  -- רווח כולל: cash flow + ממומש
  u.net_cash_flow + COALESCE(m.total_profit, 0) AS combined_profit
FROM monthly_business_dashboard u
LEFT JOIN monthly_realized_profit_view m
  ON m.month = u.month
  AND (u.deal_type IN ('inventory_sale','brokerage_book','brokerage_scribe'));
```

**⚠️ PITFALL:** `monthly_realized_profit_view` קיים כבר ב-DB (confirmed). ה-JOIN בסיכום `m.month` מניח שהוא column DATE — בדוק טיפוס לפני deploy.

**בדיקה:**
```sql
-- לאחר backfill:
SELECT month, deal_type, total_income, total_expenses, net_cash_flow
FROM monthly_business_dashboard
ORDER BY month DESC, deal_type;
```

---

## 4. Migration 093 — Deal Type UI Routing (server config)

> **מטרה:** כל `deal_type` יודע לאיזה route ב-Next.js הוא שייך.
> זה מאפשר ל-Server Component לעשות redirect אוטומטי.

**קובץ:** `supabase/migrations/093_deal_type_ui_routes.sql`

```sql
-- 093: add ui_route to sys_deal_types

ALTER TABLE sys_deal_types
  ADD COLUMN IF NOT EXISTS ui_route        TEXT,
  ADD COLUMN IF NOT EXISTS list_page_route TEXT;

UPDATE sys_deal_types SET
  ui_route        = '/sales/brokerage/scribe',
  list_page_route = '/sales/brokerage'
WHERE code = 'brokerage_scribe';

UPDATE sys_deal_types SET
  ui_route        = '/sales/brokerage/book',
  list_page_route = '/sales/brokerage'
WHERE code = 'brokerage_book';

UPDATE sys_deal_types SET
  ui_route        = '/sales/inventory',
  list_page_route = '/sales/inventory'
WHERE code = 'inventory_sale';

UPDATE sys_deal_types SET
  ui_route        = '/investments',
  list_page_route = '/investments'
WHERE code = 'writing_investment';

UPDATE sys_deal_types SET
  ui_route        = '/torah',
  list_page_route = '/torah'
WHERE code = 'managed_torah_project';
```

---

## 5. TypeScript — עדכונים

### 5.1 src/lib/types/ledger.ts (קובץ חדש)

```typescript
// src/lib/types/ledger.ts

export type LedgerDirection = 'in' | 'out';

export type LedgerCategory =
  | 'sale_income' | 'cost_recovery' | 'profit'
  | 'scribe_payment' | 'parchment' | 'qa_cost'
  | 'tagging_cost' | 'sewing_cost' | 'investment_payment'
  | 'other_income' | 'other_expense';

export type LedgerSourceType =
  | 'erp_payment' | 'torah_transaction' | 'erp_investment';

export interface LedgerEntry {
  id: string;
  user_id: string;
  entry_date: string;        // ISO date
  direction: LedgerDirection;
  amount: number;
  category: LedgerCategory;
  source_type: LedgerSourceType;
  source_id: string;
  deal_type: string | null;
  sale_id: string | null;
  project_id: string | null;
  investment_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface MonthlyDashboardRow {
  user_id: string;
  month: string;             // ISO date (first day of month)
  deal_type: string | null;
  total_income: number;
  total_expenses: number;
  net_cash_flow: number;
  entry_count: number;
}

export interface MonthlyProfitByDealType extends MonthlyDashboardRow {
  realized_profit_sales: number;
  combined_profit: number;
}
```

### 5.2 src/lib/types/deal.ts (קובץ חדש)

```typescript
// src/lib/types/deal.ts — Deal type lookup row from sys_deal_types

export interface DealType {
  code: string;
  label_he: string;
  has_client: boolean;
  has_scribe: boolean;
  has_parchment: boolean;
  profit_method: 'margin_per_page' | 'fixed_fee' | 'cost_recovery';
  ui_route: string | null;
  list_page_route: string | null;
}

export const DEAL_TYPE_CODES = [
  'brokerage_scribe',
  'brokerage_book',
  'inventory_sale',
  'writing_investment',
  'managed_torah_project',
] as const;

export type DealTypeCode = typeof DEAL_TYPE_CODES[number];
```

---

## 6. Server Component — Deal Type Router

> **קובץ:** `app/deals/[deal_type]/page.tsx` (חדש)

```typescript
// app/deals/[deal_type]/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';

interface Props {
  params: { deal_type: string };
}

export default async function DealTypeRouter({ params }: Props) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('sys_deal_types')
    .select('ui_route')
    .eq('code', params.deal_type)
    .single();

  if (data?.ui_route) {
    redirect(data.ui_route);
  }

  redirect('/dashboard');
}
```

**⚠️ PITFALL:** `redirect()` ב-Next.js App Router זורק exception — אל תעטוף ב-try/catch.

---

## 7. סדר ביצוע גל 3 (15 שלבים)

```
שלב 1:  git checkout -b claude/wave3-unified-ledger
שלב 2:  צור 090_ledger_entries.sql → apply_migration
שלב 3:  בדוק: SELECT COUNT(*) FROM ledger_entries; (צפוי: 0)
שלב 4:  צור 091_ledger_backfill_erp_payments.sql → apply_migration
שלב 5:  בדוק ספירה: COUNT(ledger_entries WHERE source_type='erp_payment') = COUNT(erp_payments)
שלב 6:  צור 092_monthly_dashboard_view.sql → apply_migration
שלב 7:  בדוק: SELECT * FROM monthly_business_dashboard LIMIT 5;
שלב 8:  צור 093_deal_type_ui_routes.sql → apply_migration
שלב 9:  בדוק: SELECT code, ui_route FROM sys_deal_types;
שלב 10: צור src/lib/types/ledger.ts
שלב 11: צור src/lib/types/deal.ts
שלב 12: צור app/deals/[deal_type]/page.tsx
שלב 13: npm test (244+ ירוקות)
שלב 14: npm run build (0 שגיאות TS)
שלב 15: commit + push → Preview deploy → אישור → merge ל-main
```

---

## 8. שאילתות בדיקה מלאות

```sql
-- א. ledger_entries קיים עם RLS
SELECT id, direction, amount, category, source_type
FROM ledger_entries LIMIT 5;

-- ב. backfill תקין
SELECT
  (SELECT COUNT(*) FROM erp_payments)                     AS payments_count,
  (SELECT COUNT(*) FROM ledger_entries
   WHERE source_type = 'erp_payment')                     AS ledger_backfill_count;
-- חייב להיות שווה

-- ג. dashboard עובד
SELECT month, deal_type, total_income, net_cash_flow
FROM monthly_business_dashboard
ORDER BY month DESC LIMIT 10;

-- ד. deal_type routes
SELECT code, label_he, ui_route FROM sys_deal_types ORDER BY code;
-- כל 5 שורות עם ui_route מלא

-- ה. net worth (מגל 2)
SELECT get_net_worth_snapshot();
```

---

## 9. מה גל 3 מסיים

```
✅ כל תנועת כסף → לג'ר מרכזי
✅ "כמה הרווחתי החודש" → שאילתה אחת
✅ deal_type → UI route אוטומטי
✅ Net Worth snapshot ← גל 2
✅ Budget vs Actual ← גל 2
✅ RLS מוכן לריבוי משתמשים (SaaS-ready)
```

---

## 10. מה נשאר אחרי גל 3 (גל 4 — עתידי)

```
◻ WhatsApp automation per deal_type (ברכות, תזכורות, קבלות)
◻ לקוח portal — לקוח רואה סטטוס הפרויקט שלו בלבד
◻ דוח שנתי PDF — סיכום לחשבונאי
◻ Mobile-first UI לסופר — עדכון סטטוס יריעות מהשטח
◻ IVR integration (ימות המשיח) — שעון נוכחות סופר
◻ External gallery + share links — לסוחרים
◻ AI "glue only" — quote generator סביב שדות מאושרים
◻ BI deep analytics — רווחיות לפי סופר/קלף/כתב/מגיה
◻ Smart pricing engine — מחשבון חוזה מבוסס עלויות היסטוריות
```

---

## 11. PATCHES — פערים שנמצאו בניתוח שקלול

> **מקור:** שקלול 3 מסמכי סיכום (2026-04-24). Priority B — חובה לפני production.

### 11.1 Migration 094 — `sys_user_roles` + Permission Engine

> **מטרה:** הפרדה רשמית בין תפקידים (admin/employee/client/scribe/trader).
> לא רק "להסתיר שדות ב-UI" — אלא מנוע הרשאות DB-level.
> **מקור:** סיכום 1 חובה §10.

**קובץ:** `supabase/migrations/094_sys_user_roles.sql`

```sql
-- 094: sys_user_roles — formal permission engine

CREATE TABLE IF NOT EXISTS sys_user_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN (
    'admin','employee','client','scribe','trader','partner'
  )),
  scope_type   TEXT,  -- 'project' | 'contact' | 'global'
  scope_id     UUID,  -- project_id / contact_id if scoped
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by   UUID REFERENCES auth.users(id),
  expires_at   TIMESTAMPTZ,
  UNIQUE (user_id, role, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON sys_user_roles (user_id, role);
CREATE INDEX IF NOT EXISTS idx_user_roles_scope ON sys_user_roles (scope_type, scope_id);

ALTER TABLE sys_user_roles ENABLE ROW LEVEL SECURITY;

-- רק admin רואה הכל, משתמש רואה את הרולים שלו
CREATE POLICY "user_roles_self_read" ON sys_user_roles
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM sys_user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

-- רק admin יוצר/מוחק רולים
CREATE POLICY "user_roles_admin_write" ON sys_user_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sys_user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

-- Helper function
CREATE OR REPLACE FUNCTION public.has_role(p_role TEXT, p_scope_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sys_user_roles
    WHERE user_id = auth.uid()
      AND role = p_role
      AND (scope_id IS NULL OR scope_id = p_scope_id)
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;

-- Seed: המשתמש הנוכחי יקבל admin
INSERT INTO sys_user_roles (user_id, role, scope_type)
SELECT id, 'admin', 'global' FROM auth.users
WHERE email = (SELECT email FROM auth.users LIMIT 1)
ON CONFLICT DO NOTHING;
```

**⚠️ PITFALL:** ה-seed נותן admin למשתמש הראשון. ודא שזה אתה לפני deploy.

**⚠️ PITFALL 2:** אל תפעיל מיד RLS policies שמבוססות על `has_role()` על טבלאות חיות — קודם ודא שיש לך admin role. אחרת תינעל מהנתונים שלך.

---

### 11.2 Migration 095 — `business_exceptions` VIEW

> **מטרה:** דשבורד שצועק — פרויקטים בפיגור, גבייה תקועה, חריגת עלות, חוב פתוח.
> **מקור:** סיכום 1 מומלץ §3 + סיכום 3 §2.

**קובץ:** `supabase/migrations/095_business_exceptions_view.sql`

```sql
-- 095: business_exceptions — unified alerts VIEW

CREATE OR REPLACE VIEW business_exceptions AS

-- 1. פרויקטי תורה בפיגור כתיבה
SELECT
  'pace_behind'::TEXT                        AS exception_type,
  'error'::TEXT                              AS severity,
  pa.project_id                              AS entity_id,
  'torah_project'::TEXT                      AS entity_type,
  pa.title                                   AS entity_label,
  format('פיגור %s עמודות בכתיבה', pa.columns_behind) AS message,
  jsonb_build_object(
    'columns_behind', pa.columns_behind,
    'pace_status',    pa.pace_status
  ) AS meta,
  now() AS detected_at
FROM torah_project_pace_analysis pa
WHERE pa.pace_status IN ('behind','at_risk')

UNION ALL

-- 2. גבייה תקועה מלקוחות (פיגור > 7 ימים)
SELECT
  'collection_overdue'::TEXT,
  CASE WHEN days_overdue > 30 THEN 'error' ELSE 'warning' END,
  project_id,
  'torah_project'::TEXT,
  NULL,  -- תצטרך JOIN לטבלת torah_projects ב-UI
  format('%s₪ בפיגור %s ימים מהלקוח', variance_amount, days_overdue),
  jsonb_build_object(
    'variance_amount', variance_amount,
    'days_overdue',    days_overdue,
    'party',           party
  ),
  now()
FROM torah_payment_schedule_variance
WHERE party = 'client' AND variance_amount > 0 AND days_overdue > 7

UNION ALL

-- 3. חריגת עלות פרויקט (מעל 10% מהתקציב)
SELECT
  'budget_overrun'::TEXT,
  CASE
    WHEN cost_variance > planned_total_cost * 0.25 THEN 'error'
    ELSE 'warning'
  END,
  id,
  'torah_project'::TEXT,
  title,
  format('חריגת עלות: %s₪ (+%s%%)',
    cost_variance::INTEGER,
    ((cost_variance / NULLIF(planned_total_cost, 0)) * 100)::INTEGER),
  jsonb_build_object(
    'cost_variance',      cost_variance,
    'planned_total_cost', planned_total_cost,
    'actual_total_cost',  actual_total_cost
  ),
  now()
FROM torah_project_budget_vs_actual
WHERE cost_variance > planned_total_cost * 0.10
  AND planned_total_cost > 0

UNION ALL

-- 4. חוב פתוח לסופרים (פיגור בתשלום לסופר)
SELECT
  'scribe_debt_overdue'::TEXT,
  'warning'::TEXT,
  project_id,
  'torah_project'::TEXT,
  NULL,
  format('חוב לסופר: %s₪ בפיגור %s ימים', variance_amount, days_overdue),
  jsonb_build_object(
    'variance_amount', variance_amount,
    'days_overdue',    days_overdue
  ),
  now()
FROM torah_payment_schedule_variance
WHERE party = 'scribe' AND variance_amount > 0 AND days_overdue > 14

UNION ALL

-- 5. מכירות לא שולמו (חוב לקוח > 30 ימים מהעסקה)
SELECT
  'sale_unpaid'::TEXT,
  'warning'::TEXT,
  s.id,
  'erp_sale'::TEXT,
  NULL,
  format('מכירה לא שולמה: %s₪ מתוך %s₪',
    (s.total_price - COALESCE(p.total_paid, 0))::INTEGER,
    s.total_price::INTEGER),
  jsonb_build_object(
    'unpaid_amount', s.total_price - COALESCE(p.total_paid, 0),
    'total_price',   s.total_price
  ),
  now()
FROM erp_sales s
LEFT JOIN (
  SELECT entity_id, SUM(amount) AS total_paid
  FROM erp_payments
  WHERE direction = 'incoming'
  GROUP BY entity_id
) p ON p.entity_id = s.id
WHERE s.status NOT IN ('נמכר','sold','cancelled','paid')
  AND (s.total_price - COALESCE(p.total_paid, 0)) > 0;
```

**⚠️ PITFALL:** ה-VIEW תלוי ב-`torah_project_pace_analysis` ו-`torah_payment_schedule_variance` (מ-Wave 2 patches §9.2, §9.3). ודא שהם הוחלו קודם.

**בדיקה:**
```sql
-- כל החריגות לפי חומרה
SELECT exception_type, severity, COUNT(*)
FROM business_exceptions
GROUP BY exception_type, severity
ORDER BY severity, exception_type;

-- top 10 דחופות
SELECT exception_type, severity, entity_id, message
FROM business_exceptions
WHERE severity = 'error'
LIMIT 10;
```

---

### 11.3 Server Action — Broadcast Replay

> **מטרה:** כפתור "שלח שוב" ל-broadcast שכבר נשלח.
> **מקור:** סיכום 3 §8.

**קובץ:** `app/broadcasts/actions.ts` — הוסף את הפעולה הזו:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';

const ReplayInput = z.object({
  broadcast_log_id: z.string().uuid(),
});

export async function replayBroadcast(input: z.infer<typeof ReplayInput>) {
  const parsed = ReplayInput.parse(input);
  const supabase = await createClient();

  // טען את ה-broadcast המקורי
  const { data: original, error: loadErr } = await supabase
    .from('broadcast_logs')
    .select('*')
    .eq('id', parsed.broadcast_log_id)
    .single();

  if (loadErr || !original) {
    throw new Error('Broadcast לא נמצא');
  }

  // צור רשומה חדשה ב-broadcast_queue עם reference למקור
  const { error: queueErr } = await supabase
    .from('broadcast_queue')
    .insert({
      message_text: original.message_text,
      audience_filter: original.audience_filter,
      scheduled_at: new Date().toISOString(),
      replay_of_log_id: parsed.broadcast_log_id,
      status: 'pending',
    });

  if (queueErr) {
    throw new Error(`Replay נכשל: ${queueErr.message}`);
  }

  revalidatePath('/broadcasts');
  return { success: true };
}
```

**⚠️ PITFALL:** ודא ש-`broadcast_queue` מכיל את העמודה `replay_of_log_id`. אם לא — הוסף migration קטן:

```sql
ALTER TABLE broadcast_queue
  ADD COLUMN IF NOT EXISTS replay_of_log_id UUID REFERENCES broadcast_logs(id);
```

**UI Integration:** הוסף כפתור ב-`app/broadcasts/page.tsx`:

```typescript
<form action={async () => {
  'use server';
  await replayBroadcast({ broadcast_log_id: log.id });
}}>
  <button type="submit">שלח שוב</button>
</form>
```

---

## 12. סדר ביצוע גל 3 מעודכן (18 שלבים)

```
שלבים 1-15: כמו בסעיף §7 (090-093 + TypeScript + router)
שלב 16: צור 094_sys_user_roles.sql → apply_migration
שלב 17: בדוק: SELECT * FROM sys_user_roles;  — חייב לראות admin
שלב 18: צור 095_business_exceptions_view.sql → apply_migration
שלב 19: בדוק: SELECT * FROM business_exceptions LIMIT 10;
שלב 20: הוסף replayBroadcast ל-app/broadcasts/actions.ts
שלב 21: npm test + commit + push → Preview → אישור → merge
```
