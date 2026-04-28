"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CircleDot,
  Package,
  ScrollText,
  Wrench,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { TorahProjectDetailView, TorahSheetGridRow, TorahSheetStatus } from "@/src/lib/types/torah";
import { TORAH_SHEET_STATUS_LABELS } from "@/src/lib/types/torah";
import {
  calculateTorahProjectFinancials,
  computeTorahProjectNetCashflowFromLedger,
  computeTorahTheoreticalContractMargin,
  estimateTorahProjectProfitability,
  extractPlannedOperationalBudgetFromSnapshot,
  isTorahParchmentBudgetOverThreshold,
  resolveTorahPlannedParchmentBudget,
  sumTorahLedgerPayments,
  summarizeTorahLedger,
  type TorahLedgerLine,
} from "@/src/services/crm.logic";
import {
  fetchTorahProjectSysEvents,
  fetchTorahProjectTransactions,
  type TorahSysEventView,
} from "./actions";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  project: TorahProjectDetailView;
  sheets: TorahSheetGridRow[];
};

function formatShekels(n: number): string {
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ₪`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function statusLabel(st: string | null): string {
  if (!st) return "—";
  const k = st as TorahSheetStatus;
  return TORAH_SHEET_STATUS_LABELS[k] ?? st;
}

function describeSysEvent(ev: TorahSysEventView): { title: string; subtitle?: string } {
  const meta = ev.metadata ?? {};

  switch (ev.action) {
    case "sheet_status_changed": {
      const sn =
        ev.sheet_number != null ? `יריעה ${ev.sheet_number}` : "יריעה (לא זוהתה)";
      const fromL = statusLabel(ev.from_state);
      const toL = statusLabel(ev.to_state);
      return {
        title: `מעבר סטטוס — ${sn}`,
        subtitle: `מ־${fromL} ל־${toL}`,
      };
    }
    case "sheet_columns_updated":
      return {
        title: `עדכון מספר עמודות — יריעה ${ev.sheet_number ?? "?"}`,
        subtitle: undefined,
      };
    case "qa_batch_created":
      return {
        title: "נוצרה שקית הגהה",
        subtitle: `מזהה סבב: ${shortId(ev.entity_id)}`,
      };
    case "sheet_assigned_to_qa_batch":
      return {
        title: `יריעה ${ev.sheet_number ?? "?"} שויכה לסבב QA`,
        subtitle: undefined,
      };
    case "qa_batch_returned": {
      const cost = meta.cost_recorded;
      const costNum =
        typeof cost === "number"
          ? cost
          : typeof cost === "string"
            ? Number(cost)
            : NaN;
      return {
        title: "סבב QA הוחזר (נסגר)",
        subtitle:
          Number.isFinite(costNum) && costNum > 0
            ? `עלות שנרשמה ביומן (לפי סבב): ${formatShekels(costNum)}`
            : `מזהה סבב: ${shortId(ev.entity_id)}`,
      };
    }
    case "fix_task_created":
      return {
        title: "נפתחה משימת תיקון",
        subtitle: `מזהה משימה: ${shortId(ev.entity_id)}`,
      };
    case "fix_task_completed": {
      const ac = meta.actual_cost;
      const n =
        typeof ac === "number" ? ac : typeof ac === "string" ? Number(ac) : NaN;
      return {
        title: "תיקון הושלם — ניכוי מהסופר",
        subtitle: Number.isFinite(n) && n >= 0 ? `סכום בפועל: ${formatShekels(n)}` : undefined,
      };
    }
    case "ledger_transaction_created": {
      const tt = typeof meta.transaction_type === "string" ? meta.transaction_type : "";
      const amt = typeof meta.amount === "number" ? meta.amount : Number(meta.amount ?? 0);
      return {
        title: "תנועה ביומן הפרויקט",
        subtitle: `${tt || "סוג"}${Number.isFinite(amt) ? ` · ${formatShekels(amt)}` : ""}`,
      };
    }
    case "payment_schedule_marked_paid":
      return {
        title: "מועד תשלום סומן כשולם",
        subtitle: undefined,
      };
    case "qa_batch_bulk_resolved_while_sent":
      return {
        title: "החלטה מהירה על שקית (במצב נשלח)",
        subtitle:
          ev.to_state === "approved"
            ? "כל היריעות אושרו"
            : ev.to_state === "needs_fixing"
              ? "כל היריעות סומנו לתיקון"
              : undefined,
      };
    default:
      return {
        title: ev.action,
        subtitle: `${ev.entity_type} · ${shortId(ev.entity_id)}`,
      };
  }
}

function eventIcon(ev: TorahSysEventView) {
  if (ev.entity_type === "torah_sheet" && ev.action === "sheet_columns_updated") {
    return ScrollText;
  }
  if (ev.action === "sheet_assigned_to_qa_batch" || ev.action.includes("qa_batch")) {
    return Package;
  }
  if (ev.entity_type.includes("qa") || ev.action.includes("qa")) {
    return Package;
  }
  if (ev.entity_type.includes("fix") || ev.action.includes("fix")) {
    return Wrench;
  }
  return CircleDot;
}

export function TorahOverviewTab({ projectId, project, sheets }: Props) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<TorahSysEventView[]>([]);
  const [ledgerLines, setLedgerLines] = useState<TorahLedgerLine[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [evRes, txRes] = await Promise.all([
      fetchTorahProjectSysEvents(projectId),
      fetchTorahProjectTransactions(projectId),
    ]);
    if (!evRes.success) {
      toast.error(evRes.error);
      setEvents([]);
    } else {
      setEvents(evRes.events);
    }
    if (!txRes.success) {
      toast.error(txRes.error);
      setLedgerLines([]);
    } else {
      setLedgerLines(
        txRes.transactions.map((t) => ({
          transaction_type: t.transaction_type,
          amount: t.amount,
        }))
      );
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const columnFin = useMemo(
    () => calculateTorahProjectFinancials(project.total_agreed_price, sheets),
    [project.total_agreed_price, sheets]
  );

  const { totalScribePayments } = useMemo(
    () => sumTorahLedgerPayments(ledgerLines),
    [ledgerLines]
  );

  const { totalFixDeduction, totalQaExpense, totalParchmentExpense, totalOtherExpense } = useMemo(
    () => summarizeTorahLedger(ledgerLines),
    [ledgerLines]
  );

  const netProfitEstimate = useMemo(
    () =>
      estimateTorahProjectProfitability({
        amountPaidByClient: project.amount_paid_by_client,
        amountPaidToScribe: project.amount_paid_to_scribe,
        ledgerLines,
      }),
    [project.amount_paid_by_client, project.amount_paid_to_scribe, ledgerLines]
  );

  const cashflow = useMemo(
    () => computeTorahProjectNetCashflowFromLedger(ledgerLines),
    [ledgerLines]
  );

  const theoretical = useMemo(
    () =>
      computeTorahTheoreticalContractMargin({
        totalAgreedPrice: project.total_agreed_price,
        calculatorSnapshot: project.calculator_snapshot,
        estimatedExpensesTotal: project.estimated_expenses_total,
      }),
    [project.total_agreed_price, project.calculator_snapshot, project.estimated_expenses_total]
  );

  const plannedParchment = useMemo(
    () =>
      resolveTorahPlannedParchmentBudget({
        plannedParchmentBudgetColumn: project.planned_parchment_budget,
        calculatorSnapshot: project.calculator_snapshot,
      }),
    [project.planned_parchment_budget, project.calculator_snapshot]
  );

  const plannedScribeBudget = useMemo(() => {
    const c = Number(project.planned_scribe_budget);
    if (Number.isFinite(c) && c > 0) return c;
    return extractPlannedOperationalBudgetFromSnapshot(project.calculator_snapshot).scribe;
  }, [project.planned_scribe_budget, project.calculator_snapshot]);

  const plannedProofreadingBudget = useMemo(() => {
    const c = Number(project.planned_proofreading_budget);
    if (Number.isFinite(c) && c > 0) return c;
    return extractPlannedOperationalBudgetFromSnapshot(project.calculator_snapshot).proofreading;
  }, [project.planned_proofreading_budget, project.calculator_snapshot]);

  const parchmentBudgetBreached = useMemo(
    () =>
      isTorahParchmentBudgetOverThreshold({
        plannedParchment,
        actualParchmentExpense: totalParchmentExpense,
      }),
    [plannedParchment, totalParchmentExpense]
  );

  const scribeBudgetBreached = useMemo(() => {
    if (!(plannedScribeBudget > 0)) return false;
    return totalScribePayments > plannedScribeBudget * 1.1;
  }, [plannedScribeBudget, totalScribePayments]);

  const proofreadingBudgetBreached = useMemo(() => {
    if (!(plannedProofreadingBudget > 0)) return false;
    return totalQaExpense > plannedProofreadingBudget * 1.1;
  }, [plannedProofreadingBudget, totalQaExpense]);

  const parchmentOverShekels = useMemo(() => {
    if (!parchmentBudgetBreached || !(plannedParchment > 0)) return null;
    const over = totalParchmentExpense - plannedParchment * 1.1;
    return Math.max(0, over);
  }, [parchmentBudgetBreached, plannedParchment, totalParchmentExpense]);

  const scribePlusMaterials = useMemo(
    () => totalScribePayments + totalParchmentExpense + totalOtherExpense,
    [totalScribePayments, totalParchmentExpense, totalOtherExpense]
  );

  const alertScribeNoApproved =
    project.amount_paid_to_scribe > 0 && columnFin.completedColumns === 0;

  const alertNegativeCashflow = cashflow.netCashPosition < 0;

  const alertNegativeExpectedProfit = netProfitEstimate < 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
          <Activity className="size-5 text-sky-600" />
          לוח בקרה פיננסי (קריאה בלבד)
        </h2>
        <p className="text-xs text-muted-foreground">
          מבוסס על חוזה הפרויקט ועל תנועות היומן. לעריכת תנועות עבור ללשונית «פיננסים ותקציב».
        </p>
      </div>

      {(alertScribeNoApproved ||
        alertNegativeCashflow ||
        alertNegativeExpectedProfit ||
        parchmentBudgetBreached ||
        scribeBudgetBreached ||
        proofreadingBudgetBreached) && (
        <div className="space-y-2">
          {parchmentBudgetBreached && parchmentOverShekels != null && (
            <div
              className={cn(
                "flex gap-2 rounded-xl border px-3 py-2.5 text-sm",
                "border-red-700 bg-red-100 text-red-950"
              )}
            >
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>
                חריגת תקציב קלף:{" "}
                {parchmentOverShekels.toLocaleString("he-IL", { maximumFractionDigits: 0 })} ש״ח מעל
                המתוכנן
              </span>
            </div>
          )}
          {scribeBudgetBreached && (
            <div
              className={cn(
                "flex gap-2 rounded-xl border px-3 py-2.5 text-sm",
                "border-red-700 bg-red-100 text-red-950"
              )}
            >
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>
                חריגת תקציב סופר: תשלומי סופר ביומן ({formatShekels(totalScribePayments)}) עולים על יותר
                מ־10% מהמתוכנן ({formatShekels(plannedScribeBudget)}).
              </span>
            </div>
          )}
          {proofreadingBudgetBreached && (
            <div
              className={cn(
                "flex gap-2 rounded-xl border px-3 py-2.5 text-sm",
                "border-red-700 bg-red-100 text-red-950"
              )}
            >
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>
                חריגת תקציב הגהות: הוצאות הגהה ביומן ({formatShekels(totalQaExpense)}) עולות על יותר
                מ־10% מהמתוכנן ({formatShekels(plannedProofreadingBudget)}).
              </span>
            </div>
          )}
          {alertScribeNoApproved && (
            <div
              className={cn(
                "flex gap-2 rounded-xl border px-3 py-2.5 text-sm",
                "border-amber-200 bg-amber-50 text-amber-950"
              )}
            >
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>
                יש תשלומים לסופר לפני אישור/תפירה מלאה. ודא שהתשלום תואם להסכם, קצב כתיבה או מקדמה מתוכננת.
              </span>
            </div>
          )}
          {alertNegativeCashflow && (
            <div
              className={cn(
                "flex gap-2 rounded-xl border px-3 py-2.5 text-sm",
                "border-amber-200 bg-amber-50 text-amber-950"
              )}
            >
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>
                תזרים שלילי לפי יומן התנועות: יצאו יותר מכסף שנכנס (לפי רישומים).
              </span>
            </div>
          )}
          {alertNegativeExpectedProfit && !alertScribeNoApproved && (
            <div
              className={cn(
                "flex gap-2 rounded-xl border px-3 py-2.5 text-sm",
                "border-orange-200 bg-orange-50 text-orange-950"
              )}
            >
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>רווח נטו משוער שלילי לפי נתוני הפרויקט והיומן.</span>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="rounded-xl border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">הכנסה ברוטו (חוזה לקוח)</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">
              {formatShekels(project.total_agreed_price)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">תשלומי סופר + הוצאות אחרות (חומרים וכו׳)</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">
              {formatShekels(scribePlusMaterials)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              סופר: {formatShekels(totalScribePayments)} · קלף: {formatShekels(totalParchmentExpense)} · אחר:{" "}
              {formatShekels(totalOtherExpense)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-amber-100 bg-amber-50/40">
          <CardContent className="p-4">
            <p className="text-xs text-amber-900 mb-1">הוצאות הגהה (מיומן)</p>
            <p className="text-xl font-bold tabular-nums text-amber-950">
              {formatShekels(totalQaExpense)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-violet-100 bg-violet-50/40">
          <CardContent className="p-4">
            <p className="text-xs text-violet-900 mb-1">ניכויי סופר — תיקונים</p>
            <p className="text-xl font-bold tabular-nums text-violet-950">
              {formatShekels(totalFixDeduction)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-indigo-100 bg-indigo-50/40">
          <CardContent className="p-4">
            <p className="text-xs text-indigo-900 mb-1">רווח תיאורטי (חוזה וצילום מחשבון)</p>
            <p className="text-xl font-bold tabular-nums text-indigo-950">
              {formatShekels(theoretical.theoreticalMargin)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              ערך מוסכם פחות עלויות מתוכננות (שדה כולל או צילום מחשבון) · קלף:{" "}
              {plannedParchment > 0 ? formatShekels(plannedParchment) : "לא הוגדר"}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-emerald-100 bg-emerald-50/30">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-emerald-900 font-medium">תזרים מזומנים בפועל (יומן)</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 text-emerald-800">
                <ArrowDownLeft className="size-4" />
                נכנס: {formatShekels(cashflow.totalCashIn)}
              </span>
              <span className="inline-flex items-center gap-1 text-red-800">
                <ArrowUpRight className="size-4" />
                יצא: {formatShekels(cashflow.totalCashOut)}
              </span>
            </div>
            <p
              className={cn(
                "text-lg font-bold tabular-nums",
                cashflow.netCashPosition >= 0 ? "text-emerald-800" : "text-red-700"
              )}
            >
              יתרה: {formatShekels(cashflow.netCashPosition)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              סנכרון שדות פרויקט: לקוח {formatShekels(project.amount_paid_by_client)} · סופר{" "}
              {formatShekels(project.amount_paid_to_scribe)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-sky-100 bg-sky-50/30">
          <CardContent className="p-4">
            <p className="text-xs text-sky-900 mb-1">רווח נטו לפי תשלומים ויומן</p>
            <p
              className={cn(
                "text-xl font-bold tabular-nums",
                netProfitEstimate >= 0 ? "text-sky-950" : "text-red-700"
              )}
            >
              {formatShekels(netProfitEstimate)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              שדות «שולם מלקוח/לסופר» ותנועות היומן (כולל ניכוי תיקון, QA, קלף) — לא זהה לתזרים
              מזומנים גולמי.
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
          <ScrollText className="size-5 text-slate-600" />
          ציר זמן (מערכת)
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          אירועים ממוינים מהחדש לישן — מעברי יריעות, סבבי QA ותיקונים.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">טוען ציר זמן...</p>
        ) : events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-muted-foreground">
            אין אירועים מתועדים לפרויקט זה (או שעדיין לא בוצעו פעולות דרך המנוע).
          </div>
        ) : (
          <div className="relative border-s border-slate-200 pr-4 mr-3 space-y-0">
            {events.map((ev, i) => {
              const { title, subtitle } = describeSysEvent(ev);
              const Icon = eventIcon(ev);
              return (
                <div key={ev.id} className="relative pb-6 last:pb-0">
                  <span
                    className="absolute -right-[21px] top-1 flex size-3 items-center justify-center rounded-full border-2 border-white bg-slate-300 ring-2 ring-slate-100"
                    aria-hidden
                  />
                  <div
                    className={cn(
                      "rounded-xl border bg-white px-3 py-2.5 shadow-sm",
                      i === 0 && "ring-1 ring-sky-100"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className="size-4 shrink-0 text-slate-500 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 leading-snug">{title}</p>
                        {subtitle && (
                          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                        )}
                        <p className="text-[11px] text-slate-400 mt-1.5 tabular-nums">
                          {formatDateTime(ev.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
