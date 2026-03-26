import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";
import { Radio, Settings, Users, Package, Mail, Wallet, TrendingUp, BookOpen } from "lucide-react";
import DashboardClient from "./DashboardClient";
import {
  fetchDashboardKpis,
  fetchIncomeExpensesChart,
  fetchInventoryDistribution,
  fetchRecentInventory,
  fetchCategoryCostRevenue,
  fetchMonthlyRealizedProfit,
  fetchTorahDashboardStats,
} from "./actions/dashboard";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [kpisRes, chartRes, invDistRes, recentRes, categoryCostRes, plRes, torahRes] = await Promise.all([
    fetchDashboardKpis(),
    fetchIncomeExpensesChart(),
    fetchInventoryDistribution(),
    fetchRecentInventory(),
    fetchCategoryCostRevenue(),
    fetchMonthlyRealizedProfit(),
    fetchTorahDashboardStats(),
  ]);

  const kpis = kpisRes.success ? kpisRes.kpis : null;
  const chartData = chartRes.success ? chartRes.data : [];
  const inventoryDistribution = invDistRes.success ? invDistRes.data : [];
  const recentInventory = recentRes.success ? recentRes.data : [];
  const categoryCostRevenue = categoryCostRes.success ? categoryCostRes.data : [];
  const monthlyRealizedProfit = plRes.success ? plRes.data : [];
  const torahStats = torahRes.success ? torahRes.stats : null;

  const quickLinks = [
    { href: "/broadcast", label: "שידור", icon: Radio, desc: "שלח הודעות WhatsApp לנמענים" },
    { href: "/audience", label: "נמענים", icon: Users, desc: "נהל רשימת נמענים WhatsApp" },
    { href: "/email", label: "דיוור אימייל", icon: Mail, desc: "ייבוא אנשי קשר, קמפיינים וסטטיסטיקות" },
    { href: "/inventory", label: "מלאי", icon: Package, desc: "נהל מלאי מוצרים" },
    { href: "/sales", label: "מכירות ותזרים", icon: Wallet, desc: "מכירות והוצאות" },
    { href: "/investments", label: "תיק השקעות", icon: TrendingUp, desc: "פרויקטי כתיבה" },
    { href: "/torah", label: "פרויקטי ס״ת", icon: BookOpen, desc: "מעקב ירייות, הגהה וסטטוס" },
    { href: "/settings", label: "הגדרות", icon: Settings, desc: "Green API, Gmail והגדרות" },
  ];

  return (
    <div className="container mx-auto max-w-5xl px-4 py-12 bg-sky-50/30 min-h-screen">
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-sky-700 mb-2">ברוכים הבאים!</h1>
        <p className="text-muted-foreground">
          מחובר כ־<span className="font-semibold text-sky-600">{user.email}</span>
        </p>
      </div>

      <DashboardClient
        kpis={kpis}
        chartData={chartData}
        inventoryDistribution={inventoryDistribution}
        recentInventory={recentInventory}
        categoryCostRevenue={categoryCostRevenue}
        monthlyRealizedProfit={monthlyRealizedProfit}
      />

      {torahStats && torahStats.activeProjects > 0 && (
        <Link href="/torah" className="block mt-8">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 flex items-center gap-6 hover:shadow-md transition-shadow">
            <div className="flex size-14 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 shrink-0">
              <BookOpen className="size-7" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-emerald-800">פרויקטי ספר תורה פעילים</p>
              <p className="text-2xl font-bold text-emerald-700">{torahStats.activeProjects} פרויקטים</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {torahStats.approvedSheets} / {torahStats.totalSheets} ירייות אושרו · {torahStats.progressPct}% התקדמות
              </p>
            </div>
            <div className="shrink-0 text-left">
              <div className="text-3xl font-bold text-emerald-600">{torahStats.progressPct}%</div>
              <div className="w-20 h-2 rounded-full bg-emerald-200 mt-1 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${torahStats.progressPct}%` }} />
              </div>
            </div>
          </div>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 mt-10">
        {quickLinks.map(({ href, label, icon: Icon, desc }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-all duration-200 hover:border-sky-200 hover:shadow-md hover:-translate-y-0.5"
          >
            <div className="flex size-14 items-center justify-center rounded-xl bg-amber-100 text-amber-500 transition-colors group-hover:bg-amber-200">
              <Icon className="size-7" />
            </div>
            <div>
              <h2 className="font-semibold text-sky-700 group-hover:text-sky-600">{label}</h2>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
