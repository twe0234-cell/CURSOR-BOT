# CLAUDE.md — STaM ERP (Broadcast Buddy)

Source of truth for Claude Code. Read before touching any file.

---

## 1. What this system is

A **multi-tenant ERP** for STaM (סת"ם) dealers and soferim.
It manages the full lifecycle:
**Scribe commission (investment) → Inventory (SKU) → Sale → Payments → Realized profit**

Domain is Hebrew. UI is RTL. Currency is ₪ (ILS). Users are religious-market dealers.

---

## 2. Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Database | Supabase (PostgreSQL + Auth + RLS + Storage) |
| Hosting | Vercel (+ daily cron `/api/cron/process-broadcasts` at 00:00) |
| UI | Tailwind CSS v4, Shadcn UI, Framer Motion, RTL Hebrew |
| Forms | react-hook-form + Zod v4 |
| Tests | Vitest (`npm test` = `vitest run`) |
| Email | Gmail OAuth (googleapis) |
| WhatsApp | Green API |

---

## 3. Architectural rules (non-negotiable)

### 3.1 Layer ownership

| Layer | Location | Rule |
|-------|----------|------|
| **Pure logic** | `src/services/crm.logic.ts` | No I/O. No Supabase. Synchronous. Fully testable. |
| **Service** | `src/services/crm.service.ts` | Orchestrator only. Calls Supabase + logic. No calculations. |
| **Mutations** | `app/**/actions.ts` | Server Actions. Zod validation. Calls service. Calls `revalidatePath`. |
| **Profit engine** | PostgreSQL only | `rebuild_sale_ledger()` trigger. Never reimplement in TypeScript. |

### 3.2 Financial logic rules

- **ALL financial calculations → `src/services/crm.logic.ts`**
- `crm.service.ts` is orchestrator only — zero math
- Every logic change **must be followed by `npm test`**
- Never reimplement profit logic in TypeScript — read from DB views/ledger

### 3.3 Database rules

- RLS enforces tenant isolation: every query scoped to `auth.uid() = user_id`
- Migrations live in `supabase/migrations/` — additive only, no destructive changes without explicit instruction
- Profit ledger (`erp_profit_ledger`) is append-only, written only by `SECURITY DEFINER` functions
- `entity_id` in the ledger always refers to `erp_sales.id`, never inventory

---

## 4. Database schema (core)

### `erp_sales`
Sale record. Key financial field: **`cost_price`** (basis for cost-recovery).
Links: `item_id → inventory`, `buyer_id → crm_contacts`.

### `erp_payments`
Unified cash ledger. Fields: `entity_id`, `entity_type` (`'sale' | 'investment'`), `amount`, `direction` (`incoming | outgoing`).
Signed rule: incoming = +, outgoing = −.

### `erp_profit_ledger`
Derived, append-only. Each payment slice is `COST_RECOVERY` or `PROFIT`.
Written only by `rebuild_sale_ledger(p_entity_id uuid)` — never from app code.

### `erp_investments`
Scribe writing projects. Payments via `erp_payments (entity_type='investment')`.
Not included in profit ledger (ledger is sale-only).

### `inventory`
SKU units. Status: `available / in_use / reserved / sold / נמכר`.
Partial sales decrement `quantity`; at 0 → sold.

### `crm_contacts`
360 profiles: customers, soferim, traders.

### `erp_torah_projects` + `erp_torah_sheets`
Torah project parent (62 sheets grid). If not yet migrated → product spec only, do not invent tables.

---

## 5. Profit calculation algorithm (cost-recovery)

Runs in PostgreSQL via `rebuild_sale_ledger(sale_id)`. **Do not reimplement.**

```
cost = erp_sales.cost_price (COALESCE → 0)
payments ordered by payment_date, created_at
running total starts at 0

for each payment:
  signed = (direction='outgoing' ? -1 : +1) * amount
  if total_before >= cost       → all PROFIT
  if total_after  <= cost       → all COST_RECOVERY
  else (crosses cost line)      → split:
      cost_left = cost - total_before  → COST_RECOVERY
      signed - cost_left               → PROFIT
  total_before = total_after
```

**Brokerage rule (`sale_type = 'תיווך'`):** cost = 0, so all payments are PROFIT.

---

## 6. Views

| View | Purpose |
|------|---------|
| `sale_profit_view` | Per-sale: price, cost, total_paid (signed), realized profit |
| `monthly_realized_profit_view` | Per-user per-month: total_profit, total_cost_recovery, total_cash_flow |

---

## 7. Key files

```
src/services/crm.logic.ts         ← All financial math (pure)
src/services/crm.logic.test.ts    ← Tests for above (50+ tests)
src/services/crm.service.ts       ← Orchestrator (Supabase + auth)
src/services/crm.service.test.ts  ← Service tests
src/lib/supabase/                 ← client / server / admin instances
src/lib/errors.ts                 ← Error utilities
lib/inventory/status.ts           ← Status constants + Hebrew labels
lib/sku.ts                        ← SKU generation
lib/logger.ts                     ← Logging
app/api/cron/process-broadcasts/  ← Daily email cron
supabase/migrations/              ← All DDL (source of truth for schema)
ARCHITECTURE.md                   ← Full schema + profit algorithm detail
```

---

## 8. Commands

```bash
npm test          # Run all tests (vitest run) — mandatory after any logic change
npm run dev       # Local dev server
npm run build     # Production build
npm run lint      # ESLint
npm run db:apply-view   # Apply sale_profit_view migration
```

---

## 9. Workflow rules for Claude Code

1. **Logic change?** → edit `crm.logic.ts` → run `npm test` → only then proceed.
2. **New financial calculation?** → it goes in `crm.logic.ts` with a matching test.
3. **Supabase schema change?** → write a migration file in `supabase/migrations/`, additive only.
4. **Never call Supabase from components directly** — go through Server Actions.
5. **Hebrew strings in UI** — match existing tone (professional, concise, no emojis unless already present).
6. **RLS** — every INSERT/UPDATE must include `user_id` or rely on `auth.uid()` default.
7. **Profit reporting** — always read from `erp_profit_ledger` / views. Never compute in TypeScript.

---

## 10. Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL              # optional, for migrations
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXT_PUBLIC_APP_URL
CRON_SECRET
```
