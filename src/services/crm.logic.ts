/**
 * Pure business-logic utilities for the CRM / ERP financial calculations.
 * No I/O, no Supabase — all functions are synchronous and fully testable.
 *
 * Exported separately from crm.service.ts so server-only imports (createClient,
 * next/headers, etc.) never leak into pure-logic test files.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// classifyDealBalance — pending vs. delivered commitment
// (declared first so getDealFinancials can call it without a forward reference)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Statuses that indicate a deal has been delivered / completed.
 * Any other status (including null / undefined) means work is in progress → future commitment.
 *
 * Hebrew additions:
 *   "הושלם"  = completed
 *   "במלאי"  = in inventory (delivered)
 *   "נמסר"   = handed over
 *   "נמכר"   = sold
 */
const DELIVERED_STATUSES = new Set([
  // English canonical
  "completed",
  "delivered_to_inventory",
  "delivered",
  "sold",
  // Hebrew
  "הושלם",
  "במלאי",
  "נמסר",
  "נמכר",
]);

/** Returns true when the investment or market item has been delivered. */
export function isDealDelivered(status: string | null | undefined): boolean {
  if (!status) return false;
  return DELIVERED_STATUSES.has(status);
}

export type DealBalanceClass = "actual_debt" | "future_commitment" | "settled";

/**
 * Classifies a deal's remaining balance:
 *   - "actual_debt"       — work done, money is owed now.
 *   - "future_commitment" — work in progress, money reserved for later.
 *   - "settled"           — no remaining balance.
 */
export function classifyDealBalance(
  remainingBalance: number,
  status: string | null | undefined
): DealBalanceClass {
  if (remainingBalance <= 0) return "settled";
  return isDealDelivered(status) ? "actual_debt" : "future_commitment";
}

// ─────────────────────────────────────────────────────────────────────────────
// getDealFinancials
// ─────────────────────────────────────────────────────────────────────────────

export type DealEntity = {
  /** For investments: number of items commissioned. For sales: quantity sold. */
  quantity?: number | null;
  /**
   * Per-unit price.
   * Investments → cost_per_unit.
   * Sales       → sale_price (unit price).
   * Used only when total_price is absent.
   */
  unit_price?: number | null;
  /**
   * Pre-computed total deal amount.
   * Investments → total_agreed_price.
   * Sales       → total_price.
   * Takes priority over quantity × unit_price.
   */
  total_price?: number | null;
  /** Total amount already paid toward this deal. */
  amount_paid?: number | null;
  /**
   * Entity lifecycle status (e.g. "active", "completed", "הושלם", "בכתיבה").
   * Used to classify the remaining balance as `actual_debt` or `future_commitment`.
   * When omitted the balance defaults to `future_commitment` (conservative).
   */
  status?: string | null;
};

export type DealFinancials = {
  /** The total deal cost / agreed price. */
  totalCost: number;
  /** Total amount paid so far. */
  totalPaid: number;
  /**
   * Outstanding balance, clamped to ≥ 0.
   * Equal to actual_debt + future_commitment.
   */
  remainingBalance: number;
  /**
   * Portion of remainingBalance that is due NOW:
   * work is done / item delivered, money not yet paid.
   * Displayed in red in the UI.
   */
  actual_debt: number;
  /**
   * Portion of remainingBalance that is reserved for future payment:
   * work is still in progress (בכתיבה / בתהליך / active).
   * Displayed in a neutral color (yellow/gray) in the UI.
   */
  future_commitment: number;
};

/**
 * Pure utility. Calculates financial totals for any investment or sale entity.
 *
 * Calculation priority:
 *   totalCost    = total_price ?? (unit_price × max(1, floor(quantity)))
 *   totalPaid    = amount_paid (defaults to 0)
 *   remainingBalance = max(0, totalCost - totalPaid)
 *
 * Balance classification (requires `status`):
 *   actual_debt       — remainingBalance when status ∈ DELIVERED_STATUSES
 *   future_commitment — remainingBalance when status is pending / in-progress / unknown
 *
 * Safe to call with null / undefined fields — all default to 0.
 * When `status` is omitted the balance is conservatively classified as future_commitment.
 */
export function getDealFinancials(entity: DealEntity): DealFinancials {
  const qty = Math.max(1, Math.floor(Number(entity.quantity ?? 1)));
  const unitPrice = Number(entity.unit_price ?? 0);

  const totalCost =
    entity.total_price != null
      ? Number(entity.total_price)
      : unitPrice * qty;

  const totalPaid = Number(entity.amount_paid ?? 0);
  const remainingBalance = Math.max(0, totalCost - totalPaid);

  const cls = classifyDealBalance(remainingBalance, entity.status);
  const actual_debt = cls === "actual_debt" ? remainingBalance : 0;
  const future_commitment = cls === "future_commitment" ? remainingBalance : 0;

  return { totalCost, totalPaid, remainingBalance, actual_debt, future_commitment };
}

// ─────────────────────────────────────────────────────────────────────────────
// SaleProfitInput / computeSaleProfit
// ─────────────────────────────────────────────────────────────────────────────

export type SaleProfitInput = {
  /**
   * Deal type (e.g. "תיווך", "ממלאי", "פרויקט חדש").
   * For brokerage deals (תיווך) the underlying cost is zero, so realized
   * profit must equal paper profit when the deal is fully paid.
   */
  sale_type?: string | null;
  /**
   * Recorded cost price from the DB.
   * - Inventory / project sales: actual cost (cpu × qty or investment total).
   * - Brokerage sales: null (no underlying asset cost).
   */
  cost_price?: number | null;
  /** Total deal price (sale_price × qty, or total_price). */
  total_price: number;
  /** Total amount received so far (amount_paid + ledger payments). */
  total_paid: number;
};

export type SaleProfitOutput = {
  /**
   * Maximum realizable profit: total_price − cost (i.e. if 100 % is collected).
   * null when cost is unknown (non-brokerage deal with no cost_price).
   */
  paperMargin: number | null;
  /**
   * Profit recognized so far, based on cost-recovery method:
   *   - 0 while total_paid ≤ cost (recovering sunk cost first).
   *   - total_paid − cost once payments exceed cost, capped at paperMargin.
   * null when cost cannot be determined (non-brokerage, cost_price missing).
   */
  realizedRecovery: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// computeSaleProfit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure utility. Computes paper margin and cost-recovery realized profit for a
 * single sale record.
 *
 * Brokerage rule: when sale_type === "תיווך" (or cost_price is explicitly 0),
 * the underlying asset has no acquisition cost, so every collected shekel is
 * profit. A fully-paid brokerage deal therefore has realizedRecovery === total_price.
 */
export function computeSaleProfit(input: SaleProfitInput): SaleProfitOutput {
  const saleType = input.sale_type ?? "ממלאי";

  // For brokerage deals cost is 0 even when cost_price is null in the DB.
  const cost =
    input.cost_price != null
      ? Number(input.cost_price)
      : saleType === "תיווך"
        ? 0
        : null;

  const paperMargin =
    cost != null ? Math.max(0, input.total_price - cost) : null;

  let realizedRecovery: number | null = null;
  if (cost != null) {
    if (input.total_paid > cost) {
      realizedRecovery = Math.min(
        input.total_paid - cost,
        paperMargin ?? Number.POSITIVE_INFINITY
      );
    } else {
      realizedRecovery = 0;
    }
  }

  return { paperMargin, realizedRecovery };
}

// ─────────────────────────────────────────────────────────────────────────────
// DealType — canonical four-way deal classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical deal types for "Hidur HaSTaM" ERP.
 *
 *  brokerage_direct  — broker only; no cash flows through us. We register
 *                       commission income only. Buyer ↔ supplier deal is external.
 *  brokerage_managed — full sale price flows through us. We pay supplier from
 *                       proceeds. Profit recognized only after supplier cost covered.
 *  inventory_sale    — item sold from own inventory. Cost is known at time of sale.
 *  long_term_project — scribe commission (Torah, Tefillin…). Same profit math as
 *                       inventory_sale; remaining balance classified as
 *                       actual_debt / future_commitment via classifyDealBalance.
 */
export type DealType =
  | "brokerage_direct"
  | "brokerage_managed"
  | "inventory_sale"
  | "long_term_project";

const DEAL_TYPE_MAP: Record<string, DealType> = {
  // Hebrew legacy strings
  "תיווך": "brokerage_direct",
  "פרויקט חדש": "long_term_project",
  "ממלאי": "inventory_sale",
  // Canonical English pass-through
  brokerage_direct: "brokerage_direct",
  brokerage_managed: "brokerage_managed",
  inventory_sale: "inventory_sale",
  long_term_project: "long_term_project",
};

/**
 * Maps a raw sale_type string (Hebrew or canonical English) to a DealType.
 * Unknown or empty values default to "inventory_sale".
 */
export function normalizeDealType(saleType: string | null | undefined): DealType {
  const t = (saleType ?? "").trim();
  return DEAL_TYPE_MAP[t] ?? "inventory_sale";
}

// ─────────────────────────────────────────────────────────────────────────────
// computeDealFinancialsByType
// ─────────────────────────────────────────────────────────────────────────────

export type ExtendedSaleProfitInput = {
  deal_type: DealType;
  /** Agreed sale price (full deal value). */
  total_price: number;
  /** Total received from buyer so far. */
  total_paid: number;
  /** Supplier / inventory acquisition cost. Required for inventory_sale, brokerage_managed, long_term_project. */
  cost_price?: number | null;
  /** Fixed commission for brokerage_direct. Falls back to total_price when absent. */
  commission_amount?: number | null;
};

export type ExtendedSaleProfitOutput = {
  /** Maximum realizable profit if fully collected. Null when cost is unknown. */
  paperMargin: number | null;
  /** Profit recognized to date via cost-recovery method. Null when cost unknown. */
  realizedRecovery: number | null;
  /** Commission earned (brokerage_direct only; null for all other deal types). */
  commissionRevenue: number | null;
  /**
   * Accounts Receivable: amount the buyer still owes us, clamped ≥ 0.
   * Always 0 for brokerage_direct (buyer pays supplier directly).
   */
  systemDebt: number;
  /**
   * Accounts Payable to supplier, clamped ≥ 0.
   * 0 for inventory_sale (item already owned) and brokerage_direct.
   * For brokerage_managed, supplier debt is tracked on erp_investments / erp_payments
   * and is NOT duplicated here — caller must aggregate separately.
   */
  supplierDebt: number;
};

/**
 * Core deal financial engine. Computes all financial positions for a single deal
 * based on its canonical DealType.
 *
 * Rules per type:
 *
 *  brokerage_direct:
 *    No cash flows through the system. systemDebt = 0.
 *    commissionRevenue = commission_amount ?? total_price.
 *    realizedRecovery = total_paid (capped at commission) once any payment arrives.
 *
 *  brokerage_managed:
 *    Full sale price flows through. Supplier paid from proceeds.
 *    Profit recognized ONLY after supplier cost is covered (cost-recovery method).
 *    systemDebt = max(0, total_price - total_paid).
 *
 *  inventory_sale / long_term_project:
 *    Standard cost-recovery. supplierDebt = 0 (item already owned or cost settled separately).
 *    Debt classification (actual_debt vs future_commitment) is delegated to classifyDealBalance.
 */
export function computeDealFinancialsByType(
  input: ExtendedSaleProfitInput
): ExtendedSaleProfitOutput {
  const { deal_type, total_price, total_paid } = input;
  const cost = input.cost_price != null ? Number(input.cost_price) : null;

  // ── brokerage_direct: no money flows through, commission only ─────────────
  if (deal_type === "brokerage_direct") {
    const commissionRevenue =
      input.commission_amount != null
        ? Number(input.commission_amount)
        : total_price;
    const paperMargin = commissionRevenue;
    const realizedRecovery =
      total_paid > 0 ? Math.min(total_paid, commissionRevenue) : 0;

    return {
      paperMargin,
      realizedRecovery,
      commissionRevenue,
      systemDebt: 0,
      supplierDebt: 0,
    };
  }

  // ── brokerage_managed: profit only after supplier cost is covered ──────────
  if (deal_type === "brokerage_managed") {
    const supplierCost = cost ?? 0;
    const paperMargin =
      cost != null ? Math.max(0, total_price - supplierCost) : null;
    const realizedRecovery: number | null =
      cost != null
        ? total_paid > supplierCost
          ? Math.min(
              total_paid - supplierCost,
              paperMargin ?? Number.POSITIVE_INFINITY
            )
          : 0
        : null;

    return {
      paperMargin,
      realizedRecovery,
      commissionRevenue: null,
      systemDebt: Math.max(0, total_price - total_paid),
      supplierDebt: 0,
    };
  }

  // ── inventory_sale / long_term_project: standard cost-recovery ────────────
  const paperMargin =
    cost != null ? Math.max(0, total_price - cost) : null;
  const realizedRecovery: number | null =
    cost != null
      ? total_paid > cost
        ? Math.min(
            total_paid - cost,
            paperMargin ?? Number.POSITIVE_INFINITY
          )
        : 0
      : null;

  return {
    paperMargin,
    realizedRecovery,
    commissionRevenue: null,
    systemDebt: Math.max(0, total_price - total_paid),
    supplierDebt: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeSaleRowDisplay — row-level totals for sale tables/cards.
// Kills the "ZERO UI MATH" violation in app/sales/SalesClient.tsx by centralizing
// the (total_price ?? sale_price × qty) / paid / balance / pct derivation.
// ─────────────────────────────────────────────────────────────────────────────

export type SaleRowInput = {
  /** Pre-computed deal total when available. */
  total_price?: number | null;
  /** Unit price fallback when total_price is absent. */
  sale_price?: number | null;
  /** Quantity fallback — floored to ≥ 1 internally. */
  quantity?: number | null;
  /** Preferred paid figure (ledger-aggregated). */
  total_paid?: number | null;
  /** Legacy single-row amount_paid, used only when total_paid is absent. */
  amount_paid_row?: number | null;
  /** Server-computed remaining balance. When present it wins over the derivation. */
  remaining_balance?: number | null;
};

export type SaleRowDisplay = {
  /** Total deal value, always finite ≥ 0. */
  totalDeal: number;
  /** Amount paid so far, always finite ≥ 0. */
  paid: number;
  /** Outstanding balance, always finite ≥ 0. */
  balance: number;
  /** Paid percentage 0..100, integer. 0 when totalDeal ≤ 0. */
  paidPct: number;
};

/**
 * Pure row-display helper for the sales list UI.
 *
 * Resolution order (SAFE TYPES: null/undefined/NaN → 0):
 *   totalDeal = total_price ?? (sale_price × max(1, floor(quantity)))
 *   paid      = total_paid ?? amount_paid_row ?? 0
 *   balance   = remaining_balance ?? max(0, totalDeal − paid)
 *   paidPct   = totalDeal > 0 ? clamp(round(paid / totalDeal × 100), 0..100) : 0
 *
 * UI MUST consume this instead of computing inline. Any change to how a sale row
 * is summarized lives here so the grid, table, and any future export agree.
 */
export function computeSaleRowDisplay(sale: SaleRowInput): SaleRowDisplay {
  const safe = (v: number | null | undefined): number => {
    const n = Number(v);
    return v == null || !Number.isFinite(n) ? 0 : n;
  };

  const qty = Math.max(1, Math.floor(safe(sale.quantity ?? 1)));
  const derivedTotal = safe(sale.sale_price) * qty;
  const totalDeal =
    sale.total_price != null ? safe(sale.total_price) : derivedTotal;

  const paid =
    sale.total_paid != null
      ? safe(sale.total_paid)
      : safe(sale.amount_paid_row);

  const balance =
    sale.remaining_balance != null
      ? Math.max(0, safe(sale.remaining_balance))
      : Math.max(0, totalDeal - paid);

  const paidPct =
    totalDeal > 0
      ? Math.min(100, Math.max(0, Math.round((paid / totalDeal) * 100)))
      : 0;

  return {
    totalDeal: Math.max(0, totalDeal),
    paid: Math.max(0, paid),
    balance,
    paidPct,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeSaleFinancialPatch — canonical financial-field derivation for erp_sales.
// Used by createSale / updateSaleDetails / updateSaleCoreDetails so every write
// site agrees on how sale_price / profit / commission_* mirror total_price.
// ─────────────────────────────────────────────────────────────────────────────

export type SaleFinancialInput = {
  /** Deal classification (after normalizeDealType). */
  deal_type: DealType;
  /** Canonical total deal value (pre-resolved by caller). */
  total_price: number;
  /** Quantity; floored to ≥ 1. Only relevant for per-unit price derivation. */
  quantity?: number | null;
  /** Underlying cost for profit calculation. Null → profit is null (unknown). */
  cost_price?: number | null;
};

export type SaleFinancialPatch = {
  total_price: number;
  sale_price: number;
  profit: number | null;
  commission_profit: number | null;
  commission_received: number | null;
  actual_commission_received: number | null;
};

/**
 * Produce the canonical financial-field patch for an erp_sales row.
 *
 * Per deal type:
 *   brokerage_direct  → every commission_* field mirrors total_price, profit
 *                       also = total_price (brokerage has no underlying cost).
 *   brokerage_managed → sale_price = total_price / qty, profit = total_price
 *                       − cost (null when cost unknown), commissions null.
 *   inventory_sale    → same as brokerage_managed.
 *   long_term_project → same as brokerage_managed.
 *
 * SAFE TYPES: non-finite inputs collapse to 0; quantity ≤ 0 is clamped to 1.
 * Callers remain responsible for writing non-math fields (buyer_id, notes…).
 */
export function computeSaleFinancialPatch(
  input: SaleFinancialInput
): SaleFinancialPatch {
  const safe = (v: number | null | undefined): number => {
    const n = Number(v);
    return v == null || !Number.isFinite(n) ? 0 : n;
  };

  const total = Math.max(0, safe(input.total_price));
  const qty = Math.max(1, Math.floor(safe(input.quantity ?? 1)));
  const cost =
    input.cost_price != null && Number.isFinite(Number(input.cost_price))
      ? Number(input.cost_price)
      : null;

  if (input.deal_type === "brokerage_direct") {
    return {
      total_price: total,
      sale_price: total,
      profit: total,
      commission_profit: total,
      commission_received: total,
      actual_commission_received: total,
    };
  }

  // brokerage_managed / inventory_sale / long_term_project
  return {
    total_price: total,
    sale_price: qty > 0 ? total / qty : total,
    profit: cost != null ? total - cost : null,
    commission_profit: null,
    commission_received: null,
    actual_commission_received: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// validatePaymentAmount — Zod-backed ledger overpayment guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zod schema for payment validation.
 * Enforces: amount > 0, total_price ≥ 0, already_paid ≥ 0,
 * and amount ≤ remaining balance (total_price − already_paid).
 */
export const PaymentAmountSchema = z
  .object({
    amount: z.number().positive({ message: "סכום חייב להיות חיובי" }),
    total_price: z
      .number()
      .nonnegative({ message: "מחיר עסקה אינו יכול להיות שלילי" }),
    already_paid: z
      .number()
      .nonnegative({ message: "סכום ששולם אינו יכול להיות שלילי" }),
  })
  .refine(
    (d) => d.amount <= Math.max(0, d.total_price - d.already_paid),
    { message: "תשלום חורג מהיתרה הנותרת", path: ["amount"] }
  );

export type PaymentAmountInput = z.infer<typeof PaymentAmountSchema>;

export type PaymentValidationResult =
  | { valid: true }
  | { valid: false; error: string };

/**
 * Validates a proposed payment amount against the remaining deal balance.
 * Returns { valid: true } or { valid: false, error } — never throws.
 *
 * Business rule: payment must be positive and must not exceed
 * (total_price − already_paid).  Overpayments are BLOCKED.
 */
export function validatePaymentAmount(input: {
  amount: number;
  total_price: number;
  already_paid: number;
}): PaymentValidationResult {
  const result = PaymentAmountSchema.safeParse(input);
  if (result.success) return { valid: true };
  return {
    valid: false,
    error: result.error.issues[0]?.message ?? "קלט לא תקין",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// calculateTorahProjectFinancials — per-column allocation (Sefer Torah)
// ─────────────────────────────────────────────────────────────────────────────

/** Sheet statuses that count completed work toward billable columns (incl. forward-compatible "delivered"). */
const TORAH_SHEET_COMPLETED_STATUSES = new Set([
  "approved",
  "sewn",
  "delivered",
]);

export type TorahProjectFinancialsResult = {
  totalColumns: number;
  pricePerColumn: number;
  completedColumns: number;
  actualDebt: number;
  futureCommitment: number;
};

/**
 * Allocates `totalAgreedPrice` evenly across all columns (sum of per-sheet
 * `columns_count`, defaulting each sheet to 4 when missing).
 * "Earned" / billable portion = completed columns × price per column;
 * remainder of the contract is treated as future commitment.
 */
export function calculateTorahProjectFinancials(
  totalAgreedPrice: number,
  sheets: { columns_count: number; status: string }[]
): TorahProjectFinancialsResult {
  const agreed = Number.isFinite(totalAgreedPrice) && totalAgreedPrice > 0 ? totalAgreedPrice : 0;

  const totalColumns = sheets.reduce(
    (sum, sheet) => sum + (sheet.columns_count || 4),
    0
  );
  const pricePerColumn = totalColumns > 0 ? agreed / totalColumns : 0;

  const completedColumns = sheets
    .filter((s) => TORAH_SHEET_COMPLETED_STATUSES.has(s.status))
    .reduce((sum, sheet) => sum + (sheet.columns_count || 4), 0);

  const actualDebt = completedColumns * pricePerColumn;
  const futureCommitment = Math.max(0, agreed - actualDebt);

  return {
    totalColumns,
    pricePerColumn,
    completedColumns,
    actualDebt,
    futureCommitment,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Torah ledger (תנועות פיננסיות בפרויקט ס״ת)
// ─────────────────────────────────────────────────────────────────────────────

export type TorahLedgerLine = {
  transaction_type: string;
  amount: number;
};

/** סכומי תשלום מלקוח / לסופר מתנועות יומן בלבד (מקור אמת). */
export function sumTorahLedgerPayments(transactions: TorahLedgerLine[]): {
  totalClientPayments: number;
  totalScribePayments: number;
} {
  let totalClientPayments = 0;
  let totalScribePayments = 0;
  for (const t of transactions) {
    const a = Number(t.amount);
    if (!Number.isFinite(a) || a < 0) continue;
    if (t.transaction_type === "client_payment") totalClientPayments += a;
    else if (t.transaction_type === "scribe_payment") totalScribePayments += a;
  }
  return { totalClientPayments, totalScribePayments };
}

/**
 * סיכומים מתנועות היומן.
 * ניכוי תיקון מקטין את "נטו תשלום לסופר" לצורך הערכת רווחיות.
 */
export function summarizeTorahLedger(transactions: TorahLedgerLine[]): {
  totalFixDeduction: number;
  totalQaExpense: number;
  totalParchmentExpense: number;
  totalOtherExpense: number;
} {
  let fix = 0;
  let qa = 0;
  let parchment = 0;
  let other = 0;
  for (const t of transactions) {
    const a = Number(t.amount);
    if (!Number.isFinite(a) || a < 0) continue;
    switch (t.transaction_type) {
      case "fix_deduction":
        fix += a;
        break;
      case "qa_expense":
        qa += a;
        break;
      case "parchment_expense":
        parchment += a;
        break;
      case "other_expense":
        other += a;
        break;
      default:
        break;
    }
  }
  return {
    totalFixDeduction: fix,
    totalQaExpense: qa,
    totalParchmentExpense: parchment,
    totalOtherExpense: other,
  };
}

/** מחפש בצילום המחשבון ערכים מספריים לתקציב קלף מתוכנן (אם קיימים). */
export function extractPlannedParchmentBudgetFromSnapshot(
  snapshot: Record<string, unknown> | null | undefined
): number {
  if (!snapshot || typeof snapshot !== "object") return 0;
  const keys = [
    "planned_parchment",
    "parchment_budget",
    "parchment_planned",
    "expected_parchment_cost",
    "parchment_cost_planned",
    "parchment_total",
  ];
  for (const k of keys) {
    const v = snapshot[k];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(String(v).replace(",", ".")) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  for (const [k, v] of Object.entries(snapshot)) {
    if (!/parchment|קלף/i.test(k)) continue;
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(String(v).replace(",", ".")) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function readPositiveNumberFromSnapshotValue(v: unknown): number {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? Number(String(v).replace(",", "."))
        : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** סכום תקציבים מתוכננים מהצילום (סופר / הגהות / שונות) בנוסף לקלף — לפי מפתחות נפוצים. */
export function extractPlannedOperationalBudgetFromSnapshot(
  snapshot: Record<string, unknown> | null | undefined
): { parchment: number; scribe: number; proofreading: number; misc: number; total: number } {
  const parchment = extractPlannedParchmentBudgetFromSnapshot(snapshot);
  if (!snapshot || typeof snapshot !== "object") {
    const base = parchment;
    return { parchment, scribe: 0, proofreading: 0, misc: 0, total: base };
  }

  const scribeKeys = [
    "planned_scribe",
    "scribe_budget",
    "sofer_budget",
    "scribe_planned",
    "planned_sofer",
  ];
  const proofKeys = [
    "planned_proofreading",
    "proofreading_budget",
    "qa_budget",
    "planned_qa",
    "magiah_budget",
    "הגהות",
  ];
  const miscKeys = ["planned_misc", "misc_budget", "overhead_planned", "other_planned"];

  let scribe = 0;
  for (const k of scribeKeys) {
    scribe = Math.max(scribe, readPositiveNumberFromSnapshotValue(snapshot[k]));
  }
  let proofreading = 0;
  for (const k of proofKeys) {
    proofreading = Math.max(proofreading, readPositiveNumberFromSnapshotValue(snapshot[k]));
  }
  let misc = 0;
  for (const k of miscKeys) {
    misc = Math.max(misc, readPositiveNumberFromSnapshotValue(snapshot[k]));
  }

  for (const [k, v] of Object.entries(snapshot)) {
    if (/scribe|sofer|סופר/i.test(k) && !/parchment|קלף/i.test(k)) {
      scribe = Math.max(scribe, readPositiveNumberFromSnapshotValue(v));
    }
    if (/proof|qa|magiah|הגהה|מגיה/i.test(k) && !/computer_qa|gavra/i.test(k)) {
      proofreading = Math.max(proofreading, readPositiveNumberFromSnapshotValue(v));
    }
  }

  const total = parchment + scribe + proofreading + misc;
  return { parchment, scribe, proofreading, misc, total };
}

/** תקציב קלף מתוכנן: עמודה בפרויקט אם הוגדרה, אחרת צילום מחשבון. */
export function resolveTorahPlannedParchmentBudget(input: {
  plannedParchmentBudgetColumn: number | null | undefined;
  calculatorSnapshot: Record<string, unknown> | null | undefined;
}): number {
  const col = Number(input.plannedParchmentBudgetColumn);
  if (Number.isFinite(col) && col > 0) return col;
  return extractPlannedParchmentBudgetFromSnapshot(input.calculatorSnapshot);
}

/**
 * רווח תיאורטי לפי חוזה: ערך מוסכם פחות `estimated_expenses_total` כשמוגדר,
 * אחרת סכום שורות מתוכננות מהצילום (קלף, סופר, הגהות, שונות).
 */
export function computeTorahTheoreticalContractMargin(input: {
  totalAgreedPrice: number;
  calculatorSnapshot: Record<string, unknown> | null | undefined;
  estimatedExpensesTotal?: number | null;
}): { theoreticalMargin: number; plannedCostOffset: number } {
  const gross = Number(input.totalAgreedPrice) || 0;
  const col = Number(input.estimatedExpensesTotal);
  if (Number.isFinite(col) && col >= 0) {
    return { plannedCostOffset: col, theoreticalMargin: gross - col };
  }
  const ops = extractPlannedOperationalBudgetFromSnapshot(input.calculatorSnapshot);
  const plannedCostOffset = ops.total;
  return {
    plannedCostOffset,
    theoreticalMargin: gross - plannedCostOffset,
  };
}

/** יחס גבייה: כמה מהרווח התיאורטי הוחזר כתזרים נטו מהיומן (0–100). */
export function computeTorahCollectionProgressPercent(input: {
  theoreticalProfitTotal: number;
  actualCashflowNet: number;
}): number | null {
  const th = Number(input.theoreticalProfitTotal);
  if (!Number.isFinite(th) || th <= 0) return null;
  const net = Number(input.actualCashflowNet);
  if (!Number.isFinite(net)) return null;
  return Math.max(0, Math.min(100, (net / th) * 100));
}

/** התראת תקציב קלף: בפועל מעל 10% מהמתוכנן */
export function isTorahParchmentBudgetOverThreshold(input: {
  plannedParchment: number;
  actualParchmentExpense: number;
  thresholdRatio?: number;
}): boolean {
  const planned = Number(input.plannedParchment) || 0;
  if (planned <= 0) return false;
  const ratio = input.thresholdRatio ?? 1.1;
  return Number(input.actualParchmentExpense) > planned * ratio;
}

/**
 * הערכת רווחיות: כסף מלקוח פחות תשלומי סופר (אחרי ניכוי תיקונים) פחות הוצאות QA ואחרות.
 */
export function estimateTorahProjectProfitability(input: {
  amountPaidByClient: number;
  amountPaidToScribe: number;
  ledgerLines: TorahLedgerLine[];
}): number {
  const { totalFixDeduction, totalQaExpense, totalParchmentExpense, totalOtherExpense } = summarizeTorahLedger(
    input.ledgerLines
  );
  const client = Number(input.amountPaidByClient) || 0;
  const scribe = Number(input.amountPaidToScribe) || 0;
  const effectiveScribe = Math.max(0, scribe - totalFixDeduction);
  return client - effectiveScribe - totalQaExpense - totalParchmentExpense - totalOtherExpense;
}

/**
 * תזרים מזומנים גולמי מהיומן: כל תשלום מלקוח מפחית את כל היציאות (סופר, תיקון, הגהה, אחר).
 * שונה מהערכת רווחיות — אין כאן ניכוי תיקון מתוך תשלום הסופר.
 */
export function computeTorahProjectNetCashflowFromLedger(transactions: TorahLedgerLine[]): {
  netCashPosition: number;
  totalCashIn: number;
  totalCashOut: number;
} {
  let totalCashIn = 0;
  let totalCashOut = 0;
  for (const t of transactions) {
    const a = Number(t.amount);
    if (!Number.isFinite(a) || a < 0) continue;
    switch (t.transaction_type) {
      case "client_payment":
        totalCashIn += a;
        break;
      case "scribe_payment":
      case "fix_deduction":
      case "qa_expense":
      case "parchment_expense":
      case "other_expense":
        totalCashOut += a;
        break;
      default:
        break;
    }
  }
  return {
    netCashPosition: totalCashIn - totalCashOut,
    totalCashIn,
    totalCashOut,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Torah scribe pace (קליטת יריעות / מעקב קצב)
// ─────────────────────────────────────────────────────────────────────────────

/** Alert when strictly later than this many effective days behind pace. */
export const TORAH_SCRIBE_PACE_ALERT_THRESHOLD_DAYS = 2;

export type TorahScribePaceStatus = "on_track" | "delayed" | "unknown";

export type TorahScribePaceResult = {
  status: TorahScribePaceStatus;
  /** Effective days behind promised pace (0 if on track or unknown). */
  delayDays: number;
  deficitColumns: number;
  expectedColumns: number;
  actualColumns: number;
  totalColumns: number;
  daysElapsed: number;
};

function torahCalendarDaysBetween(startIso: string, endIso: string): number {
  const a = Date.parse(`${startIso}T12:00:00Z`);
  const b = Date.parse(`${endIso}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86400000));
}

/**
 * Compares actual column progress vs expected progress from `startDate`, `columnsPerDay`,
 * and optional `targetDate` (past target without full scroll ⇒ delayed).
 *
 * Pure: pass `referenceDate` (YYYY-MM-DD) in tests; defaults to UTC \"today\".
 */
export function computeTorahScribePace(input: {
  startDate: string | null;
  targetDate: string | null;
  columnsPerDay: number;
  sheets: { columns_count: number; status: string }[];
  referenceDate?: string;
}): TorahScribePaceResult {
  const ref = input.referenceDate ?? new Date().toISOString().slice(0, 10);
  const pace = Number(input.columnsPerDay);
  const paceOk = Number.isFinite(pace) && pace > 0;

  const totalColumns = input.sheets.reduce(
    (sum, sh) => sum + (sh.columns_count || 4),
    0
  );
  const actualColumns = input.sheets
    .filter((sh) => sh.status !== "not_started")
    .reduce((sum, sh) => sum + (sh.columns_count || 4), 0);

  const zero = (): TorahScribePaceResult => ({
    status: "unknown",
    delayDays: 0,
    deficitColumns: 0,
    expectedColumns: 0,
    actualColumns,
    totalColumns,
    daysElapsed: 0,
  });

  const pastTargetIncomplete =
    Boolean(input.targetDate && ref > input.targetDate && actualColumns < totalColumns - 1e-6);

  if (!input.startDate || !paceOk) {
    if (pastTargetIncomplete) {
      return {
        status: "delayed",
        delayDays: 1,
        deficitColumns: Math.max(0, totalColumns - actualColumns),
        expectedColumns: totalColumns,
        actualColumns,
        totalColumns,
        daysElapsed: 0,
      };
    }
    return zero();
  }

  const daysElapsed = torahCalendarDaysBetween(input.startDate, ref);
  let expectedColumns = Math.min(totalColumns, daysElapsed * pace);

  if (pastTargetIncomplete) {
    expectedColumns = totalColumns;
  }

  const deficitColumns = Math.max(0, expectedColumns - actualColumns);
  let delayDays = paceOk && deficitColumns > 1e-6 ? deficitColumns / pace : 0;
  let status: TorahScribePaceStatus =
    deficitColumns > 1e-6 || pastTargetIncomplete ? "delayed" : "on_track";

  if (pastTargetIncomplete) {
    delayDays = Math.max(delayDays, 1);
    status = "delayed";
  }

  return {
    status,
    delayDays,
    deficitColumns,
    expectedColumns,
    actualColumns,
    totalColumns,
    daysElapsed,
  };
}

/** Whether WhatsApp delay alert should fire (strictly more than threshold days). */
export function shouldSendTorahScribeDelayAlert(delayDays: number): boolean {
  return delayDays > TORAH_SCRIBE_PACE_ALERT_THRESHOLD_DAYS;
}

export function buildTorahScribeDelayWhatsAppMessage(
  scribeName: string,
  projectTitle: string
): string {
  const name = scribeName.trim() || "סופר";
  const title = projectTitle.trim() || "הפרויקט";
  return `שלום ${name}, שים לב שקצב הכתיבה הנוכחי חורג מהיעד לספר \"${title}\". נשמח לתאם המשך עבודה.`;
}
