import { createClient } from '@/lib/supabase/server'
import { summarizeMonth, getLatestAssetValues, calcNetWorth } from '@/lib/finance.logic'
import DashboardCharts from '@/components/dashboard/DashboardCharts'
import AiInsightsPanel from '@/components/dashboard/AiInsightsPanel'
import { TrendingUp, TrendingDown, Wallet, Landmark } from 'lucide-react'

function fmt(n: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)
}

const KPI_STYLES = [
  {
    label: 'הכנסות החודש',
    gradFrom: '#10b981', gradTo: '#059669',
    bg: 'rgba(16,185,129,0.08)',
    iconBg: 'rgba(16,185,129,0.15)',
    iconColor: '#059669',
    textColor: '#059669',
    borderColor: 'rgba(16,185,129,0.3)',
    icon: TrendingUp,
  },
  {
    label: 'הוצאות החודש',
    gradFrom: '#f43f5e', gradTo: '#e11d48',
    bg: 'rgba(244,63,94,0.07)',
    iconBg: 'rgba(244,63,94,0.13)',
    iconColor: '#e11d48',
    textColor: '#e11d48',
    borderColor: 'rgba(244,63,94,0.25)',
    icon: TrendingDown,
  },
  {
    label: 'מאזן נטו',
    gradFrom: '#4f46e5', gradTo: '#7c3aed',
    bg: 'rgba(79,70,229,0.07)',
    iconBg: 'rgba(79,70,229,0.13)',
    iconColor: '#4f46e5',
    textColor: '#4f46e5',
    borderColor: 'rgba(79,70,229,0.2)',
    icon: Wallet,
  },
  {
    label: 'שווי נקי כולל',
    gradFrom: '#ec4899', gradTo: '#a855f7',
    bg: 'rgba(168,85,247,0.07)',
    iconBg: 'rgba(168,85,247,0.13)',
    iconColor: '#a855f7',
    textColor: '#7c3aed',
    borderColor: 'rgba(168,85,247,0.2)',
    icon: Landmark,
  },
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const fromDate = new Date(year, month - 13, 1).toISOString().split('T')[0]
  const [{ data: txs }, { data: assets }, { data: snapshots }, { data: recurring }] = await Promise.all([
    supabase.from('transactions').select('date,amount,category_id').eq('user_id', user.id).gte('date', fromDate).order('date'),
    supabase.from('assets').select('id,name,asset_type').eq('user_id', user.id),
    supabase.from('asset_snapshots').select('asset_id,value,snapshot_date').eq('user_id', user.id).order('snapshot_date', { ascending: false }),
    supabase.from('recurring_expenses').select('amount,start_date,end_date,frequency').eq('user_id', user.id),
  ])

  const thisMonth = summarizeMonth(txs ?? [], year, month)
  const assetValues = getLatestAssetValues(snapshots ?? [])
  const netWorth = calcNetWorth(assetValues)
  const _ = recurring

  const kpiValues = [thisMonth.income, thisMonth.expenses, thisMonth.net, netWorth]

  // Monthly chart data (last 6 months)
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(year, month - 1 - (5 - i), 1)
    const y = d.getFullYear(), m = d.getMonth() + 1
    const s = summarizeMonth(txs ?? [], y, m)
    return {
      name: d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' }),
      הכנסות: s.income,
      הוצאות: s.expenses,
      נטו: s.net,
    }
  })

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold" style={{ color: 'var(--color-text)' }}>דאשבורד</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
            {now.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' }}>
          <span className="pulse-dot" />
          <span>מעודכן</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {KPI_STYLES.map((style, i) => {
          const val = kpiValues[i]
          const isNeg = val < 0
          const Icon = style.icon
          return (
            <div key={style.label}
              className="card relative overflow-hidden group cursor-default"
              style={{ background: style.bg, borderColor: style.borderColor }}>
              {/* Gradient top border */}
              <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl"
                style={{ background: `linear-gradient(90deg, ${style.gradFrom}, ${style.gradTo})` }} />
              
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: style.iconColor, opacity: 0.8 }}>
                    {style.label}
                  </p>
                  <p className="text-2xl font-extrabold truncate"
                    style={{ color: isNeg && i === 2 ? '#e11d48' : style.textColor }}>
                    {fmt(val)}
                  </p>
                </div>
                <div className="p-2.5 rounded-2xl flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
                  style={{ background: style.iconBg }}>
                  <Icon size={22} style={{ color: style.iconColor }} strokeWidth={2.5} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Charts - takes up 2 columns on desktop */}
        <div className="lg:col-span-2 card">
          <h2 className="text-base font-bold mb-5 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
            <TrendingUp size={18} style={{ color: 'var(--color-accent)' }} />
            <span>6 חודשים אחרונים</span>
          </h2>
          <DashboardCharts monthlyData={monthlyData} />
        </div>

        {/* AI Insights - takes up 1 column on desktop */}
        <div className="lg:col-span-1">
          <AiInsightsPanel />
        </div>
      </div>

      {/* Assets summary */}
      {(assets?.length ?? 0) > 0 && (
        <div className="card">
          <h2 className="text-base font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
            <Landmark size={18} style={{ color: '#a855f7' }} />
            <span>ריכוז נכסים</span>
          </h2>
          <div className="space-y-1">
            {assets!.map(a => (
              <div key={a.id} className="flex justify-between items-center py-2.5 px-3 table-row rounded-lg">
                <span className="font-semibold text-sm">{a.name}</span>
                <span className="font-bold text-sm" style={{ color: 'var(--color-accent)' }}>
                  {fmt(assetValues[a.id] ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
