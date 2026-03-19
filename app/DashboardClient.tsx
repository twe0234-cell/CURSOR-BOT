"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { searchByScribeCode, type ScribeSearchResult } from "@/app/actions/scribeSearch";
import { SearchIcon, Radio, UserPlus, ShoppingCart, Plus, Package } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type {
  DashboardKpis,
  MonthlyDataPoint,
  InventoryDistributionItem,
  RecentInventoryItem,
} from "@/app/actions/dashboard";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

type Props = {
  kpis: DashboardKpis | null;
  chartData: MonthlyDataPoint[];
  inventoryDistribution: InventoryDistributionItem[];
  recentInventory: RecentInventoryItem[];
};

export default function DashboardClient({
  kpis,
  chartData,
  inventoryDistribution,
  recentInventory,
}: Props) {
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

  const kpiCards = [
    {
      label: "שווי מלאי נוכחי",
      value: kpis?.totalInventoryValue ?? 0,
      suffix: "₪",
    },
    {
      label: "צפי הכנסות",
      value: kpis?.expectedRevenue ?? 0,
      suffix: "₪",
    },
    {
      label: "השקעות פתוחות",
      value: kpis?.activeInvestmentsBalance ?? 0,
      suffix: "₪",
    },
    {
      label: "מכירות החודש",
      value: kpis?.monthlySales ?? 0,
      suffix: "₪",
    },
  ];

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <motion.div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {kpiCards.map((card) => (
          <motion.div key={card.label} variants={itemVariants}>
            <motion.div
              whileHover={{ y: -5, boxShadow: "0px 10px 20px rgba(0,0,0,0.05)" }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
                <CardContent className="pt-6">
                <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                <p className="mt-1 text-2xl font-bold text-sky-700">
                  {card.value.toLocaleString("he-IL")} {card.suffix}
                </p>
              </CardContent>
            </Card>
            </motion.div>
          </motion.div>
        ))}
      </motion.div>

      {/* Monthly Net Profit */}
      {kpis && (
        <motion.div variants={itemVariants} initial="hidden" animate="visible">
          <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-muted-foreground">רווח נקי חודשי</p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  kpis.monthlyNetProfit < 0 ? "text-red-600" : "text-sky-700"
                }`}
              >
                {kpis.monthlyNetProfit.toLocaleString("he-IL")} ₪
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {kpis && kpis.cashFlowRequired.length > 0 && (
        <Card className="rounded-2xl border-amber-100 bg-white shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">
              תזרים – סכום נדרש בעו״ש עד תאריך סיום הכתיבה
            </p>
            <p className="mt-1 mb-3 text-xs text-muted-foreground">
              יתרת תשלומים לסופרים שטרם שולמה – יש להבטיח זמינות בעו״ש
            </p>
            <ul className="max-h-40 space-y-2 overflow-y-auto">
              {kpis.cashFlowRequired.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {inv.scribe_name ?? "—"} • {inv.item_details ?? "—"}
                  </span>
                  <span className="shrink-0 font-medium text-left">
                    {inv.remaining_balance.toLocaleString("he-IL")} ₪
                    {inv.target_date ? ` עד ${new Date(inv.target_date).toLocaleDateString("he-IL")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inventory Distribution Pie */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
            <CardContent className="pt-6">
              <h3 className="mb-4 text-base font-semibold text-sky-700">התפלגות מלאי</h3>
              <div className="h-[280px] w-full">
                {inventoryDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={inventoryDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {inventoryDistribution.map((entry, i) => (
                          <Cell key={i} fill={entry.fill ?? "#0ea5e9"} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [v, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    אין נתונים להצגה
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Financial Flow Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
            <CardContent className="pt-6">
              <h3 className="mb-4 text-base font-semibold text-sky-700">
                תזרים פיננסי (6 חודשים אחרונים)
              </h3>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v} ₪`} />
                    <Tooltip
                      formatter={(v) => [(v != null ? Number(v) : 0).toLocaleString("he-IL") + " ₪", ""]}
                    />
                    <Legend />
                    <Bar dataKey="income" name="הכנסות" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="הוצאות" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <CardContent className="pt-6">
            <h3 className="mb-4 text-base font-semibold text-sky-700">פעילות אחרונה</h3>
            {recentInventory.length > 0 ? (
              <ul className="space-y-3">
                {recentInventory.map((item, i) => (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.05 }}
                    className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3"
                  >
                    <div className="flex size-10 items-center justify-center rounded-lg bg-amber-100 text-amber-500">
                      <Plus className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sky-700">
                        {item.product_category ?? "פריט"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString("he-IL")
                          : ""}
                      </p>
                    </div>
                    <Link href="/inventory">
                      <Package className="size-4 text-sky-600" />
                    </Link>
                  </motion.li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">אין פעילות אחרונה</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/whatsapp">
          <Button className="rounded-xl bg-sky-600 hover:bg-sky-700">
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
      <Card className="mb-8 rounded-2xl border border-slate-100">
        <CardContent className="p-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">חיפוש מק״ט סופר</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="#121 או טקסט מהערות פנימיות"
                className="rounded-xl pr-10"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {loading ? "מחפש..." : "חפש"}
            </button>
          </div>
          {results !== null && (
            <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
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
                      <p className="font-mono font-medium text-sky-700">{r.scribe_code}</p>
                    )}
                    {r.internal_notes && (
                      <p className="mt-1 text-slate-700">{r.internal_notes}</p>
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
