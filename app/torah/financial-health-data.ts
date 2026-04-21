import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import {
  computeTorahCollectionProgressPercent,
  computeTorahTheoreticalContractMargin,
  resolveTorahPlannedParchmentBudget,
  summarizeTorahLedger,
  sumTorahLedgerPayments,
  type TorahLedgerLine,
} from "@/src/services/crm.logic";
import type { TorahProjectWithNames } from "@/src/lib/types/torah";

export type TorahMonthlyCollectionBucket = { month: string; expected_amount: number };

export type TorahFinancialHealthPayload = {
  theoreticalProfitTotal: number;
  actualCashflowNet: number;
  collectionProgressPct: number | null;
  contractSum: number;
  /** Sum of explicit estimated_expenses_total column only (snapshot remainder added in-app). */
  estimatedExpensesColumnSum: number;
  budgetLeakBanners: string[];
  monthlyProjection: TorahMonthlyCollectionBucket[];
};

type LedgerAggRow = {
  project_id: string;
  transaction_type: string;
  amount: number;
};

function rollupLedgerByProject(rows: LedgerAggRow[]): Map<string, TorahLedgerLine[]> {
  const m = new Map<string, TorahLedgerLine[]>();
  for (const r of rows) {
    const pid = r.project_id;
    if (!pid) continue;
    const cur = m.get(pid) ?? [];
    cur.push({ transaction_type: r.transaction_type, amount: Number(r.amount ?? 0) });
    m.set(pid, cur);
  }
  return m;
}

function parchmentOverageHebrew(planned: number, actual: number): string | null {
  if (!(planned > 0) || !(actual > planned * 1.1)) return null;
  const over = actual - planned * 1.1;
  const amt = Math.max(0, over).toLocaleString("he-IL", { maximumFractionDigits: 0 });
  return `חריגת תקציב קלף: ${amt} ש״ח מעל המתוכנן`;
}

function lineOverageHebrew(
  label: string,
  planned: number,
  actual: number,
  ratio = 1.1
): string | null {
  if (!(planned > 0) || !(actual > planned * ratio)) return null;
  const over = actual - planned * ratio;
  const amt = Math.max(0, over).toLocaleString("he-IL", { maximumFractionDigits: 0 });
  return `חריגת תקציב ${label}: ${amt} ש״ח מעל המתוכנן`;
}

/**
 * Server-only aggregate for `/torah` financial health strip + chart.
 * Pass `projects` from `fetchTorahProjects()` to avoid a duplicate project query.
 */
export async function loadTorahFinancialHealthDashboard(
  projects: TorahProjectWithNames[]
): Promise<TorahFinancialHealthPayload | { error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "יש להתחבר" };

    const [ledgerView, rollupView, rpcProj] = await Promise.all([
      supabase.from("v_torah_user_ledger_cashflow").select("cash_in, cash_out").eq("user_id", user.id).maybeSingle(),
      supabase.from("v_torah_user_contract_rollups").select("contract_sum, estimated_expenses_column_sum").eq("user_id", user.id).maybeSingle(),
      supabase.rpc("get_torah_sales_collection_projection", { p_months: 18 }),
    ]);

    if (ledgerView.error) return { error: ledgerView.error.message };
    if (rollupView.error) return { error: rollupView.error.message };

    const cashIn = Number((ledgerView.data as { cash_in?: unknown })?.cash_in ?? 0);
    const cashOut = Number((ledgerView.data as { cash_out?: unknown })?.cash_out ?? 0);

    const contractSum = Number((rollupView.data as { contract_sum?: unknown })?.contract_sum ?? 0);
    const estimatedExpensesColumnSum = Number(
      (rollupView.data as { estimated_expenses_column_sum?: unknown })?.estimated_expenses_column_sum ?? 0
    );

    const projectIds = projects.map((p) => p.id);
    let ledgerByProject = new Map<string, TorahLedgerLine[]>();
    if (projectIds.length > 0) {
      const { data: txRows, error: txErr } = await supabase
        .from("torah_project_transactions")
        .select("project_id, transaction_type, amount")
        .in("project_id", projectIds);
      if (txErr) return { error: txErr.message };
      ledgerByProject = rollupLedgerByProject((txRows ?? []) as LedgerAggRow[]);
    }

    let monthlyProjection: TorahMonthlyCollectionBucket[] = [];
    if (!rpcProj.error) {
      const raw = rpcProj.data as unknown;
      if (Array.isArray(raw)) {
        monthlyProjection = (raw as { month?: string; expected_amount?: unknown }[]).map((r) => ({
          month: String(r.month ?? ""),
          expected_amount: Number(r.expected_amount ?? 0),
        }));
      }
    }

    return computeTorahFinancialHealthFromProjects(
      projects,
      ledgerByProject,
      cashIn,
      cashOut,
      contractSum,
      estimatedExpensesColumnSum,
      monthlyProjection
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** Used when the parent already fetched `fetchTorahProjects` — avoids duplicate project query. */
export function computeTorahFinancialHealthFromProjects(
  projects: TorahProjectWithNames[],
  ledgerByProject: Map<string, TorahLedgerLine[]>,
  cashIn: number,
  cashOut: number,
  contractSum: number,
  estimatedExpensesColumnSum: number,
  monthlyProjection: TorahMonthlyCollectionBucket[]
): TorahFinancialHealthPayload {
  const actualCashflowNet = cashIn - cashOut;

  let theoreticalProfitTotal = 0;
  for (const p of projects) {
    const m = computeTorahTheoreticalContractMargin({
      totalAgreedPrice: p.total_agreed_price,
      calculatorSnapshot: p.calculator_snapshot,
      estimatedExpensesTotal: p.estimated_expenses_total,
    });
    theoreticalProfitTotal += m.theoreticalMargin;
  }

  const collectionProgressPct = computeTorahCollectionProgressPercent({
    theoreticalProfitTotal,
    actualCashflowNet,
  });

  const budgetLeakBanners: string[] = [];
  for (const p of projects) {
    const lines = ledgerByProject.get(p.id) ?? [];
    const { totalParchmentExpense, totalQaExpense } = summarizeTorahLedger(lines);
    const { totalScribePayments } = sumTorahLedgerPayments(lines);

    const plannedParch = resolveTorahPlannedParchmentBudget({
      plannedParchmentBudgetColumn: p.planned_parchment_budget,
      calculatorSnapshot: p.calculator_snapshot,
    });

    const msgP = parchmentOverageHebrew(plannedParch, totalParchmentExpense);
    if (msgP) budgetLeakBanners.push(`${p.title}: ${msgP}`);

    const planScribe = Number(p.planned_scribe_budget ?? 0);
    const msgS = lineOverageHebrew("סופר", planScribe, totalScribePayments);
    if (msgS) budgetLeakBanners.push(`${p.title}: ${msgS}`);

    const planPr = Number(p.planned_proofreading_budget ?? 0);
    const msgQ = lineOverageHebrew("הגהות", planPr, totalQaExpense);
    if (msgQ) budgetLeakBanners.push(`${p.title}: ${msgQ}`);
  }

  return {
    theoreticalProfitTotal,
    actualCashflowNet,
    collectionProgressPct,
    contractSum,
    estimatedExpensesColumnSum,
    budgetLeakBanners,
    monthlyProjection,
  };
}
