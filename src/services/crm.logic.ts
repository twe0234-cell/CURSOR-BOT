/**
 * Pure business-logic utilities for the CRM / ERP financial calculations.
 * No I/O, no Supabase — all functions are synchronous and fully testable.
 *
 * Exported separately from crm.service.ts so server-only imports (createClient,
 * next/headers, etc.) never leak into pure-logic test files.
 */

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
};

export type DealFinancials = {
  /** The total deal cost / agreed price. */
  totalCost: number;
  /** Total amount paid so far. */
  totalPaid: number;
  /** Outstanding balance, clamped to ≥ 0. */
  remainingBalance: number;
};

/**
 * Pure utility. Calculates financial totals for any investment or sale entity.
 *
 * Calculation priority:
 *   totalCost = total_price ?? (unit_price × max(1, floor(quantity)))
 *   totalPaid = amount_paid (defaults to 0)
 *   remainingBalance = max(0, totalCost - totalPaid)
 *
 * Safe to call with null / undefined fields — all default to 0.
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

  return { totalCost, totalPaid, remainingBalance };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeSaleProfit
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
