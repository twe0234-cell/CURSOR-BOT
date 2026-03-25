/**
 * GET /api/dashboard
 *
 * Returns the four core financial metrics for the ERP dashboard:
 *
 *  cash_on_hand              — net realized cash position (all erp_payments)
 *  active_debt_collection    — Accounts Receivable: what buyers still owe us
 *  active_supplier_debt      — Accounts Payable: what we owe scribes NOW (delivered, unpaid)
 *  escrow_future_commitments — reserved cash for in-progress scribe projects (not yet delivered)
 *
 * All amounts in ₪. Arithmetic follows the SAME rules as crm.logic.ts:
 *  - classifyDealBalance decides actual_debt vs future_commitment for investments.
 *  - No profit engine logic here — profit stays in PostgreSQL (rebuild_sale_ledger).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { classifyDealBalance } from "@/src/services/crm.logic";

export type DashboardMetrics = {
  cash_on_hand: number;
  active_debt_collection: number;
  active_supplier_debt: number;
  escrow_future_commitments: number;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "יש להתחבר" }, { status: 401 });
    }

    // Fetch the three source tables in parallel.
    const [paymentsRes, salesRes, investmentsRes] = await Promise.all([
      // All erp_payments — used to compute net cash position.
      supabase
        .from("erp_payments")
        .select("amount, direction")
        .eq("user_id", user.id),

      // All sales — used for A/R (buyer outstanding balances).
      // We include the raw amount_paid from erp_sales; extra ledger payments
      // are already reflected in erp_payments (direction=incoming, entity_type=sale).
      // To avoid double-counting we derive A/R purely from erp_sales.amount_paid here.
      supabase
        .from("erp_sales")
        .select("sale_price, quantity, total_price, amount_paid")
        .eq("user_id", user.id),

      // All non-cancelled investments — used for A/P and escrow.
      supabase
        .from("erp_investments")
        .select("total_agreed_price, amount_paid, status")
        .eq("user_id", user.id)
        .neq("status", "cancelled"),
    ]);

    // ── cash_on_hand ──────────────────────────────────────────────────────────
    // Net of all incoming (+) and outgoing (−) payments ever recorded.
    const cashOnHand = (paymentsRes.data ?? []).reduce((acc, p) => {
      const amt = Number(p.amount ?? 0);
      return acc + (p.direction === "incoming" ? amt : -amt);
    }, 0);

    // ── active_debt_collection (A/R) ──────────────────────────────────────────
    // Sum of outstanding buyer balances across all sales.
    // total = total_price ?? (sale_price × max(1, floor(quantity)))
    const activeDebtCollection = (salesRes.data ?? []).reduce((acc, s) => {
      const qty = Math.max(1, Math.floor(Number(s.quantity ?? 1)));
      const total =
        s.total_price != null
          ? Number(s.total_price)
          : Number(s.sale_price ?? 0) * qty;
      return acc + Math.max(0, total - Number(s.amount_paid ?? 0));
    }, 0);

    // ── active_supplier_debt (A/P) + escrow_future_commitments ───────────────
    // classifyDealBalance decides:
    //   "actual_debt"       → delivered, money owed NOW   → A/P
    //   "future_commitment" → in-progress, reserved ahead → escrow
    let activeSupplierDebt = 0;
    let escrowFutureCommitments = 0;

    for (const inv of investmentsRes.data ?? []) {
      const remaining = Math.max(
        0,
        Number(inv.total_agreed_price ?? 0) - Number(inv.amount_paid ?? 0)
      );
      const cls = classifyDealBalance(remaining, inv.status);
      if (cls === "actual_debt") activeSupplierDebt += remaining;
      else if (cls === "future_commitment") escrowFutureCommitments += remaining;
    }

    const metrics: DashboardMetrics = {
      cash_on_hand: Math.round(cashOnHand * 100) / 100,
      active_debt_collection: Math.round(activeDebtCollection * 100) / 100,
      active_supplier_debt: Math.round(activeSupplierDebt * 100) / 100,
      escrow_future_commitments: Math.round(escrowFutureCommitments * 100) / 100,
    };

    return NextResponse.json(metrics);
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
