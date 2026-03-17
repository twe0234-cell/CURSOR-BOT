"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { searchByScribeCode, type ScribeSearchResult } from "@/app/actions/scribeSearch";
import { SearchIcon, Radio, UserPlus, ShoppingCart } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { DashboardKpis, MonthlyDataPoint } from "@/app/actions/dashboard";

type Props = {
  kpis: DashboardKpis | null;
  chartData: MonthlyDataPoint[];
};

export default function DashboardClient({ kpis, chartData }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScribeSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const res = await searchByScribeCode(query);
    setLoading(false);
    if (res.success) {
      setResults(res.results);
    } else {
      setResults([]);
    }
  };

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl border-teal-100 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">סך שווי מלאי</p>
            <p className="mt-1 text-2xl font-bold text-teal-700">
              {kpis ? kpis.totalInventoryValue.toLocaleString("he-IL") : "—"} ₪
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-teal-100 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">רווח נקי חודשי</p>
            <p className={`mt-1 text-2xl font-bold ${kpis && kpis.monthlyNetProfit < 0 ? "text-red-600" : "text-teal-700"}`}>
              {kpis ? kpis.monthlyNetProfit.toLocaleString("he-IL") : "—"} ₪
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-teal-100 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">התחייבויות פתוחות</p>
            <p className="mt-1 text-2xl font-bold text-teal-700">
              {kpis ? kpis.activeInvestmentsBalance.toLocaleString("he-IL") : "—"} ₪
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Income vs Expenses Chart */}
      <Card className="rounded-2xl border-teal-100 shadow-sm">
        <CardContent className="pt-6">
          <h3 className="mb-4 text-base font-semibold text-teal-800">הכנסות מול הוצאות (6 חודשים אחרונים)</h3>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v} ₪`} />
                <Tooltip formatter={(v) => [(v != null ? Number(v) : 0).toLocaleString("he-IL") + " ₪", ""]} />
                <Legend />
                <Bar dataKey="income" name="הכנסות" fill="#0d9488" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="הוצאות" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/whatsapp">
          <Button className="rounded-xl bg-teal-600 hover:bg-teal-700">
            <Radio className="size-4 ml-2" />
            שידור חדש
          </Button>
        </Link>
        <Link href="/crm">
          <Button variant="outline" className="rounded-xl">
            <UserPlus className="size-4 ml-2" />
            סופר חדש
          </Button>
        </Link>
        <Link href="/sales">
          <Button variant="outline" className="rounded-xl">
            <ShoppingCart className="size-4 ml-2" />
            מכירה חדשה
          </Button>
        </Link>
      </div>

      {/* Scribe Search */}
      <Card className="mb-8 border-teal-100 rounded-2xl">
        <CardContent className="p-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            חיפוש מק״ט סופר
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="#121 או טקסט מהערות פנימיות"
                className="pr-10 rounded-xl"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {loading ? "מחפש..." : "חפש"}
            </button>
          </div>
          {results !== null && (
            <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground">לא נמצאו תוצאות</p>
              ) : (
                results.map((r, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-sm"
                  >
                    <span className="text-xs text-muted-foreground">
                      {r.source === "broadcast" ? "שידור" : "מלאי"}
                    </span>
                    {r.scribe_code && (
                      <p className="font-mono font-medium text-teal-700">{r.scribe_code}</p>
                    )}
                    {r.internal_notes && (
                      <p className="text-slate-700 mt-1">{r.internal_notes}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
