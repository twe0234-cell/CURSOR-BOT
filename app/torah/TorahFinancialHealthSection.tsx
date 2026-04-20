"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import type { TorahFinancialHealthPayload } from "./financial-health-data";

function formatShekels(n: number): string {
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 0 })} ₪`;
}

type Props = {
  data: TorahFinancialHealthPayload | null;
  /** When views/RPC are missing (migration not applied) or query failed */
  error?: string | null;
};

export function TorahFinancialHealthSection({ data, error }: Props) {
  const chartData = useMemo(
    () =>
      (data?.monthlyProjection ?? []).map((r) => ({
        month: r.month,
        label: r.month.replace(/^\d{4}-/, ""),
        expected_amount: Number(r.expected_amount) || 0,
      })),
    [data?.monthlyProjection]
  );

  if (error) {
    return (
      <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">לוח בריאות פיננסית — לא נטען</p>
        <p className="text-xs mt-1 text-amber-900/90">{error}</p>
        <p className="text-[11px] mt-2 text-amber-800/80">
          ודא שהוחלה מיגרציה 075 (תצוגות ו־RPC לתזרים צפוי ממכירות).
        </p>
      </div>
    );
  }

  if (!data) return null;

  const coll = data.collectionProgressPct;

  return (
    <section className="mb-10 space-y-5" dir="rtl">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 tracking-tight">בריאות פיננסית ורווחיות</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          מבוסס על יומן פרויקטי ס״ת (כולל הוצאות קלף), חוזים ותאריכי גבייה צפויים במכירות
        </p>
      </div>

      {data.budgetLeakBanners.length > 0 && (
        <div className="space-y-2">
          {data.budgetLeakBanners.map((b, i) => (
            <div
              key={i}
              className="rounded-xl border border-red-700 bg-red-100 px-3 py-2.5 text-sm text-red-950"
            >
              {b}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <CardContent className="p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              רווח תיאורטי
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
              {formatShekels(data.theoreticalProfitTotal)}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              סכום חוזי לקוח פחות עלויות מתוכננות (עמודה או צילום מחשבון)
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-emerald-200/70 bg-gradient-to-b from-emerald-50/50 to-white shadow-sm">
          <CardContent className="p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-900/80">
              תזרים בפועל
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-950">
              {formatShekels(data.actualCashflowNet)}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-emerald-900/70">
              תשלומי לקוח מהיומן פחות כל היציאות (סופר, הגהה, קלף ושונות)
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-sky-200/70 bg-gradient-to-b from-sky-50/40 to-white shadow-sm">
          <CardContent className="p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-sky-900/80">
              סטטוס גבייה
            </p>
            {coll == null ? (
              <p className="mt-3 text-sm text-muted-foreground">אין בסיס רווח תיאורטי חיובי להשוואה</p>
            ) : (
              <>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-sky-950">
                  {coll.toLocaleString("he-IL", { maximumFractionDigits: 1 })}%
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-sky-100">
                  <div
                    className="h-full rounded-full bg-sky-600 transition-all duration-500"
                    style={{ width: `${Math.min(100, coll)}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-sky-900/70">
                  חלק מהרווח התיאורטי שהומר לתזרים נטו בפועל
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <CardContent className="p-5">
          <p className="text-sm font-semibold text-slate-800">תזרים צפוי לפי מכירות</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 mb-4">
            יתרות לגבייה לפי חודש של{" "}
            <span className="font-mono text-[10px]">expected_payment_date</span> ב־erp_sales
          </p>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">אין מכירות עם תאריך צפוי בטווח</p>
          ) : (
            <div className="h-56 w-full min-w-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={(v) => `${v}`} />
                  <Tooltip
                    formatter={(value) => [
                      formatShekels(Number(value ?? 0)),
                      "צפי גבייה",
                    ]}
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                  />
                  <Bar dataKey="expected_amount" fill="#0ea5e9" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
