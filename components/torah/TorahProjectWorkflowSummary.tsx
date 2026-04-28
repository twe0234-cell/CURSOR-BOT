"use client";

import {
  AlertTriangle,
  Activity,
  BadgeDollarSign,
  ClipboardList,
  ScrollText,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TorahProjectWorkflowSummaryData } from "@/app/torah/[id]/actions";
import type {
  CommercialStatus,
  ProductionStatus,
  TaggingStatus,
  TorahProjectDetailView,
  TorahSheetGridRow,
} from "@/src/lib/types/torah";
import {
  COMMERCIAL_STATUS_LABELS,
  PRODUCTION_STATUS_LABELS,
  TAGGING_STATUS_LABELS,
  TORAH_SHEET_STATUS_LABELS,
} from "@/src/lib/types/torah";
import { buildTorahWorkflowPlan } from "@/src/services/torahWorkflowConfig";

type Props = {
  project: TorahProjectDetailView;
  sheets: TorahSheetGridRow[];
  summary: TorahProjectWorkflowSummaryData;
};

function formatShekels(value: number | null | undefined): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 }).format(Number(value ?? 0));
}

function statusLabel<T extends string>(
  labels: Record<T, string>,
  value: T | null | undefined,
  fallback = "לא הוגדר"
): string {
  return value && value in labels ? labels[value] : fallback;
}

function MetricCard({
  label,
  value,
  helper,
  tone = "slate",
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "slate" | "emerald" | "amber" | "red" | "sky";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3",
        tone === "slate" && "border-slate-200 bg-white",
        tone === "emerald" && "border-emerald-200 bg-emerald-50/70",
        tone === "amber" && "border-amber-200 bg-amber-50/80",
        tone === "red" && "border-red-200 bg-red-50/70",
        tone === "sky" && "border-sky-200 bg-sky-50/80"
      )}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{value}</p>
      {helper && <p className="mt-1 text-[11px] leading-5 text-slate-500">{helper}</p>}
    </div>
  );
}

export function TorahProjectWorkflowSummary({ project, sheets, summary }: Props) {
  const budget = summary.budget;
  const pace = summary.pace;
  const calculator = summary.calculatorVariance;

  const contractTotal = budget?.contract_price ?? project.total_agreed_price;
  const receivedFromCustomer =
    budget != null
      ? Math.max(budget.actual_income - budget.actual_refunds, 0)
      : project.amount_paid_by_client;
  const customerBalance = Math.max(contractTotal - receivedFromCustomer, 0);
  const actualCashflow = budget?.realized_profit ?? null;
  const otherCost =
    budget != null
      ? Math.max(
          budget.actual_total_cost -
            budget.actual_scribe -
            budget.actual_parchment -
            budget.actual_proofreading,
          0
        )
      : null;

  const writtenLikeStatuses = new Set(["written", "reported_written", "received", "in_qa", "needs_fixing", "approved", "sewn"]);
  const writtenSheets = sheets.filter((sheet) => writtenLikeStatuses.has(sheet.status)).length;
  const approvedOrSewnSheets = sheets.filter(
    (sheet) => sheet.status === "approved" || sheet.status === "sewn"
  ).length;
  const totalColumns = pace?.columns_total ?? sheets.reduce((sum, sheet) => sum + sheet.columns_count, 0);
  const writtenColumns =
    pace?.columns_written ??
    sheets.reduce(
      (sum, sheet) => sum + (writtenLikeStatuses.has(sheet.status) ? sheet.columns_count : 0),
      0
    );
  const progressPercent = totalColumns > 0 ? Math.min(100, (writtenColumns / totalColumns) * 100) : 0;
  const workflowPlan = buildTorahWorkflowPlan({
    gavraQaCount: project.gavra_qa_count,
    computerQaCount: project.computer_qa_count,
    requiresTagging: project.requires_tagging,
    taggingStatus: project.tagging_status,
  });
  const qaRoundCount = workflowPlan.filter((stage) => stage.kind === "qa").length;

  const scheduleWarnings = summary.paymentVariance.filter((row) => row.variance_amount > 0);
  const hasWarnings =
    summary.exceptions.length > 0 || scheduleWarnings.length > 0 || summary.sourceWarnings.length > 0;

  return (
    <Card className="mb-6 overflow-hidden rounded-3xl border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_36%),linear-gradient(135deg,#ffffff,#f8fafc)] shadow-sm">
      <CardContent className="p-4 sm:p-6" dir="rtl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-xs font-semibold text-sky-900">
              <ScrollText className="size-3.5" />
              מרכז עבודה יומי לפרויקט
            </div>
            <h2 className="text-xl font-bold text-slate-950">תמונת מצב מסחרית, ייצורית וכספית</h2>
            <p className="mt-1 text-sm text-slate-600">
              מקור כספי: views של ERP. הנתונים כאן לקריאה בלבד ואינם מחליפים פעולות קיימות.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700">
              מסחרי:{" "}
              {statusLabel(
                COMMERCIAL_STATUS_LABELS,
                project.commercial_status as CommercialStatus | undefined
              )}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700">
              ייצור:{" "}
              {statusLabel(
                PRODUCTION_STATUS_LABELS,
                project.production_status as ProductionStatus | undefined
              )}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700">
              תיוג:{" "}
              {statusLabel(TAGGING_STATUS_LABELS, project.tagging_status as TaggingStatus | undefined)}
            </span>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-sky-100 bg-white/85 p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ClipboardList className="size-5 text-sky-700" />
                <h3 className="font-semibold text-slate-900">מסלול עבודה מוגדר לפרויקט</h3>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                מוצג לפי ההגדרות הקיימות בפרויקט: תיוג, מספר הגהות גברא ומספר הגהות מחשב.
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                ניתן לערוך עכשיו את ספירות ה-QA ואת דרישת התיוג דרך כפתור "ערוך פרויקט" בראש הדף.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                עריכת פלואו: זמינה חלקית
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                גברא: {project.gavra_qa_count ?? 0}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                מחשב: {project.computer_qa_count ?? 0}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                תיוג: {project.requires_tagging ? "נדרש" : "לא נדרש"}
              </span>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {workflowPlan.map((stage) => (
              <div
                key={stage.id}
                className={cn(
                  "rounded-xl border p-3 text-sm",
                  stage.kind === "qa" && "border-amber-100 bg-amber-50/60",
                  stage.kind === "tagging" && "border-emerald-100 bg-emerald-50/60",
                  stage.kind === "sheet" && "border-slate-200 bg-slate-50"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900">
                    {stage.order}. {stage.labelHe}
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500">
                    {stage.kind === "qa" ? "QA" : stage.kind === "tagging" ? "תיוג" : "יריעה"}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{stage.helperHe}</p>
              </div>
            ))}
          </div>
          {qaRoundCount === 0 && (
            <p className="mt-3 rounded-xl border border-dashed border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
              לא מוגדרים סבבי QA בפרויקט הזה. אם זה לא מכוון, צריך לעדכן את הגדרת הפרויקט לפני עבודה שוטפת.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            הערה: סדר QA מפורט לפי פרויקט עדיין אינו נשמר בטבלה ייעודית; כרגע מוצגים סבבי גברא ולאחריהם סבבי מחשב לפי השדות הקיימים.
          </p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            עריכת פלואו עדיין לא זמינה ברמת שינוי סדר/שם שלב לכל סבב בנפרד.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="סך חוזה לקוח" value={formatShekels(contractTotal)} tone="sky" />
          <MetricCard
            label="התקבל מהלקוח"
            value={formatShekels(receivedFromCustomer)}
            helper={budget?.actual_refunds ? `כולל קיזוז החזרים: ${formatShekels(budget.actual_refunds)}` : undefined}
            tone="emerald"
          />
          <MetricCard
            label="יתרת לקוח"
            value={formatShekels(customerBalance)}
            tone={customerBalance > 0 ? "amber" : "emerald"}
          />
          <MetricCard
            label="תזרים/רווח ממומש"
            value={budget ? formatShekels(actualCashflow) : "אין מקור ERP"}
            helper="לפי realized_profit מתוך torah_project_budget_vs_actual"
            tone={(actualCashflow ?? 0) < 0 ? "red" : "emerald"}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white/85 p-4">
            <div className="mb-3 flex items-center gap-2">
              <BadgeDollarSign className="size-5 text-emerald-700" />
              <h3 className="font-semibold text-slate-900">עלויות ורווחיות</h3>
            </div>
            {budget ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard
                  label="עלות כתיבת סופר"
                  value={formatShekels(budget.actual_scribe)}
                  helper={`מתוכנן: ${formatShekels(budget.planned_scribe)}`}
                />
                <MetricCard
                  label="עלות קלף"
                  value={formatShekels(budget.actual_parchment)}
                  helper={`מתוכנן: ${formatShekels(budget.planned_parchment)}`}
                />
                <MetricCard
                  label="הגהות / תיוג / תפירה"
                  value={formatShekels(budget.actual_proofreading)}
                  helper={`מתוכנן הגהות: ${formatShekels(budget.planned_proofreading)}${
                    calculator ? ` · תיוג מוצע: ${formatShekels(calculator.quoted_tagging)}` : ""
                  }`}
                />
                <MetricCard
                  label="עלויות אחרות"
                  value={formatShekels(otherCost)}
                  helper={`סה"כ עלות בפועל: ${formatShekels(budget.actual_total_cost)}`}
                />
                <MetricCard
                  label="רווח צפוי"
                  value={formatShekels(budget.projected_profit)}
                  tone={budget.projected_profit < 0 ? "red" : "emerald"}
                />
                <MetricCard
                  label="רווח ממומש"
                  value={formatShekels(budget.realized_profit)}
                  helper={`סטיית עלות: ${formatShekels(budget.cost_variance)}`}
                  tone={budget.realized_profit < 0 ? "red" : "emerald"}
                />
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                אין עדיין נתוני תקציב מול ביצוע לפרויקט הזה.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/85 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="size-5 text-sky-700" />
              <h3 className="font-semibold text-slate-900">קצב והתקדמות</h3>
            </div>
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                <span>עמודות כתובות</span>
                <span className="tabular-nums">
                  {formatNumber(writtenColumns)} / {formatNumber(totalColumns)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={cn(
                    "h-full rounded-full",
                    pace?.pace_status === "behind" ? "bg-amber-500" : "bg-sky-600"
                  )}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="יריעות בכתיבה/הלאה" value={`${writtenSheets} / ${sheets.length}`} />
              <MetricCard label="יריעות מאושרות/תפורות" value={`${approvedOrSewnSheets} / ${sheets.length}`} />
              <MetricCard
                label="סטטוס קצב"
                value={pace?.pace_status === "behind" ? "באיחור" : pace?.pace_status ?? "לא חושב"}
                helper={pace ? `פער עמודות: ${formatNumber(pace.columns_behind)}` : undefined}
                tone={pace?.pace_status === "behind" ? "amber" : "sky"}
              />
              <MetricCard
                label="סטטוס יריעה נפוץ"
                value={
                  sheets[0]
                    ? TORAH_SHEET_STATUS_LABELS[
                        sheets.reduce((top, sheet) => {
                          const topCount = sheets.filter((row) => row.status === top.status).length;
                          const sheetCount = sheets.filter((row) => row.status === sheet.status).length;
                          return sheetCount > topCount ? sheet : top;
                        }, sheets[0]).status
                      ]
                    : "אין יריעות"
                }
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white/85 p-4">
            <div className="mb-3 flex items-center gap-2">
              <WalletCards className="size-5 text-amber-700" />
              <h3 className="font-semibold text-slate-900">גבייה ותשלומים מתוזמנים</h3>
            </div>
            {summary.paymentVariance.length > 0 ? (
              <div className="space-y-2">
                {summary.paymentVariance.map((row) => (
                  <div key={row.party} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-slate-800">{row.party}</span>
                      <span
                        className={cn(
                          "tabular-nums",
                          row.variance_amount > 0 ? "text-amber-700" : "text-emerald-700"
                        )}
                      >
                        פער: {formatShekels(row.variance_amount)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      צפוי עד עכשיו {formatShekels(row.expected_by_now)} · בפועל {formatShekels(row.actual_paid)}
                      {row.days_overdue > 0 ? ` · ${row.days_overdue} ימים באיחור` : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                אין לוח תשלומים או פערי תשלום להצגה.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/85 p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="size-5 text-red-700" />
              <h3 className="font-semibold text-slate-900">אזהרות וחריגות</h3>
            </div>
            {hasWarnings ? (
              <div className="space-y-2">
                {summary.exceptions.map((item) => (
                  <div key={`${item.exception_type}-${item.detected_at}`} className="rounded-xl border border-red-100 bg-red-50/70 p-3 text-sm">
                    <p className="font-medium text-red-900">{item.message}</p>
                    <p className="mt-1 text-xs text-red-700/80">
                      {item.severity} · {item.exception_type}
                    </p>
                  </div>
                ))}
                {scheduleWarnings.map((row) => (
                  <div key={`schedule-${row.party}`} className="rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-sm">
                    <p className="font-medium text-amber-900">
                      פער תשלום פתוח מול {row.party}: {formatShekels(row.variance_amount)}
                    </p>
                  </div>
                ))}
                {summary.sourceWarnings.map((warning) => (
                  <div key={warning} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    מקור נתונים לא זמין: {warning}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-800">
                אין חריגות פעילות לפרויקט לפי מקורות ה-ERP הזמינים.
              </div>
            )}
          </div>
        </div>

        {calculator && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 p-4 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <ClipboardList className="size-4 text-slate-600" />
              השוואה למחשבון נעול
            </div>
            <p className="mt-2">
              סה"כ הצעת מחשבון {formatShekels(calculator.quoted_total)} · סה"כ עלות בפועל{" "}
              {formatShekels(calculator.actual_total_cost)} · סטייה כוללת{" "}
              {formatShekels(calculator.total_variance)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
