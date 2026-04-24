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

## 1. Migration 085 — ledger_entries (Unified Ledger)

> **מטרה:** כל תנועת כסף בעסק — מכל מקור — ברשומה אחת.
> `erp_payments` (sales/investments) + `torah_project_transactions` → שורה אחת ב-ledger.

**קובץ:** `supabase/migrations/085_ledger_entries.sql`

```sql
-- 085: ledger_entries — unified ledger (append-only)
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

## 2. Migration 086 — Backfill ledger_entries מ-erp_payments

**קובץ:** `supabase/migrations/086_ledger_backfill_erp_payments.sql`

```sql
-- 086: backfill ledger_entries from erp_payments
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

## 3. Migration 087 — Monthly Dashboard View

> **מטרה:** שאילתה אחת שעונה "כמה הרווחתי החודש" מ**כל** סוגי העסקאות.

**קובץ:** `supabase/migrations/087_monthly_dashboard_view.sql`

```sql
-- 087: monthly_business_dashboard — unified P&L per month

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

## 4. Migration 088 — Deal Type UI Routing (server config)

> **מטרה:** כל `deal_type` יודע לאיזה route ב-Next.js הוא שייך.
> זה מאפשר ל-Server Component לעשות redirect אוטומטי.

**קובץ:** `supabase/migrations/088_deal_type_ui_routes.sql`

```sql
-- 088: add ui_route to sys_deal_types

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
שלב 2:  צור 085_ledger_entries.sql → apply_migration
שלב 3:  בדוק: SELECT COUNT(*) FROM ledger_entries; (צפוי: 0)
שלב 4:  צור 086_ledger_backfill_erp_payments.sql → apply_migration
שלב 5:  בדוק ספירה: COUNT(ledger_entries WHERE source_type='erp_payment') = COUNT(erp_payments)
שלב 6:  צור 087_monthly_dashboard_view.sql → apply_migration
שלב 7:  בדוק: SELECT * FROM monthly_business_dashboard LIMIT 5;
שלב 8:  צור 088_deal_type_ui_routes.sql → apply_migration
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
◻ Multi-user (SaaS) — הפעלת user_id isolation מלאה
◻ Mobile-first UI לסופר — עדכון סטטוס יריעות מהשטח
```
