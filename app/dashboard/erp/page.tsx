import { redirect } from "next/navigation";
import { AlertTriangle, BookOpen, Database, FileText } from "lucide-react";
import { createClient } from "@/src/lib/supabase/server";
import { BrandDashboardBanner } from "@/components/dashboard/BrandDashboardBanner";
import { BrandKpiCard } from "@/components/dashboard/BrandKpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fetchReadOnlyErpDashboard, type MonthlyBusinessDashboardRow } from "./actions";

const shekel = (value: number) => `${value.toLocaleString("he-IL")} ש״ח`;

function formatDate(value: string | null | undefined): string {
  if (!value) return "לא זמין";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMonth(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

function sourceLabel(value: string | null): string {
  const labels: Record<string, string> = {
    brokerage_book: "תיווך ספר",
    brokerage_scribe: "תיווך סופר",
    inventory_sale: "מכירת מלאי",
    managed_torah_project: "פרויקט ס״ת",
    writing_investment: "השקעת כתיבה",
  };
  return value ? labels[value] ?? value : "ללא שיוך";
}

function cashflowTone(value: number): string {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-700";
  return "text-muted-foreground";
}

function torahCashflowStatusLabel(value: string | null): string {
  const labels: Record<string, string> = {
    collected: "נגבה במלואו",
    partial_collection: "גבייה חלקית",
    uncollected: "טרם נגבה",
    no_contract: "ללא חוזה",
  };
  return value ? labels[value] ?? value : "לא ידוע";
}

function monthlyTotals(rows: MonthlyBusinessDashboardRow[]) {
  return rows.reduce(
    (acc, row) => ({
      total_income: acc.total_income + row.total_income,
      total_expenses: acc.total_expenses + row.total_expenses,
      net_cash_flow: acc.net_cash_flow + row.net_cash_flow,
      entry_count: acc.entry_count + row.entry_count,
    }),
    { total_income: 0, total_expenses: 0, net_cash_flow: 0, entry_count: 0 },
  );
}

export default async function ErpDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await fetchReadOnlyErpDashboard();
  if (!result.success) {
    return (
      <main className="container mx-auto max-w-6xl px-4 py-10" dir="rtl">
        <Card className="border-destructive/20">
          <CardContent className="pt-6 text-sm text-destructive">{result.error}</CardContent>
        </Card>
      </main>
    );
  }

  const { dashboard } = result;
  const netWorth = dashboard.netWorth;
  const totals = monthlyTotals(dashboard.monthlyCashflow);
  const timestamp = netWorth?.snapshot_at ?? dashboard.loadedAt;

  return (
    <main className="container mx-auto max-w-6xl space-y-8 px-4 py-10 sm:py-12" dir="rtl">
      <BrandDashboardBanner
        title="לוח ERP פיננסי"
        meta={
          <div className="space-y-1">
            <p>תצוגה read-only מתוך מקורות ה-DB של ERP foundation.</p>
            <p>עודכן: {formatDate(timestamp)}</p>
          </div>
        }
      />

      {dashboard.errors.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/70">
          <CardContent className="flex gap-3 pt-6 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">חלק ממקורות ה-dashboard לא נטענו.</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {dashboard.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">שווי עסקי משוער</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            מקור: `public.get_net_worth_snapshot()`. החישוב מציג מלאי, חובות פתוחים ורווח ממומש לפי הרשומות הזמינות.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <BrandKpiCard
            label="שווי נטו משוער"
            value={shekel(netWorth?.net_worth_estimate ?? 0)}
            tone="gold"
          />
          <BrandKpiCard
            label="עלות מלאי"
            value={shekel(netWorth?.inventory_cost_value ?? 0)}
            tone="ink"
            delay={0.04}
          />
          <BrandKpiCard
            label="יתרת פרויקטים"
            value={shekel(netWorth?.open_projects_receivable ?? 0)}
            tone="navy"
            delay={0.08}
          />
          <BrandKpiCard
            label="יתרת מכירות"
            value={shekel(netWorth?.open_sales_receivable ?? 0)}
            tone="navy"
            delay={0.12}
          />
          <BrandKpiCard
            label="רווח ממומש"
            value={shekel(netWorth?.realized_profit_total ?? 0)}
            tone="positive"
            delay={0.16}
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="size-5 text-accent" />
              תזרים חודשי
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              מקור: `public.monthly_business_dashboard`, מסודר מהחודש החדש לישן.
            </p>
          </CardHeader>
          <CardContent>
            {dashboard.monthlyCashflow.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                אין תנועות חודשיות להצגה.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">חודש</TableHead>
                    <TableHead className="text-right">סוג עסקה</TableHead>
                    <TableHead className="text-right">הכנסות</TableHead>
                    <TableHead className="text-right">הוצאות</TableHead>
                    <TableHead className="text-right">נטו</TableHead>
                    <TableHead className="text-right">רשומות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.monthlyCashflow.map((row) => (
                    <TableRow key={`${row.month}-${row.deal_type ?? "none"}`}>
                      <TableCell>{formatMonth(row.month)}</TableCell>
                      <TableCell>{sourceLabel(row.deal_type)}</TableCell>
                      <TableCell className="tabular-nums">{shekel(row.total_income)}</TableCell>
                      <TableCell className="tabular-nums">{shekel(row.total_expenses)}</TableCell>
                      <TableCell className={cn("font-semibold tabular-nums", cashflowTone(row.net_cash_flow))}>
                        {shekel(row.net_cash_flow)}
                      </TableCell>
                      <TableCell className="tabular-nums">{row.entry_count.toLocaleString("he-IL")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2}>סה״כ לתצוגה</TableCell>
                    <TableCell className="tabular-nums">{shekel(totals.total_income)}</TableCell>
                    <TableCell className="tabular-nums">{shekel(totals.total_expenses)}</TableCell>
                    <TableCell className={cn("font-semibold tabular-nums", cashflowTone(totals.net_cash_flow))}>
                      {shekel(totals.net_cash_flow)}
                    </TableCell>
                    <TableCell className="tabular-nums">{totals.entry_count.toLocaleString("he-IL")}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="size-5 text-accent" />
              חריגים עסקיים
            </CardTitle>
            <p className="text-sm text-muted-foreground">מקור: `public.business_exceptions`.</p>
          </CardHeader>
          <CardContent>
            {dashboard.businessExceptions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                לא זוהו חריגים עסקיים פעילים.
              </p>
            ) : (
              <div className="space-y-3">
                {dashboard.businessExceptions.map((item, index) => {
                  const isHigh = item.severity === "error";
                  return (
                    <div
                      key={`${item.exception_type}-${item.entity_id ?? index}`}
                      className={cn(
                        "rounded-xl border p-3 text-sm",
                        isHigh ? "border-red-200 bg-red-50/70" : "border-amber-200 bg-amber-50/70",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={cn("font-semibold", isHigh ? "text-red-800" : "text-amber-900")}>
                          {item.exception_type}
                        </span>
                        <span className="rounded-full border border-current/20 px-2 py-0.5 text-xs">
                          {item.severity}
                        </span>
                      </div>
                      <p className="mt-2 text-foreground">{item.message ?? "חריג ללא תיאור"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.entity_label ?? item.entity_type ?? "ישות לא מזוהה"} · {formatDate(item.detected_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-2xl border-border/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="size-5 text-accent" />
            תנועות ledger אחרונות
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            מקור: `public.ledger_entries`. פאנל traceability בלבד, ללא פעולות עריכה.
          </p>
        </CardHeader>
        <CardContent>
          {dashboard.recentLedgerEntries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              אין תנועות ledger להצגה.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">תאריך</TableHead>
                  <TableHead className="text-right">מקור</TableHead>
                  <TableHead className="text-right">קטגוריה</TableHead>
                  <TableHead className="text-right">כיוון</TableHead>
                  <TableHead className="text-right">סכום</TableHead>
                  <TableHead className="text-right">שיוך</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.recentLedgerEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDate(entry.entry_date)}</TableCell>
                    <TableCell>{entry.source_type}</TableCell>
                    <TableCell>{entry.category}</TableCell>
                    <TableCell>{entry.direction === "in" ? "נכנס" : "יוצא"}</TableCell>
                    <TableCell className={cn("font-semibold tabular-nums", entry.direction === "in" ? "text-emerald-700" : "text-red-700")}>
                      {shekel(entry.amount)}
                    </TableCell>
                    <TableCell>{sourceLabel(entry.deal_type)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="size-5 text-accent" />
            Snapshot פיננסי — פרויקטי ס״ת
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            מקור: `public.torah_financial_dashboard_snapshot` עם סינון מפורש לפי `user_id`.
          </p>
        </CardHeader>
        <CardContent>
          {dashboard.torahFinancialSnapshot.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              אין כרגע נתוני פרויקטים להצגה.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">פרויקט</TableHead>
                  <TableHead className="text-right">לקוח</TableHead>
                  <TableHead className="text-right">סטטוס מסחרי</TableHead>
                  <TableHead className="text-right">סטטוס ייצור</TableHead>
                  <TableHead className="text-right">חוזה</TableHead>
                  <TableHead className="text-right">התקבל</TableHead>
                  <TableHead className="text-right">עלות בפועל</TableHead>
                  <TableHead className="text-right">רווח צפוי</TableHead>
                  <TableHead className="text-right">רווח ממומש</TableHead>
                  <TableHead className="text-right">מצב תזרים</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.torahFinancialSnapshot.map((row) => (
                  <TableRow key={row.project_id}>
                    <TableCell className="font-medium">{row.project_label ?? "ללא שם"}</TableCell>
                    <TableCell>{row.customer_label ?? "ללא לקוח"}</TableCell>
                    <TableCell>{row.commercial_status ?? "—"}</TableCell>
                    <TableCell>{row.production_status ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{shekel(row.contract_amount)}</TableCell>
                    <TableCell className="tabular-nums">{shekel(row.received_amount)}</TableCell>
                    <TableCell className="tabular-nums">{shekel(row.actual_cost)}</TableCell>
                    <TableCell className={cn("tabular-nums", cashflowTone(row.expected_profit))}>
                      {shekel(row.expected_profit)}
                    </TableCell>
                    <TableCell className={cn("tabular-nums font-semibold", cashflowTone(row.realized_profit))}>
                      {shekel(row.realized_profit)}
                    </TableCell>
                    <TableCell>{torahCashflowStatusLabel(row.cashflow_status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
