import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";
import { cn } from "@/lib/utils";
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
    { href: "/broadcast", label: "דיוור", icon: Radio, desc: "שליחת הודעות WhatsApp לנמענים" },
    { href: "/audience", label: "נמענים", icon: Users, desc: "נהל רשימת נמענים WhatsApp" },
    { href: "/email", label: "דיוור אימייל", icon: Mail, desc: "ייבוא אנשי קשר, קמפיינים וסטטיסטיקות" },
    { href: "/inventory", label: "מלאי", icon: Package, desc: "נהל מלאי מוצרים" },
    { href: "/sales", label: "מכירות ותזרים", icon: Wallet, desc: "מכירות והוצאות" },
    { href: "/investments", label: "תיק השקעות", icon: TrendingUp, desc: "פרויקטי כתיבה" },
    { href: "/torah", label: "פרויקטי ס״ת", icon: BookOpen, desc: "מעקב יריעות, הגהה וסטטוס" },
    { href: "/settings", label: "הגדרות", icon: Settings, desc: "Green API, Gmail והגדרות" },
  ];

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10 sm:py-12 min-h-screen">
      <div className="mb-8 sm:mb-10 animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2">
          ברוכים הבאים
        </h1>
        <p className="text-muted-foreground text-[15px]">
          מחובר כ־<span className="font-semibold text-primary">{user.email}</span>
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
        <Link href="/torah" className="block mt-8 group/torah">
          <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-5 flex items-center gap-5 sm:gap-6 card-interactive hover:border-accent/25">
            <div className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10 shrink-0 transition-colors group-hover/torah:bg-primary/15 group-hover/torah:ring-accent/20">
              <BookOpen className="size-7" strokeWidth={2.25} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">פרויקטי ספר תורה פעילים</p>
              <p className="text-2xl font-bold text-primary mt-0.5">{torahStats.activeProjects} פרויקטים</p>
              <p className="text-xs text-muted-foreground mt-1">
                {torahStats.approvedSheets} / {torahStats.totalSheets} יריעות אושרו · {torahStats.progressPct}% התקדמות
              </p>
            </div>
            <div className="shrink-0 text-left">
              <div className="text-3xl font-bold text-accent tabular-nums">{torahStats.progressPct}%</div>
              <div className="w-20 h-2 rounded-full bg-muted mt-1 overflow-hidden ring-1 ring-border/40">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-accent to-primary/80"
                  style={{ width: `${torahStats.progressPct}%` }}
                />
              </div>
            </div>
          </div>
        </Link>
      )}

      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 mt-8 sm:mt-10">
        {quickLinks.map(({ href, label, icon: Icon, desc }, i) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex items-center gap-4 rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-sm transition-all duration-300",
              "hover:border-primary/20 hover:shadow-[0_12px_40px_-12px_oklch(0.26_0.068_265_/_12%)] hover:-translate-y-0.5",
              `stagger-${Math.min(i + 1, 8)} animate-fade-in-up`
            )}
          >
            <div className="flex size-14 items-center justify-center rounded-xl bg-secondary text-primary ring-1 ring-border/40 transition-all duration-300 group-hover:bg-primary/8 group-hover:text-primary group-hover:ring-accent/30">
              <Icon className="size-7" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground group-hover:text-primary transition-colors">{label}</h2>
              <p className="text-sm text-muted-foreground leading-snug mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
