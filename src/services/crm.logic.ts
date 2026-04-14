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
  totalOtherExpense: number;
} {
  let fix = 0;
  let qa = 0;
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
    totalOtherExpense: other,
  };
}

/**
 * הערכת רווחיות: כסף מלקוח פחות תשלומי סופר (אחרי ניכוי תיקונים) פחות הוצאות QA ואחרות.
 */
export function estimateTorahProjectProfitability(input: {
  amountPaidByClient: number;
  amountPaidToScribe: number;
  ledgerLines: TorahLedgerLine[];
}): number {
  const { totalFixDeduction, totalQaExpense, totalOtherExpense } = summarizeTorahLedger(
    input.ledgerLines
  );
  const client = Number(input.amountPaidByClient) || 0;
  const scribe = Number(input.amountPaidToScribe) || 0;
  const effectiveScribe = Math.max(0, scribe - totalFixDeduction);
  return client - effectiveScribe - totalQaExpense - totalOtherExpense;
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
