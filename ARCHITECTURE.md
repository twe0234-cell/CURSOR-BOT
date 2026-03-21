# STaM ERP — System Architecture

This document is the **source of truth** for how the application is structured, how data flows, and where business rules live. It complements `.cursorrules` with concrete schema and algorithm detail.

---

## 1. High-level architecture

| Layer | Responsibility |
|--------|------------------|
| **Next.js App Router** | Server Components for data reads; Client Components for interactivity only. |
| **Server Actions** | All mutations (`app/**/actions.ts`, shared `lib/**`). Zod validation at boundaries. |
| **Supabase** | PostgreSQL + Auth + Storage. **RLS** enforces tenant isolation (`user_id` / `auth.uid()`). |
| **Profit & cash recognition** | **PostgreSQL only** — ledger table, rebuild function, trigger on payments. **Not** in Next.js. |

---

## 2. Tech stack (expanded)

- **Framework:** Next.js 14+ (App Router), React, TypeScript (strict).
- **Data:** Supabase client (anon + cookie session on server); service role only in controlled scripts/server contexts where required.
- **UI:** Tailwind CSS, Shadcn UI, Framer Motion; RTL Hebrew UI.
- **Charts:** Recharts (dashboards).
- **Validation:** Zod for forms and action payloads.

---

## 3. Database schema (core ERP)

Values below reflect migrations under `supabase/migrations/`. Some columns evolved across migrations; this is the **conceptual** model agents should use.

### 3.1 `inventory`

- **Purpose:** SKU-level stock units (mezuzot, tefillin components, etc.).
- **Key fields:** `id`, `user_id`, `sku`, `product_category`, `quantity`, `cost_price` / `total_cost`, `total_target_price`, `status`, `images`, `category_meta`, scribe fields, `is_public`, `public_slug`, etc.
- **Status (DB):** Typically English keys (`available`, `in_use`, `reserved`, `sold`, `נמכר`) with **Hebrew labels** in UI (`lib/inventory/status.ts`). Product rules in `.cursorrules` refer to user-facing statuses (`זמין`, `בהגהה`, `נמכר`).
- **Sales impact:** Partial sales decrement `quantity`; when `quantity === 0`, status moves to sold (e.g. `נמכר`).

### 3.2 `erp_sales`

- **Purpose:** A sale line linking to inventory (`item_id`), buyer (`buyer_id` → `crm_contacts`), pricing, and **cost basis** for profit.
- **Key fields:** `id`, `user_id`, `item_id`, `sale_price`, **`cost_price`** (basis for cost recovery), `quantity`, `sale_date`, `profit`, commission fields, etc.
- **Joins:** `erp_sales.id` is the **entity** for sale-scoped payments in `erp_payments`.

### 3.3 `erp_payments`

- **Purpose:** **Single ledger** for cash flow (installments, direction, method).
- **Key fields:** `id`, `user_id`, **`entity_id`**, **`entity_type`** (`'sale' | 'investment'`), `amount` (> 0), `payment_date`, `direction` (`incoming` | `outgoing`), `method`, `notes`, `created_at`.
- **Signed cash flow:** Application views and DB profit logic treat **incoming** as positive and **outgoing** as negative when summing.

### 3.4 `erp_profit_ledger` (cash-basis profit engine)

- **Purpose:** Append-only **derived** facts per sale: each slice of each payment is classified **`COST_RECOVERY`** or **`PROFIT`**.
- **Key fields:** `id`, **`entity_id` → `erp_sales.id`**, `user_id`, `payment_id` → `erp_payments`, `amount` (signed), `ledger_type`, `entry_date`, `created_at`.
- **RLS:** `SELECT` for `auth.uid() = user_id`. Writes are performed only by **`SECURITY DEFINER`** functions (not from the app).

### 3.5 `crm_contacts`

- **Purpose:** CRM “360” profiles — customers, soferim, traders; notes, history, links to sales/investments.
- **Key fields:** `id`, `user_id`, `name`, `role`, contact fields, balances, notes, advanced fields from later migrations.

### 3.6 `erp_investments`

- **Purpose:** Writing projects (scribes), payments vs `total_agreed_price`, status (`active`, `completed`, `delivered_to_inventory`, etc.).
- **Payments:** `erp_payments` with `entity_type = 'investment'` — **not** included in `erp_profit_ledger` (ledger is **sale**-only).

### 3.7 Storage (`storage.buckets`)

- **`media`** — public bucket for inventory images; RLS policies on `storage.objects` for `authenticated` / `anon` as per `033_storage_media_rls_policies.sql`.

### 3.8 Torah projects (domain rule)

Per `.cursorrules`: **`erp_torah_projects`** (parent) and **62 × `erp_torah_sheets`** (child), visual 62-cell grid. **If not yet migrated**, treat as product spec for future schema; do not invent tables without a migration.

---

## 4. Views

| View | Role |
|------|------|
| **`sale_profit_view`** | Per-sale **dynamic** line: price, cost, total paid (signed payments), **realized profit** as “amount − cost” style (see migration `031_sale_profit_view.sql`). |
| **`monthly_realized_profit_view`** | Per-**user**, per-**month** aggregates from **`erp_profit_ledger`**: `total_profit`, `total_cost_recovery`, `total_cash_flow`. Used by the dashboard cash P&L card. |

---

## 5. Triggers & functions (profit)

| Object | Behavior |
|--------|-----------|
| **`rebuild_sale_ledger(p_entity_id uuid)`** | Deletes `erp_profit_ledger` rows for that **`erp_sales.id`**, recomputes from **`erp_payments`** (`entity_type = 'sale'`, chronological order). Reads **`erp_sales.cost_price`**. **SECURITY DEFINER**. |
| **`trigger_rebuild_ledger` + `trg_payments_ledger`** | **AFTER INSERT OR UPDATE OR DELETE** on **`erp_payments`**: rebuilds affected sale(s) only when `entity_type = 'sale'`. |

**Important:** `entity_id` in the ledger is **always** a **sale id**, not an inventory row id.

---

## 6. Profit calculation algorithm (cost recovery model)

**Premise:** Profit is recognized **only in cash basis** and **only after** cumulative net payments toward a sale cover **`erp_sales.cost_price`**.

**Inputs:**

- `v_sale_cost = COALESCE(erp_sales.cost_price, 0)` for the sale `p_entity_id`.
- Payments for that sale: `erp_payments` where `entity_id = p_entity_id` and `entity_type = 'sale'`, ordered by `payment_date`, then `created_at`.

**Per payment, signed amount:**

```text
signed = (direction == 'outgoing' ? -1 : +1) * amount
```

**Running total:** `total_paid_before` starts at `0`. After each payment, `total_paid_after = total_paid_before + signed`.

**Classification for each payment:**

1. If **`total_paid_before >= v_sale_cost`** → entire **`signed`** is **`PROFIT`** (including negative signed amounts as negative profit).
2. Else if **`total_paid_after <= v_sale_cost`** → entire **`signed`** is **`COST_RECOVERY`**.
3. Else (**crossing the cost line**): split into:
   - **`v_cost_left = v_sale_cost - total_paid_before`** → **`COST_RECOVERY`**
   - **`signed - v_cost_left`** → **`PROFIT`**

Then set `total_paid_before := total_paid_after` and continue.

**Ledger rows:** One or two inserts per payment (split case), with `entry_date` from `payment_date`.

**Monthly reporting:** `monthly_realized_profit_view` sums ledger amounts by month and `user_id`.

---

## 7. Application boundaries

- **Do not** reimplement profit allocation in TypeScript for reporting; **read** `erp_profit_ledger` / `monthly_realized_profit_view` / `sale_profit_view`.
- **Do** put all mutations in **Server Actions** with Zod and RLS-safe queries.
- **Do** keep Hebrew UI and brand palette per `.cursorrules`.

---

## 8. Operational notes

- **Migrations:** Apply via Supabase CLI, Dashboard SQL, or repo scripts (e.g. `scripts/apply-ledger.mjs`) when direct `DATABASE_URL` is available.
- **Regression:** Prefer additive migrations and diagnose root causes (RLS, missing policies, env) before reverting features.
