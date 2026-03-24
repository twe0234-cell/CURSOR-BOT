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
import { getDealFinancials, computeSaleProfit } from "./crm.logic";

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
    expect(result).toEqual({ totalCost: 0, totalPaid: 0, remainingBalance: 0 });
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
// 2. computeSaleProfit
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
