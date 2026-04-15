# ENGINEERING QA & BUG PREVENTION PROTOCOL

## For AI Coding Agents (Cursor / Claude / Codex)

You are working on a **live financial + workflow production system** (הידור הסת"ם — Broadcast Buddy).

Bugs here = real money loss, broken operations, and data corruption.

This document defines **MANDATORY rules**.

You are **NOT** allowed to bypass them. They complement and do not replace [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), and [ARCHITECTURE.md](ARCHITECTURE.md).

**Tool entry points:** [CODEX.md](CODEX.md), [ANTIGRAVITY.md](ANTIGRAVITY.md), [.codex/README.md](.codex/README.md), and [docs/AI_AGENT_PATHS.md](docs/AI_AGENT_PATHS.md).

---

## 0. PRIME DIRECTIVE

> **Every change must be safe, traceable, reversible, and fully validated.**

If you are not 100% confident — **STOP** and surface risks.

**Alignment with this repo:** financial truth for sales stays in PostgreSQL (`rebuild_sale_ledger`, `erp_profit_ledger`); pure math in `crm.logic.ts`; ZERO UI MATH; tests after logic changes (`npm test`).

---

## 1. KNOWN CRITICAL FAILURE TYPES (MUST PREVENT)

### 1.1 State Machine Corruption

- Invalid transitions (e.g. skipping stages)
- Double transitions (same event twice)
- Out-of-order flow (fix before hagaha)

**Prevention:**

- Enforce strict state enums (see `torah_sheets.status`, `market_stage`, etc.)
- Add transition guards:

```pseudo
if (!isValidTransition(from, to)) → THROW ERROR
```

### 1.2 Financial Drift (Silent Money Bugs)

- Missing ledger entries
- Double charges
- Incorrect deductions (sofer fixes)
- Currency mismatch

**Prevention:**

- Every financial action MUST follow the existing ledger / payment model (see CLAUDE § profit engine)
- Prefer append-only patterns; never “edit away” history without migration + audit
- Invariants where applicable:

```pseudo
sum(ledger) == computed_balance  // conceptually; implement per domain rules
```

### 1.3 Partial Transaction Failures

Example:

- Status updated but payment failed
- Batch created but sheet not linked

**Prevention:**

- Prefer **atomic** DB operations: `BEGIN … COMMIT`, or a single RPC/transaction from the service layer
- If any step fails → **ROLLBACK**; never leave half-updated business state without a compensating record

### 1.4 Concurrency Bugs

- Double barcode scan
- Two users updating same entity
- Race conditions on payments

**Prevention:**

- Idempotency keys where external systems retry (webhooks, payments)
- Unique constraints + upsert patterns where appropriate
- Optimistic locking or “single writer” rules for hot rows

### 1.5 Data Integrity Violations

- Orphan records
- Broken relations
- Missing foreign keys

**Prevention:**

- Enforce FK constraints in Postgres (already the default here)
- Validate IDs and ownership (`user_id`, RLS) before insert/update

### 1.6 Workflow Desync

- Sheet status ≠ batch / QA reality
- Fix done but not reflected
- Hagaha count mismatch

**Prevention:**

- Derived summaries should come from **queries or pure functions** (`crm.logic.ts`), not duplicated ad-hoc in UI
- Add consistency checks when introducing new workflow tables

### 1.7 SLA / Time Calculation Bugs

- Wrong delay detection
- Wrong estimated completion

**Prevention:**

- Prefer **server** time and explicit time zones for business rules
- Avoid trusting client-only clocks for money or SLA
- Recompute when inputs change (pure helpers + single source)

### 1.8 File / Evidence Loss

- Missing hagaha reports
- Broken file links

**Prevention:**

- Confirm upload success (Storage) before persisting URL
- Validate MIME/size where applicable (`lib/upload.ts` patterns)

---

## 2. MANDATORY QA CHECKS AFTER EVERY CHANGE

Execute **all** that apply to the touched domain:

### 2.1 Flow Simulation (End-to-End)

For workflow features, mentally (or with tests) walk through:

1. Scribe / project progress
2. Receive / barcode (if relevant)
3. Payment / ledger
4. Batch / QA send
5. Return with issues
6. Fix + deduction
7. Re-enter workflow
8. Final approval

If any step breaks → fix before merging.

### 2.2 Financial Integrity Check

Verify against domain rules:

```pseudo
project_cashflow == income - expenses   // per definitions in crm.logic / DB
sofer_balance == earned - paid - fixes   // as defined for that module
```

Edge cases: multiple fixes, partial payments, delayed income.

### 2.3 State Consistency Check

Per entity (e.g. Torah sheet):

```pseudo
status matches workflow stage
hagaha_count <= contract_limit   // when modeled
```

### 2.4 Batch Integrity Check

- All sheets in batch exist
- No duplicate sheet in multiple **active** batches (unless explicitly allowed)
- Batch status aligns with member rows

### 2.5 Regression Check

- APIs / server actions still return expected shapes
- Avoid breaking schema changes without migration + backfill plan
- Old rows remain readable

### 2.6 Edge Case Simulation

Simulate where relevant:

- Double scan / double webhook
- Missing QA return
- Fix after “final” (if allowed by product)
- Payment before receive
- Minimal batch (single item)

---

## 3. SECURITY REQUIREMENTS

### 3.1 Access Control

- External roles (future: sofer / client portals) must not see internal pricing/costs unless product allows
- Enforce **RLS** and `user_id` scoping (already central in this app)

### 3.2 Input Validation

- Reject invalid UUIDs / out-of-range numbers
- Zod on server actions; sanitize strings that hit DB or logs

### 3.3 Financial Protection

- No negative amounts unless domain explicitly allows
- Guard against duplicate payment inserts (constraints / idempotency)

### 3.4 File Security

- Validate file type and size
- Storage paths and signed URLs per existing bucket policies

---

## 4. SAFE DEVELOPMENT RULES

### 4.1 No Direct Mutation of History

- Do not overwrite audit / ledger history; add corrective entries or new rows

### 4.2 Additive Changes Only (Default)

- Extend schema with new columns/tables
- Destructive migrations only with explicit plan, backup, and rollout notes

### 4.3 Feature Flags (If Possible)

- Wrap risky behavior behind flags or gradual rollout when the stack allows

### 4.4 Logging (Critical Actions)

Prefer structured logs / `sys_logs` for:

```json
{
  "action": "...",
  "entity_id": "...",
  "before": {},
  "after": {},
  "timestamp": "..."
}
```

(Where the codebase already uses logging patterns — follow them.)

---

## 5. DEBUGGING PROTOCOL (DEEP LEVEL)

After non-trivial implementation:

### Step 1: Trace Execution Graph

- Server action → service → DB writes
- Webhooks: idempotency and duplicate delivery

### Step 2: Detect Silent Failures

- Missing triggers / skipped branches
- Counters that can drift from truth

### Step 3: Validate Invariants

Examples (adapt to feature):

```pseudo
sheet.status != APPROVED if fixes_pending
batch.status == SENT → date_sent exists
```

### Step 4: Stress Test Logic

- Many rows, multiple batches, concurrent updates (where applicable)

### Step 5: Output Report (in PR / summary to user)

- What was tested
- What failed and how it was fixed
- Assumptions and **remaining risks**

---

## 6. HARD STOP CONDITIONS

**STOP** and report if:

- Financial inconsistency is possible or observed
- State machine rules are ambiguous
- Data loss or corruption risk is identified
- Flow correctness is uncertain

---

## FINAL RULE

> You are not a code generator.  
> You are a **production system guardian**.

**Correctness > speed**  
**Safety > completeness**  
**Consistency > creativity**

Failure to follow these rules risks **system corruption** and real-world harm.
