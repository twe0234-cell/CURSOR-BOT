/**
 * Unit tests for src/services/crm.logic.ts
 *
 * Two suites:
 *
 *  1. getDealFinancials — pure financial math for a single deal entity.
 *     Covers: total_price override, unit_price × quantity fallback, null
 *     safety, quantity clamping, remaining balance clamping.
 *
 *  2. computeSaleProfit — paper-margin and cost-recovery realized profit.
 *     Covers: inventory / project sales with cost, zero-cost brokerage deals
 *     (the main bug fix), partial vs full payment, and null-cost non-brokerage
 *     sales that should return null realized profit.
 */

import { describe, it, expect } from "vitest";
import {
  getDealFinancials,
  computeSaleProfit,
  computeSaleRowDisplay,
  computeSaleFinancialPatch,
  isDealDelivered,
  classifyDealBalance,
  normalizeDealType,
  computeDealFinancialsByType,
  validatePaymentAmount,
  calculateTorahProjectFinancials,
  computeTorahScribePace,
  shouldSendTorahScribeDelayAlert,
  TORAH_SCRIBE_PACE_ALERT_THRESHOLD_DAYS,
  buildTorahScribeDelayWhatsAppMessage,
  summarizeTorahLedger,
  estimateTorahProjectProfitability,
  sumTorahLedgerPayments,
  computeTorahProjectNetCashflowFromLedger,
  type TorahLedgerLine,
} from "./crm.logic";
import {
  columnsCountForTorahSheetNumber,
  TORAH_SHEET_COUNT,
  type TorahSheetStatus,
} from "@/src/lib/types/torah";

// ─────────────────────────────────────────────────────────────────────────────
// 1. getDealFinancials
// ─────────────────────────────────────────────────────────────────────────────

describe("getDealFinancials", () => {
  // ── totalCost calculation ─────────────────────────────────────────────────

  it("uses total_price directly when it is provided", () => {
    // total_price=5000 takes priority over unit_price × quantity (10 × 100 = 1000)
    const { totalCost } = getDealFinancials({ total_price: 5000, unit_price: 100, quantity: 10 });
    expect(totalCost).toBe(5000);
  });

  it("falls back to unit_price × quantity when total_price is null", () => {
    const { totalCost } = getDealFinancials({ total_price: null, unit_price: 300, quantity: 5 });
    expect(totalCost).toBe(1500); // 300 × 5
  });

  it("falls back to unit_price × quantity when total_price is undefined", () => {
    const { totalCost } = getDealFinancials({ unit_price: 200, quantity: 3 });
    expect(totalCost).toBe(600); // 200 × 3
  });

  it("treats null quantity as 1 in the fallback calculation", () => {
    const { totalCost } = getDealFinancials({ unit_price: 400, quantity: null });
    expect(totalCost).toBe(400); // 400 × 1
  });

  it("treats undefined quantity as 1 in the fallback calculation", () => {
    const { totalCost } = getDealFinancials({ unit_price: 750 });
    expect(totalCost).toBe(750); // 750 × 1
  });

  it("treats null unit_price as 0 when no total_price is given", () => {
    const { totalCost } = getDealFinancials({ unit_price: null, quantity: 5 });
    expect(totalCost).toBe(0); // 0 × 5
  });

  it("handles all-null input without throwing and returns zeros", () => {
    const result = getDealFinancials({});
    expect(result).toEqual({
      totalCost: 0,
      totalPaid: 0,
      remainingBalance: 0,
      actual_debt: 0,
      future_commitment: 0,
    });
  });

  // ── totalPaid ─────────────────────────────────────────────────────────────

  it("sets totalPaid from amount_paid", () => {
    const { totalPaid } = getDealFinancials({ total_price: 1000, amount_paid: 350 });
    expect(totalPaid).toBe(350);
  });

  it("treats null amount_paid as 0", () => {
    const { totalPaid } = getDealFinancials({ total_price: 1000, amount_paid: null });
    expect(totalPaid).toBe(0);
  });

  // ── remainingBalance ──────────────────────────────────────────────────────

  it("computes remainingBalance as totalCost - totalPaid", () => {
    const { remainingBalance } = getDealFinancials({ total_price: 2000, amount_paid: 800 });
    expect(remainingBalance).toBe(1200);
  });

  it("clamps remainingBalance to 0 when deal is overpaid", () => {
    const { remainingBalance } = getDealFinancials({ total_price: 500, amount_paid: 700 });
    expect(remainingBalance).toBe(0);
  });

  it("returns 0 remainingBalance when fully paid", () => {
    const { remainingBalance } = getDealFinancials({ total_price: 3000, amount_paid: 3000 });
    expect(remainingBalance).toBe(0);
  });

  // ── Investment-style entity (uses total_agreed_price as total_price) ───────

  it("works with investment-style entity (total_agreed_price mapped to total_price)", () => {
    // Simulates how the investments action will call it:
    //   getDealFinancials({ total_price: inv.total_agreed_price, amount_paid: inv.amount_paid })
    const inv = { total_agreed_price: 12000, amount_paid: 5000 };
    const result = getDealFinancials({
      total_price: inv.total_agreed_price,
      amount_paid: inv.amount_paid,
    });
    expect(result.totalCost).toBe(12000);
    expect(result.totalPaid).toBe(5000);
    expect(result.remainingBalance).toBe(7000);
  });

  it("correctly multiplies quantity by unit_price for a multi-unit investment", () => {
    // qty=3 units × cpu=4000 = 12000 total
    const result = getDealFinancials({ quantity: 3, unit_price: 4000, amount_paid: 1000 });
    expect(result.totalCost).toBe(12000);
    expect(result.remainingBalance).toBe(11000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1b. getDealFinancials — actual_debt vs future_commitment classification
// ─────────────────────────────────────────────────────────────────────────────

describe("getDealFinancials — actual_debt vs future_commitment", () => {
  // Task requirement: in-progress project must produce future_commitment > 0, actual_debt === 0

  it("in-progress project ('active'): future_commitment = remaining, actual_debt = 0", () => {
    const result = getDealFinancials({ total_price: 15000, amount_paid: 6000, status: "active" });
    expect(result.remainingBalance).toBe(9000);
    expect(result.future_commitment).toBe(9000);
    expect(result.actual_debt).toBe(0);
  });

  it("being-written project ('בכתיבה'): future_commitment = remaining, actual_debt = 0", () => {
    const result = getDealFinancials({ total_price: 20000, amount_paid: 5000, status: "בכתיבה" });
    expect(result.future_commitment).toBe(15000);
    expect(result.actual_debt).toBe(0);
  });

  it("in-process project ('בתהליך'): future_commitment = remaining, actual_debt = 0", () => {
    const result = getDealFinancials({ total_price: 10000, amount_paid: 0, status: "בתהליך" });
    expect(result.future_commitment).toBe(10000);
    expect(result.actual_debt).toBe(0);
  });

  // Task requirement: completed project must produce actual_debt > 0, future_commitment === 0

  it("completed project ('completed'): actual_debt = remaining, future_commitment = 0", () => {
    const result = getDealFinancials({ total_price: 15000, amount_paid: 6000, status: "completed" });
    expect(result.remainingBalance).toBe(9000);
    expect(result.actual_debt).toBe(9000);
    expect(result.future_commitment).toBe(0);
  });

  it("delivered project ('הושלם'): actual_debt = remaining, future_commitment = 0", () => {
    const result = getDealFinancials({ total_price: 12000, amount_paid: 4000, status: "הושלם" });
    expect(result.actual_debt).toBe(8000);
    expect(result.future_commitment).toBe(0);
  });

  it("in-inventory project ('במלאי'): actual_debt = remaining, future_commitment = 0", () => {
    const result = getDealFinancials({ total_price: 8000, amount_paid: 3000, status: "במלאי" });
    expect(result.actual_debt).toBe(5000);
    expect(result.future_commitment).toBe(0);
  });

  it("delivered_to_inventory: actual_debt = remaining, future_commitment = 0", () => {
    const result = getDealFinancials({ total_price: 5000, amount_paid: 1000, status: "delivered_to_inventory" });
    expect(result.actual_debt).toBe(4000);
    expect(result.future_commitment).toBe(0);
  });

  it("settled deal: both actual_debt and future_commitment are 0", () => {
    const result = getDealFinancials({ total_price: 5000, amount_paid: 5000, status: "completed" });
    expect(result.remainingBalance).toBe(0);
    expect(result.actual_debt).toBe(0);
    expect(result.future_commitment).toBe(0);
  });

  it("no status provided: balance defaults to future_commitment (conservative)", () => {
    const result = getDealFinancials({ total_price: 3000, amount_paid: 1000 });
    expect(result.remainingBalance).toBe(2000);
    expect(result.future_commitment).toBe(2000);
    expect(result.actual_debt).toBe(0);
  });

  it("actual_debt + future_commitment always equals remainingBalance", () => {
    const cases = [
      { total_price: 1000, amount_paid: 300, status: "completed" },
      { total_price: 1000, amount_paid: 300, status: "active" },
      { total_price: 1000, amount_paid: 1000, status: "completed" },
    ];
    for (const c of cases) {
      const r = getDealFinancials(c);
      expect(r.actual_debt + r.future_commitment).toBe(r.remainingBalance);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. isDealDelivered + classifyDealBalance
// ─────────────────────────────────────────────────────────────────────────────

describe("isDealDelivered", () => {
  it("returns true for 'completed'", () => expect(isDealDelivered("completed")).toBe(true));
  it("returns true for 'delivered_to_inventory'", () => expect(isDealDelivered("delivered_to_inventory")).toBe(true));
  it("returns true for 'נמסר'", () => expect(isDealDelivered("נמסר")).toBe(true));
  it("returns true for 'נמכר'", () => expect(isDealDelivered("נמכר")).toBe(true));
  it("returns true for 'הושלם' (Hebrew: completed)", () => expect(isDealDelivered("הושלם")).toBe(true));
  it("returns true for 'במלאי' (Hebrew: in inventory)", () => expect(isDealDelivered("במלאי")).toBe(true));
  it("returns false for 'active' (in progress)", () => expect(isDealDelivered("active")).toBe(false));
  it("returns false for 'בכתיבה' (being written)", () => expect(isDealDelivered("בכתיבה")).toBe(false));
  it("returns false for 'בתהליך' (in process)", () => expect(isDealDelivered("בתהליך")).toBe(false));
  it("returns false for 'in_progress'", () => expect(isDealDelivered("in_progress")).toBe(false));
  it("returns false for null", () => expect(isDealDelivered(null)).toBe(false));
  it("returns false for undefined", () => expect(isDealDelivered(undefined)).toBe(false));
});

describe("classifyDealBalance", () => {
  it("returns 'settled' when remaining balance is 0", () =>
    expect(classifyDealBalance(0, "active")).toBe("settled"));
  it("returns 'settled' when remaining balance is negative", () =>
    expect(classifyDealBalance(-100, "completed")).toBe("settled"));
  it("returns 'future_commitment' for active deal with remaining balance", () =>
    expect(classifyDealBalance(5000, "active")).toBe("future_commitment"));
  it("returns 'actual_debt' for completed deal with remaining balance", () =>
    expect(classifyDealBalance(3000, "completed")).toBe("actual_debt"));
  it("returns 'actual_debt' for delivered_to_inventory deal", () =>
    expect(classifyDealBalance(1000, "delivered_to_inventory")).toBe("actual_debt"));
  it("returns 'future_commitment' when status is null (unknown = pending)", () =>
    expect(classifyDealBalance(500, null)).toBe("future_commitment"));
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. computeSaleProfit
// ─────────────────────────────────────────────────────────────────────────────

describe("computeSaleProfit", () => {
  // ── Inventory / project sales (cost_price known) ──────────────────────────

  it("computes paperMargin as total_price − cost_price for inventory sales", () => {
    const { paperMargin } = computeSaleProfit({
      sale_type: "ממלאי",
      cost_price: 8000,
      total_price: 12000,
      total_paid: 0,
    });
    expect(paperMargin).toBe(4000); // 12000 - 8000
  });

  it("returns realizedRecovery = 0 while total_paid ≤ cost (cost not yet recovered)", () => {
    const { realizedRecovery } = computeSaleProfit({
      sale_type: "ממלאי",
      cost_price: 8000,
      total_price: 12000,
      total_paid: 5000, // paid less than cost
    });
    expect(realizedRecovery).toBe(0);
  });

  it("returns realizedRecovery = 0 when total_paid === cost exactly", () => {
    const { realizedRecovery } = computeSaleProfit({
      sale_type: "ממלאי",
      cost_price: 8000,
      total_price: 12000,
      total_paid: 8000, // exactly at cost
    });
    expect(realizedRecovery).toBe(0);
  });

  it("returns partial realizedRecovery when total_paid exceeds cost but not fully paid", () => {
    // paid=10000, cost=8000 → realized = 10000 - 8000 = 2000 (below paperMargin of 4000)
    const { realizedRecovery } = computeSaleProfit({
      sale_type: "ממלאי",
      cost_price: 8000,
      total_price: 12000,
      total_paid: 10000,
    });
    expect(realizedRecovery).toBe(2000);
  });

  it("caps realizedRecovery at paperMargin when fully paid", () => {
    // paid=12000, cost=8000 → realized = min(12000-8000, 4000) = 4000
    const { realizedRecovery } = computeSaleProfit({
      sale_type: "ממלאי",
      cost_price: 8000,
      total_price: 12000,
      total_paid: 12000,
    });
    expect(realizedRecovery).toBe(4000);
  });

  // ── Brokerage deals — the critical bug-fix edge case ──────────────────────

  it("treats cost as 0 for brokerage deals when cost_price is null", () => {
    const { paperMargin } = computeSaleProfit({
      sale_type: "תיווך",
      cost_price: null,
      total_price: 5000,
      total_paid: 0,
    });
    // cost=0, so paperMargin = 5000 - 0 = 5000
    expect(paperMargin).toBe(5000);
  });

  it("brokerage deal: realizedRecovery = 0 when not yet paid (even though cost is 0)", () => {
    // Brokerage: cost=0. total_paid=0 is NOT > cost(0), so realizedRecovery = 0.
    const { realizedRecovery } = computeSaleProfit({
      sale_type: "תיווך",
      cost_price: null,
      total_price: 5000,
      total_paid: 0,
    });
    expect(realizedRecovery).toBe(0);
  });

  it("brokerage deal: realizedRecovery equals total_price when fully paid (Balance = 0)", () => {
    // This is the main bug fix: before fix, realized_profit was null (→ UI showed "—").
    // After fix: cost=0, total_paid=5000 > 0, so realized = min(5000-0, 5000) = 5000.
    const { realizedRecovery } = computeSaleProfit({
      sale_type: "תיווך",
      cost_price: null,
      total_price: 5000,
      total_paid: 5000,
    });
    expect(realizedRecovery).toBe(5000);
  });

  it("brokerage deal: realizedRecovery equals paper_profit (same value) when fully paid", () => {
    const result = computeSaleProfit({
      sale_type: "תיווך",
      cost_price: null,
      total_price: 3200,
      total_paid: 3200,
    });
    expect(result.realizedRecovery).toBe(result.paperMargin);
    expect(result.realizedRecovery).toBe(3200);
  });

  it("brokerage deal: partial payment yields partial realizedRecovery (since cost=0)", () => {
    // paid=2000 > cost(0) → realized = min(2000-0, 3200) = 2000
    const { realizedRecovery } = computeSaleProfit({
      sale_type: "תיווך",
      cost_price: null,
      total_price: 3200,
      total_paid: 2000,
    });
    expect(realizedRecovery).toBe(2000);
  });

  // ── Non-brokerage sale with unknown cost ──────────────────────────────────

  it("returns null paperMargin and null realizedRecovery when cost_price is null and not brokerage", () => {
    const result = computeSaleProfit({
      sale_type: "ממלאי",
      cost_price: null,
      total_price: 6000,
      total_paid: 6000,
    });
    expect(result.paperMargin).toBeNull();
    expect(result.realizedRecovery).toBeNull();
  });

  it("returns null paperMargin and null realizedRecovery for undefined sale_type with null cost_price", () => {
    const result = computeSaleProfit({
      cost_price: null,
      total_price: 6000,
      total_paid: 6000,
    });
    // Default sale_type is "ממלאי" (not brokerage), so cost remains null
    expect(result.paperMargin).toBeNull();
    expect(result.realizedRecovery).toBeNull();
  });

  // ── Project sale ──────────────────────────────────────────────────────────

  it("correctly computes profit for project sales (פרויקט חדש) with known investment cost", () => {
    // Sale price = 20000, investment total = 15000 → paper margin = 5000
    const result = computeSaleProfit({
      sale_type: "פרויקט חדש",
      cost_price: 15000,
      total_price: 20000,
      total_paid: 20000,
    });
    expect(result.paperMargin).toBe(5000);
    expect(result.realizedRecovery).toBe(5000);
  });

  // ── paperMargin clamped to 0 when sold at a loss ──────────────────────────

  it("clamps paperMargin to 0 when sale is at a loss (total_price < cost_price)", () => {
    const { paperMargin, realizedRecovery } = computeSaleProfit({
      sale_type: "ממלאי",
      cost_price: 10000,
      total_price: 8000,
      total_paid: 8000,
    });
    expect(paperMargin).toBe(0);
    expect(realizedRecovery).toBe(0); // total_paid(8000) > cost(10000) is false → 0
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. normalizeDealType
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeDealType", () => {
  it("maps Hebrew 'תיווך' to 'brokerage_direct'", () =>
    expect(normalizeDealType("תיווך")).toBe("brokerage_direct"));

  it("maps Hebrew 'פרויקט חדש' to 'long_term_project'", () =>
    expect(normalizeDealType("פרויקט חדש")).toBe("long_term_project"));

  it("maps Hebrew 'ממלאי' to 'inventory_sale'", () =>
    expect(normalizeDealType("ממלאי")).toBe("inventory_sale"));

  it("passes canonical 'brokerage_managed' through unchanged", () =>
    expect(normalizeDealType("brokerage_managed")).toBe("brokerage_managed"));

  it("passes canonical 'inventory_sale' through unchanged", () =>
    expect(normalizeDealType("inventory_sale")).toBe("inventory_sale"));

  it("defaults null to 'inventory_sale'", () =>
    expect(normalizeDealType(null)).toBe("inventory_sale"));

  it("defaults undefined to 'inventory_sale'", () =>
    expect(normalizeDealType(undefined)).toBe("inventory_sale"));

  it("defaults unknown string to 'inventory_sale'", () =>
    expect(normalizeDealType("unknown_type_xyz")).toBe("inventory_sale"));
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. validatePaymentAmount  — QA: overpayments must be blocked
// ─────────────────────────────────────────────────────────────────────────────

describe("validatePaymentAmount", () => {
  // QA requirement (a): payment > (total_price - already_paid) must be blocked

  it("(a) blocks overpayment — amount exceeds remaining balance", () => {
    // remaining = 1000 - 800 = 200; trying to pay 300 → blocked
    const result = validatePaymentAmount({ amount: 300, total_price: 1000, already_paid: 800 });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/יתרה/);
  });

  it("(a) blocks when deal is already fully paid (remaining = 0)", () => {
    const result = validatePaymentAmount({ amount: 1, total_price: 500, already_paid: 500 });
    expect(result.valid).toBe(false);
  });

  it("(a) allows exact payment matching the remaining balance", () => {
    // remaining = 1000 - 600 = 400; paying exactly 400 → allowed
    const result = validatePaymentAmount({ amount: 400, total_price: 1000, already_paid: 600 });
    expect(result.valid).toBe(true);
  });

  it("(a) allows partial payment below the remaining balance", () => {
    const result = validatePaymentAmount({ amount: 100, total_price: 1000, already_paid: 0 });
    expect(result.valid).toBe(true);
  });

  it("blocks zero amount (not a positive number)", () => {
    const result = validatePaymentAmount({ amount: 0, total_price: 1000, already_paid: 0 });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/חיובי/);
  });

  it("blocks negative amount", () => {
    const result = validatePaymentAmount({ amount: -50, total_price: 1000, already_paid: 0 });
    expect(result.valid).toBe(false);
  });

  it("allows full payment on a fresh deal (already_paid = 0)", () => {
    const result = validatePaymentAmount({ amount: 5000, total_price: 5000, already_paid: 0 });
    expect(result.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. computeDealFinancialsByType
// ─────────────────────────────────────────────────────────────────────────────

describe("computeDealFinancialsByType — brokerage_direct", () => {
  // QA requirement (c): brokerage_direct produces 0 system debt, only commission_revenue

  it("(c) systemDebt is always 0 — buyer pays supplier directly", () => {
    const { systemDebt } = computeDealFinancialsByType({
      deal_type: "brokerage_direct",
      total_price: 10000,
      total_paid: 0,
    });
    expect(systemDebt).toBe(0);
  });

  it("(c) commissionRevenue equals commission_amount when provided", () => {
    const { commissionRevenue } = computeDealFinancialsByType({
      deal_type: "brokerage_direct",
      total_price: 10000,
      total_paid: 0,
      commission_amount: 800,
    });
    expect(commissionRevenue).toBe(800);
  });

  it("(c) commissionRevenue falls back to total_price when commission_amount is absent", () => {
    const { commissionRevenue } = computeDealFinancialsByType({
      deal_type: "brokerage_direct",
      total_price: 3000,
      total_paid: 0,
    });
    expect(commissionRevenue).toBe(3000);
  });

  it("realizedRecovery = 0 when no payment received yet", () => {
    const { realizedRecovery } = computeDealFinancialsByType({
      deal_type: "brokerage_direct",
      total_price: 5000,
      total_paid: 0,
      commission_amount: 500,
    });
    expect(realizedRecovery).toBe(0);
  });

  it("realizedRecovery = commission when fully paid", () => {
    const { realizedRecovery, commissionRevenue } = computeDealFinancialsByType({
      deal_type: "brokerage_direct",
      total_price: 5000,
      total_paid: 500,
      commission_amount: 500,
    });
    expect(realizedRecovery).toBe(500);
    expect(realizedRecovery).toBe(commissionRevenue);
  });

  it("realizedRecovery is capped at commissionRevenue even if total_paid > commission", () => {
    // Overpaid scenario (should not happen after validatePaymentAmount, but math must be safe)
    const { realizedRecovery } = computeDealFinancialsByType({
      deal_type: "brokerage_direct",
      total_price: 5000,
      total_paid: 9999,
      commission_amount: 600,
    });
    expect(realizedRecovery).toBe(600);
  });
});

describe("computeDealFinancialsByType — brokerage_managed", () => {
  // QA requirement (b): profit triggers only AFTER supplier cost is covered

  it("(b) realizedRecovery = 0 when total_paid < supplier cost", () => {
    // supplier cost = 6000; buyer paid 4000 — cost not yet covered
    const { realizedRecovery } = computeDealFinancialsByType({
      deal_type: "brokerage_managed",
      total_price: 9000,
      total_paid: 4000,
      cost_price: 6000,
    });
    expect(realizedRecovery).toBe(0);
  });

  it("(b) realizedRecovery = 0 when total_paid equals supplier cost exactly", () => {
    const { realizedRecovery } = computeDealFinancialsByType({
      deal_type: "brokerage_managed",
      total_price: 9000,
      total_paid: 6000,
      cost_price: 6000,
    });
    expect(realizedRecovery).toBe(0);
  });

  it("(b) realizedRecovery = paid − cost when payment crosses the cost threshold", () => {
    // paid = 7000, cost = 6000 → realized = 1000 (below paperMargin of 3000)
    const { realizedRecovery } = computeDealFinancialsByType({
      deal_type: "brokerage_managed",
      total_price: 9000,
      total_paid: 7000,
      cost_price: 6000,
    });
    expect(realizedRecovery).toBe(1000);
  });

  it("(b) realizedRecovery is capped at paperMargin when fully paid", () => {
    // paid = 9000, cost = 6000 → paperMargin = 3000, realized = min(3000, 3000) = 3000
    const { realizedRecovery, paperMargin } = computeDealFinancialsByType({
      deal_type: "brokerage_managed",
      total_price: 9000,
      total_paid: 9000,
      cost_price: 6000,
    });
    expect(paperMargin).toBe(3000);
    expect(realizedRecovery).toBe(3000);
  });

  it("systemDebt = remaining buyer balance", () => {
    const { systemDebt } = computeDealFinancialsByType({
      deal_type: "brokerage_managed",
      total_price: 9000,
      total_paid: 4000,
      cost_price: 6000,
    });
    expect(systemDebt).toBe(5000);
  });

  it("commissionRevenue is null (commission concept does not apply)", () => {
    const { commissionRevenue } = computeDealFinancialsByType({
      deal_type: "brokerage_managed",
      total_price: 9000,
      total_paid: 9000,
      cost_price: 6000,
    });
    expect(commissionRevenue).toBeNull();
  });
});

describe("computeDealFinancialsByType — inventory_sale", () => {
  it("paperMargin = total_price − cost_price", () => {
    const { paperMargin } = computeDealFinancialsByType({
      deal_type: "inventory_sale",
      total_price: 12000,
      total_paid: 0,
      cost_price: 8000,
    });
    expect(paperMargin).toBe(4000);
  });

  it("systemDebt = unpaid balance; supplierDebt = 0 (item already owned)", () => {
    const { systemDebt, supplierDebt } = computeDealFinancialsByType({
      deal_type: "inventory_sale",
      total_price: 12000,
      total_paid: 5000,
      cost_price: 8000,
    });
    expect(systemDebt).toBe(7000);
    expect(supplierDebt).toBe(0);
  });

  it("realizedRecovery = 0 while cost not yet recovered", () => {
    const { realizedRecovery } = computeDealFinancialsByType({
      deal_type: "inventory_sale",
      total_price: 12000,
      total_paid: 7000,
      cost_price: 8000,
    });
    expect(realizedRecovery).toBe(0);
  });

  it("realizedRecovery = paid − cost once cost is exceeded", () => {
    const { realizedRecovery } = computeDealFinancialsByType({
      deal_type: "inventory_sale",
      total_price: 12000,
      total_paid: 10000,
      cost_price: 8000,
    });
    expect(realizedRecovery).toBe(2000);
  });
});

describe("computeDealFinancialsByType — long_term_project", () => {
  it("uses identical profit math to inventory_sale", () => {
    const inv = computeDealFinancialsByType({
      deal_type: "inventory_sale",
      total_price: 20000,
      total_paid: 20000,
      cost_price: 15000,
    });
    const proj = computeDealFinancialsByType({
      deal_type: "long_term_project",
      total_price: 20000,
      total_paid: 20000,
      cost_price: 15000,
    });
    expect(proj.paperMargin).toBe(inv.paperMargin);        // 5000
    expect(proj.realizedRecovery).toBe(inv.realizedRecovery); // 5000
  });

  it("systemDebt reflects unpaid balance regardless of delivery status", () => {
    const { systemDebt } = computeDealFinancialsByType({
      deal_type: "long_term_project",
      total_price: 20000,
      total_paid: 12000,
      cost_price: 15000,
    });
    expect(systemDebt).toBe(8000);
  });

  it("returns null paperMargin and realizedRecovery when cost_price is unknown", () => {
    const { paperMargin, realizedRecovery } = computeDealFinancialsByType({
      deal_type: "long_term_project",
      total_price: 20000,
      total_paid: 20000,
    });
    expect(paperMargin).toBeNull();
    expect(realizedRecovery).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateTorahProjectFinancials — per-column Torah scroll pricing
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateTorahProjectFinancials", () => {
  it("treats falsy columns_count as 4 (matches || 4 in formula)", () => {
    const sheets = [
      { columns_count: 0, status: "not_started" },
      { columns_count: undefined as unknown as number, status: "not_started" },
    ];
    const r = calculateTorahProjectFinancials(800, sheets);
    expect(r.totalColumns).toBe(8);
    expect(r.pricePerColumn).toBe(100);
  });

  it("62 sheets with STaM layout (3 cols on 1,61,62) = 245 columns", () => {
    let sum = 0;
    const sheets = Array.from({ length: TORAH_SHEET_COUNT }, (_, i) => {
      const n = i + 1;
      const columns_count = columnsCountForTorahSheetNumber(n);
      sum += columns_count;
      return { columns_count, status: "not_started" as const };
    });
    expect(sum).toBe(245);
    const r = calculateTorahProjectFinancials(6125, sheets);
    expect(r.totalColumns).toBe(245);
    expect(r.pricePerColumn).toBe(25);
  });

  it("computes price per column from mixed column counts", () => {
    const sheets = [
      { columns_count: 4, status: "approved" },
      { columns_count: 3, status: "not_started" },
      { columns_count: 2, status: "written" },
    ];
    const r = calculateTorahProjectFinancials(900, sheets);
    expect(r.totalColumns).toBe(9);
    expect(r.pricePerColumn).toBe(100);
    expect(r.completedColumns).toBe(4);
    expect(r.actualDebt).toBe(400);
    expect(r.futureCommitment).toBe(500);
  });

  it("counts approved, sewn, and delivered sheet statuses toward completed columns", () => {
    const sheets = [
      { columns_count: 4, status: "approved" },
      { columns_count: 4, status: "sewn" },
      { columns_count: 4, status: "delivered" },
    ];
    const r = calculateTorahProjectFinancials(1200, sheets);
    expect(r.completedColumns).toBe(12);
    expect(r.actualDebt).toBe(1200);
    expect(r.futureCommitment).toBe(0);
  });

  it("treats non-positive totalAgreedPrice as zero debt and commitment", () => {
    const sheets = [{ columns_count: 4, status: "approved" }];
    expect(calculateTorahProjectFinancials(0, sheets)).toMatchObject({
      totalColumns: 4,
      pricePerColumn: 0,
      completedColumns: 4,
      actualDebt: 0,
      futureCommitment: 0,
    });
    expect(calculateTorahProjectFinancials(-100, sheets).actualDebt).toBe(0);
  });

  it("returns zeros when there are no sheets", () => {
    const r = calculateTorahProjectFinancials(5000, []);
    expect(r).toEqual({
      totalColumns: 0,
      pricePerColumn: 0,
      completedColumns: 0,
      actualDebt: 0,
      futureCommitment: 5000,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeTorahScribePace — scribe receiving / pace tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("computeTorahScribePace", () => {
  const sheets62 = () =>
    Array.from({ length: 62 }, (_, i) => ({
      columns_count: i === 0 || i === 60 || i === 61 ? 3 : 4,
      status: "not_started" as TorahSheetStatus,
    }));

  it("returns unknown when startDate is missing and target not past", () => {
    const r = computeTorahScribePace({
      startDate: null,
      targetDate: "2030-01-01",
      columnsPerDay: 2,
      sheets: sheets62(),
      referenceDate: "2026-06-01",
    });
    expect(r.status).toBe("unknown");
    expect(r.delayDays).toBe(0);
  });

  it("returns unknown when columnsPerDay is zero", () => {
    const r = computeTorahScribePace({
      startDate: "2026-01-01",
      targetDate: "2026-12-01",
      columnsPerDay: 0,
      sheets: sheets62(),
      referenceDate: "2026-06-01",
    });
    expect(r.status).toBe("unknown");
  });

  it("is on_track when actual meets expected for elapsed days", () => {
    const sheets = sheets62();
    sheets[0]!.status = "written";
    sheets[1]!.status = "written";
    const r = computeTorahScribePace({
      startDate: "2026-01-01",
      targetDate: "2027-01-01",
      columnsPerDay: 2,
      sheets,
      referenceDate: "2026-01-02",
    });
    expect(r.daysElapsed).toBe(1);
    expect(r.expectedColumns).toBe(2);
    expect(r.actualColumns).toBe(7);
    expect(r.status).toBe("on_track");
    expect(r.delayDays).toBe(0);
  });

  it("is delayed when behind schedule", () => {
    const sheets = sheets62();
    const r = computeTorahScribePace({
      startDate: "2026-01-01",
      targetDate: "2027-01-01",
      columnsPerDay: 10,
      sheets,
      referenceDate: "2026-01-11",
    });
    expect(r.daysElapsed).toBe(10);
    expect(r.expectedColumns).toBe(100);
    expect(r.actualColumns).toBe(0);
    expect(r.status).toBe("delayed");
    expect(r.deficitColumns).toBe(100);
    expect(r.delayDays).toBe(10);
  });

  it("caps expected columns at total scroll columns", () => {
    const sheets = sheets62();
    for (const s of sheets) s.status = "written";
    const r = computeTorahScribePace({
      startDate: "2026-01-01",
      targetDate: "2030-01-01",
      columnsPerDay: 50,
      sheets,
      referenceDate: "2026-12-31",
    });
    expect(r.totalColumns).toBe(245);
    expect(r.expectedColumns).toBe(245);
    expect(r.status).toBe("on_track");
  });

  it("is delayed past target when scroll incomplete", () => {
    const sheets = sheets62();
    const r = computeTorahScribePace({
      startDate: "2026-01-01",
      targetDate: "2026-06-01",
      columnsPerDay: 1,
      sheets,
      referenceDate: "2026-06-15",
    });
    expect(r.status).toBe("delayed");
    expect(r.delayDays).toBeGreaterThanOrEqual(1);
    expect(r.deficitColumns).toBe(245);
  });

  it("shouldSendTorahScribeDelayAlert respects threshold", () => {
    expect(shouldSendTorahScribeDelayAlert(TORAH_SCRIBE_PACE_ALERT_THRESHOLD_DAYS)).toBe(false);
    expect(shouldSendTorahScribeDelayAlert(TORAH_SCRIBE_PACE_ALERT_THRESHOLD_DAYS + 0.001)).toBe(true);
  });

  it("buildTorahScribeDelayWhatsAppMessage includes names", () => {
    const m = buildTorahScribeDelayWhatsAppMessage("משה", "ס\"ת לשבת חתן");
    expect(m).toContain("משה");
    expect(m).toContain("ס\"ת לשבת חתן");
  });
});

describe("sumTorahLedgerPayments", () => {
  it("sums only client_payment and scribe_payment", () => {
    const s = sumTorahLedgerPayments([
      { transaction_type: "client_payment", amount: 1000 },
      { transaction_type: "client_payment", amount: 500 },
      { transaction_type: "scribe_payment", amount: 300 },
      { transaction_type: "fix_deduction", amount: 999 },
    ]);
    expect(s.totalClientPayments).toBe(1500);
    expect(s.totalScribePayments).toBe(300);
  });
});

describe("summarizeTorahLedger / estimateTorahProjectProfitability", () => {
  it("sums fix, qa, other expenses", () => {
    const s = summarizeTorahLedger([
      { transaction_type: "fix_deduction", amount: 100 },
      { transaction_type: "qa_expense", amount: 50 },
      { transaction_type: "other_expense", amount: 25 },
      { transaction_type: "client_payment", amount: 999 },
    ]);
    expect(s.totalFixDeduction).toBe(100);
    expect(s.totalQaExpense).toBe(50);
    expect(s.totalOtherExpense).toBe(25);
  });

  it("estimateTorahProjectProfitability subtracts effective scribe and expenses", () => {
    const p = estimateTorahProjectProfitability({
      amountPaidByClient: 10000,
      amountPaidToScribe: 6000,
      ledgerLines: [
        { transaction_type: "fix_deduction", amount: 500 },
        { transaction_type: "qa_expense", amount: 200 },
        { transaction_type: "other_expense", amount: 100 },
      ],
    });
    expect(p).toBe(10000 - (6000 - 500) - 200 - 100);
  });

  it("effective scribe does not go below zero", () => {
    const p = estimateTorahProjectProfitability({
      amountPaidByClient: 1000,
      amountPaidToScribe: 100,
      ledgerLines: [{ transaction_type: "fix_deduction", amount: 500 }],
    });
    expect(p).toBe(1000 - 0);
  });
});

describe("computeTorahProjectNetCashflowFromLedger", () => {
  it("nets all inflows and outflows from ledger lines (fix is full outflow)", () => {
    const r = computeTorahProjectNetCashflowFromLedger([
      { transaction_type: "client_payment", amount: 50000 },
      { transaction_type: "scribe_payment", amount: 10000 },
      { transaction_type: "other_expense", amount: 10000 },
      { transaction_type: "qa_expense", amount: 500 },
      { transaction_type: "fix_deduction", amount: 200 },
    ]);
    expect(r.totalCashIn).toBe(50000);
    expect(r.totalCashOut).toBe(10000 + 10000 + 500 + 200);
    expect(r.netCashPosition).toBe(50000 - 20700);
  });

  it("ignores unknown transaction types", () => {
    const r = computeTorahProjectNetCashflowFromLedger([
      { transaction_type: "client_payment", amount: 100 },
      { transaction_type: "not_a_ledger_type", amount: 999 } as TorahLedgerLine,
    ]);
    expect(r.netCashPosition).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeSaleRowDisplay — ZERO UI MATH: centralizes sale-row totals
// ─────────────────────────────────────────────────────────────────────────────

describe("computeSaleRowDisplay", () => {
  it("prefers total_price over sale_price × quantity", () => {
    const r = computeSaleRowDisplay({
      total_price: 1000,
      sale_price: 9999,
      quantity: 3,
      total_paid: 250,
    });
    expect(r.totalDeal).toBe(1000);
    expect(r.paid).toBe(250);
    expect(r.balance).toBe(750);
    expect(r.paidPct).toBe(25);
  });

  it("falls back to sale_price × quantity when total_price is absent", () => {
    const r = computeSaleRowDisplay({
      sale_price: 500,
      quantity: 2,
      total_paid: 100,
    });
    expect(r.totalDeal).toBe(1000);
    expect(r.balance).toBe(900);
    expect(r.paidPct).toBe(10);
  });

  it("treats quantity < 1 as 1 (floor + clamp)", () => {
    const r = computeSaleRowDisplay({ sale_price: 800, quantity: 0 });
    expect(r.totalDeal).toBe(800);
  });

  it("floors fractional quantity to avoid phantom revenue", () => {
    const r = computeSaleRowDisplay({ sale_price: 100, quantity: 2.9 });
    expect(r.totalDeal).toBe(200);
  });

  it("prefers total_paid over amount_paid_row", () => {
    const r = computeSaleRowDisplay({
      total_price: 500,
      total_paid: 300,
      amount_paid_row: 999,
    });
    expect(r.paid).toBe(300);
  });

  it("falls back to amount_paid_row when total_paid is undefined", () => {
    const r = computeSaleRowDisplay({
      total_price: 500,
      amount_paid_row: 120,
    });
    expect(r.paid).toBe(120);
  });

  it("prefers server-provided remaining_balance over derived difference", () => {
    const r = computeSaleRowDisplay({
      total_price: 1000,
      total_paid: 200,
      remaining_balance: 650, // canonical from DB — e.g. after refund logic
    });
    expect(r.balance).toBe(650);
  });

  it("derives balance when remaining_balance is null", () => {
    const r = computeSaleRowDisplay({
      total_price: 1000,
      total_paid: 400,
      remaining_balance: null,
    });
    expect(r.balance).toBe(600);
  });

  it("clamps balance to ≥ 0 when overpaid", () => {
    const r = computeSaleRowDisplay({ total_price: 100, total_paid: 250 });
    expect(r.balance).toBe(0);
  });

  it("clamps paidPct to 100 when overpaid", () => {
    const r = computeSaleRowDisplay({ total_price: 100, total_paid: 250 });
    expect(r.paidPct).toBe(100);
  });

  it("returns 0%s gracefully when the deal has no value", () => {
    const r = computeSaleRowDisplay({
      total_price: 0,
      total_paid: 0,
    });
    expect(r.totalDeal).toBe(0);
    expect(r.paidPct).toBe(0);
    expect(r.balance).toBe(0);
  });

  it("SAFE TYPES: null / undefined / NaN all resolve to 0, never crash", () => {
    const r = computeSaleRowDisplay({
      total_price: null,
      sale_price: null,
      quantity: null,
      total_paid: undefined,
      amount_paid_row: Number.NaN,
      remaining_balance: null,
    });
    expect(r.totalDeal).toBe(0);
    expect(r.paid).toBe(0);
    expect(r.balance).toBe(0);
    expect(r.paidPct).toBe(0);
  });

  it("SAFE TYPES: non-finite Infinity treated as 0", () => {
    const r = computeSaleRowDisplay({
      total_price: Number.POSITIVE_INFINITY,
      total_paid: 50,
    });
    expect(r.totalDeal).toBe(0);
    expect(r.balance).toBe(0);
    expect(r.paidPct).toBe(0);
  });

  it("all returned numbers are finite and ≥ 0", () => {
    const r = computeSaleRowDisplay({
      total_price: -100, // garbage upstream
      total_paid: -999,
      remaining_balance: -50,
    });
    expect(Number.isFinite(r.totalDeal)).toBe(true);
    expect(Number.isFinite(r.paid)).toBe(true);
    expect(Number.isFinite(r.balance)).toBe(true);
    expect(r.totalDeal).toBeGreaterThanOrEqual(0);
    expect(r.paid).toBeGreaterThanOrEqual(0);
    expect(r.balance).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeSaleFinancialPatch — canonical DB-field derivation shared by all
// erp_sales write sites (createSale, updateSaleDetails, updateSaleCoreDetails).
// ─────────────────────────────────────────────────────────────────────────────

describe("computeSaleFinancialPatch", () => {
  it("brokerage_direct mirrors total_price across all commission fields", () => {
    const p = computeSaleFinancialPatch({
      deal_type: "brokerage_direct",
      total_price: 1200,
    });
    expect(p.total_price).toBe(1200);
    expect(p.sale_price).toBe(1200);
    expect(p.profit).toBe(1200);
    expect(p.commission_profit).toBe(1200);
    expect(p.commission_received).toBe(1200);
    expect(p.actual_commission_received).toBe(1200);
  });

  it("inventory_sale derives sale_price = total / qty and profit = total − cost", () => {
    const p = computeSaleFinancialPatch({
      deal_type: "inventory_sale",
      total_price: 1000,
      quantity: 4,
      cost_price: 600,
    });
    expect(p.total_price).toBe(1000);
    expect(p.sale_price).toBe(250);
    expect(p.profit).toBe(400);
    expect(p.commission_profit).toBeNull();
    expect(p.commission_received).toBeNull();
    expect(p.actual_commission_received).toBeNull();
  });

  it("long_term_project returns null profit when cost_price is null", () => {
    const p = computeSaleFinancialPatch({
      deal_type: "long_term_project",
      total_price: 900,
      quantity: 1,
      cost_price: null,
    });
    expect(p.profit).toBeNull();
  });

  it("brokerage_managed follows inventory rules (cost-aware profit, no commissions)", () => {
    const p = computeSaleFinancialPatch({
      deal_type: "brokerage_managed",
      total_price: 500,
      quantity: 2,
      cost_price: 300,
    });
    expect(p.sale_price).toBe(250);
    expect(p.profit).toBe(200);
    expect(p.commission_profit).toBeNull();
  });

  it("clamps qty ≤ 0 to 1 to avoid division-by-zero", () => {
    const p = computeSaleFinancialPatch({
      deal_type: "inventory_sale",
      total_price: 500,
      quantity: 0,
      cost_price: 100,
    });
    expect(p.sale_price).toBe(500);
    expect(p.profit).toBe(400);
  });

  it("SAFE TYPES: NaN / Infinity / null collapse to 0", () => {
    const p = computeSaleFinancialPatch({
      deal_type: "inventory_sale",
      total_price: Number.NaN,
      quantity: null,
      cost_price: Number.POSITIVE_INFINITY,
    });
    expect(p.total_price).toBe(0);
    expect(p.sale_price).toBe(0);
    expect(p.profit).toBeNull(); // cost was non-finite → null
  });

  it("total_price is clamped to ≥ 0", () => {
    const p = computeSaleFinancialPatch({
      deal_type: "inventory_sale",
      total_price: -50,
      quantity: 1,
      cost_price: 10,
    });
    expect(p.total_price).toBe(0);
  });
});
