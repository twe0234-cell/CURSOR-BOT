# CLAUDE.md — הידור הסת"ם ERP/CRM

Source of truth for Claude Code. Read before touching any file.

**Mandatory for all agents:** [ENGINEERING_QA_PROTOCOL.md](ENGINEERING_QA_PROTOCOL.md) — QA, bug prevention, and safe-change rules for a live financial system (complements this file; not optional).

---

## 1. מה המערכת

**"הידור הסת"ם"** — ERP/CRM פרודקשן למסחר ותיווך בסת"ם (ספרי תורה, תפילין, מזוזות).

מחזור חיים מלא:
**הזמנת סופר (השקעה) → מלאי (SKU) → מכירה → תשלומים → רווח מומש**

- דומיין: עברית. UI: RTL. מטבע: ₪.
- משתמש יחיד כרגע (SaaS-ready — RLS מוכן לריבוי משתמשים).

---

## 0. כלל עבודה בסיסי (WORKFLOW RULE)

**NEVER** צור ענפים (branches) ברקע או לצורך פיצ'רים — אלא אם המשתמש ביקש **במפורש** "צור ענף חדש".
כל עריכה, refactor, ופיצ'ר מבוצעים **ישירות על ענף `main`**.
שינויים חייבים להיות גלויים מיידית בתיקייה הפעילה של המשתמש.

**חריג יחיד:** ענף `claude/...` יכול להיפתח אם Cursor/Claude Code session מגדיר זאת אוטומטית — אך יש למזג חזרה ל-main ולמחוק לפני סיום.

---

## 2. מזהים קריטיים (MCP חי)

| שירות | מזהה |
|--------|------|
| **Supabase project ID** | `wohrvtugrzqhxyeerxal` |
| **Supabase region** | `ap-northeast-2` |
| **Vercel project ID** | `prj_sfsCBHf5yax7yqzsVSVMdJ2MamGx` |
| **Vercel team ID** | `team_M6xohw6vMmwSTSUYwOFWwjwV` |
| **GitHub repo** | `twe0234-cell/CURSOR-BOT` |
| **Production branch** | `main` (Vercel מחובר ל-main) |

---

## 3. Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Database | Supabase PostgreSQL + Auth + RLS + Storage |
| Hosting | Vercel + daily cron `/api/cron/process-broadcasts` 00:00 |
| UI | Tailwind v4, Shadcn UI, Framer Motion, RTL Hebrew |
| Forms | react-hook-form + Zod v4 |
| Tests | Vitest — `npm test` — כרגע **57 בדיקות עוברות** |
| WhatsApp | Green API |
| Email | Gmail OAuth (googleapis) |
| Bundler | Turbopack |

---

## 4. כללים ארכיטקטוניים (מוחלטים)

### 4.1 שכבות

| שכבה | מיקום | חוק |
|------|--------|-----|
| **Pure logic** | `src/services/crm.logic.ts` | ללא I/O, ללא Supabase, סינכרוני, ניתן לבדיקה |
| **Service** | `src/services/crm.service.ts` | אורקסטרטור בלבד + Supabase. אפס חישובים |
| **Mutations** | `app/**/actions.ts` | Server Actions. Zod. קורא לשירות. קורא `revalidatePath` |
| **Profit engine** | PostgreSQL בלבד | `rebuild_sale_ledger()` trigger. לעולם לא מממש מחדש ב-TypeScript |

### 4.2 ZERO UI MATH
קומפוננטות frontend לא מחשבות יתרות, רווחים, או חובות.
הן מציגות בלבד את מה שמגיע מ-`crm.logic.ts`.

### 4.3 SINGLE SOURCE OF TRUTH
שינוי פיננסי אחד = קובץ אחד: `crm.logic.ts`. לא עוד.

### 4.4 TEST DRIVEN
אחרי כל שינוי לוגי: `npm test`. אם בדיקות נכשלות — אין commit.

### 4.5 SAFE TYPES
- קלטים ריקים נשמרים כ-`0` (לא `null`, לא `undefined`)
- בממשק מוצגים כ-`""` (מחרוזת ריקה) — למניעת באג "0450"

---

## 5. דומיינים עסקיים

| דומיין | טבלה ראשית | כסף |
|--------|------------|-----|
| מלאי (Market) | `inventory` | מלאי פיזי בבעלות |
| השקעות | `erp_investments` | כסף יוצא — מימון סופרים |
| מכירות מלאי | `erp_sales` (sale_type≠תיווך) | כסף נכנס, עלות ידועה |
| מכירות תיווך | `erp_sales` (sale_type=תיווך) | כסף נכנס, עלות=0, כל התשלום=רווח |
| CRM | `crm_contacts` | יתרות מצטברות |

---

## 6. סכמת DB

### `erp_sales`
שדה קריטי: **`cost_price`** (בסיס לחישוב רווח).
קשרים: `item_id → inventory`, `buyer_id → crm_contacts`.

### `erp_payments`
ספר חשבונות אחיד. שדות: `entity_id`, `entity_type` (`'sale'|'investment'`), `amount`, `direction` (`incoming|outgoing`).
חוק סימן: incoming=+, outgoing=−.

### `erp_profit_ledger`
Append-only. כל payment מסווג: `COST_RECOVERY` או `PROFIT`.
נכתב רק ע"י `rebuild_sale_ledger(uuid)` — SECURITY DEFINER. לעולם לא מאפליקציה.

### `erp_investments`
פרויקטי כתיבה. תשלומים דרך `erp_payments (entity_type='investment')`.
לא נכנסים ל-`erp_profit_ledger` — הלג'ר הוא sale-only.

### `inventory`
יחידות SKU. סטטוס: `available/in_use/reserved/sold/נמכר`.

### `crm_contacts`
360 פרופילים — לקוחות, סופרים, סוחרים.

### `erp_torah_projects` + `erp_torah_sheets`
גריד 62 תאים. אם לא מוגרן — spec בלבד, אל תמציא טבלאות.

### טבלאות קיימות ב-Supabase:
`user_settings, audience, scribes, inventory, customers, broadcast_logs,`
`email_contacts, email_campaigns, email_logs, crm_contacts, crm_transactions,`
`crm_documents, crm_communication_logs, broadcast_queue, sys_settings,`
`sys_dropdowns, sys_calculator_config, erp_sales, erp_expenses, erp_investments,`
`erp_payments, market_torah_books, sys_logs, sys_ignored_emails,`
`erp_profit_ledger, crm_sofer_profiles, crm_contact_history`

---

## 7. אלגוריתם רווח (cost-recovery — PostgreSQL בלבד)

```
cost = erp_sales.cost_price (COALESCE → 0)
payments ordered by payment_date, created_at
running_total = 0

for each payment:
  signed = (direction='outgoing' ? -1 : +1) * amount
  if running_total >= cost       → כל signed = PROFIT
  if running_total+signed <= cost → כל signed = COST_RECOVERY
  else (חוצה את קו העלות)        → split:
      cost_left = cost - running_total → COST_RECOVERY
      signed - cost_left              → PROFIT
  running_total += signed

תיווך: cost=0 → כל תשלום = PROFIT מיידי
```

---

## 8. Views

| View | מטרה |
|------|------|
| `sale_profit_view` | Per-sale: מחיר, עלות, שולם (signed), רווח מומש |
| `monthly_realized_profit_view` | Per-user per-month: total_profit, cost_recovery, cash_flow |

---

## 9. crm.logic.ts — API נוכחי

**`getDealFinancials(entity)`** → `{ totalCost, totalPaid, remainingBalance }`
- totalCost = total_price ?? (unit_price × max(1, floor(quantity)))
- remainingBalance = max(0, totalCost - totalPaid)

**`computeSaleProfit(input)`** → `{ paperMargin, realizedRecovery }`
- תיווך → cost=0, paperMargin=total_price, realizedRecovery=total_paid (capped)
- אחר → cost=cost_price, realizedRecovery מתחיל אחרי כיסוי עלות

---

## 10. יעד ארכיטקטוני הבא

מיגרציה הדרגתית לטבלת **`ledger_entries` מאוחדת**:
- כיום: תשלומים קשורים לישויות ספציפיות (sale/investment)
- יעד: לג'ר מרכזי לכל תנועה (IN/OUT) עם קישור למקור
- כלל: additive בלבד — לא לשבור מבנה קיים תוך כדי מיגרציה

---

## 11. קבצים חשובים

```
src/services/crm.logic.ts         ← כל החישובים הפיננסיים (pure)
src/services/crm.logic.test.ts    ← 57 בדיקות
src/services/crm.service.ts       ← אורקסטרטור
src/lib/supabase/                 ← client / server / admin
lib/inventory/status.ts           ← סטטוסים + תוויות עברית
lib/upload.ts                     ← העלאת קבצים (MIME detection, mobile)
lib/sku.ts                        ← יצירת SKU
app/api/cron/process-broadcasts/  ← Cron יומי
supabase/migrations/              ← כל ה-DDL
ARCHITECTURE.md                   ← סכמה + אלגוריתם מפורט
ENGINEERING_QA_PROTOCOL.md        ← QA + פיתוח בטוח (חובה לסוכני AI)
CODEX.md / ANTIGRAVITY.md         ← מצביעים ל-Codex / Antigravity
.codex/README.md                  ← הנחיות תחת .codex (OpenAI Codex)
.cursor/rules/*.mdc               ← כללי Cursor (כולל QA)
docs/AI_AGENT_PATHS.md            ← טבלת נתיבים לסוכנים
```

---

## 12. פקודות

```bash
npm test              # חובה אחרי כל שינוי לוגי
npm run dev           # dev server
npm run build         # production build
npm run lint          # ESLint
npm run db:apply-view # Apply sale_profit_view
```

---

## 13. MCP זמין — השתמש לפני CLI

| MCP | שימוש | חיסכון טוקנים |
|-----|-------|---------------|
| **Supabase MCP** | execute_sql, apply_migration, list_tables, get_logs | גבוה — קרא DB ישירות במקום לנחש מקבצי migration |
| **Vercel MCP** | list_deployments, get_deployment, get_runtime_logs | בינוני — בדיקת builds/errors בלי `gh` |
| **Playwright MCP** | browser screenshots, DOM inspection, visual QA | גבוה — ראה UI ישירות במקום לנחש מהקוד |

### הפעלת Playwright MCP
מוגדר אוטומטית ב-`.claude/settings.json`. לוודא שהחבילה מותקנת:
```bash
npx @playwright/mcp@latest --version
```

---

## 13.5. Slash Commands (Skills) זמינים

| פקודה | מטרה |
|-------|-------|
| `/deploy-check` | בדיקת Vercel deployment אחרי push — סטטוס, URL, שגיאות |
| `/db-safe` | בדיקת בטיחות לפני migration — מבנה טבלה, כמות שורות, FK |
| `/lint-fix` | הרצת lint, תיקון אוטומטי, דיווח על מה שנשאר ידני |

---

## 14. env vars

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXT_PUBLIC_APP_URL
CRON_SECRET
```
