import { createClient } from '@/lib/supabase/server'
import { summarizeMonth, getLatestAssetValues, calcNetWorth } from '@/lib/finance.logic'
import DashboardCharts from '@/components/dashboard/DashboardCharts'
import { TrendingUp, TrendingDown, Wallet, Landmark } from 'lucide-react'

function fmt(n: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1

  const fromDate = new Date(year, month - 13, 1).toISOString().split('T')[0]
  const [{ data: txs }, { data: assets }, { data: snapshots }] = await Promise.all([
    supabase.from('transactions').select('date,amount,category_id').eq('user_id', user.id).gte('date', fromDate).order('date'),
    supabase.from('assets').select('id,name,asset_type').eq('user_id', user.id),
    supabase.from('asset_snapshots').select('asset_id,value,snapshot_date').eq('user_id', user.id).order('snapshot_date', { ascending: false }),
  ])

  const thisMonth  = summarizeMonth(txs ?? [], year, month)
  const assetValues = getLatestAssetValues(snapshots ?? [])
  const netWorth   = calcNetWorth(assetValues)

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

  const kpis = [
    { label: 'הכנסות החודש',  value: fmt(thisMonth.income),   color: '#10b981', icon: TrendingUp },
    { label: 'הוצאות החודש',  value: fmt(thisMonth.expenses),  color: '#f43f5e', icon: TrendingDown },
    { label: 'מאזן נטו',      value: fmt(thisMonth.net),       color: thisMonth.net >= 0 ? '#10b981' : '#f43f5e', icon: Wallet },
    { label: 'שווי נקי כולל', value: fmt(netWorth),            color: '#818cf8', icon: Landmark },
  ]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <h1 className="text-2xl md:text-3xl font-extrabold">דאשבורד</h1>

      {/* KPI Cards — 2 cols on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {kpis.map(kpi => (
          <div key={kpi.label} className="card relative overflow-hidden group p-4 md:p-6">
            <div className="absolute top-0 right-0 w-1 h-full rounded-r-full" style={{ background: kpi.color }} />
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs md:text-sm font-medium" style={{ color: 'var(--color-muted)' }}>{kpi.label}</p>
                <div className="p-1.5 md:p-2 rounded-xl" style={{ background: `${kpi.color}20`, color: kpi.color }}>
                  <kpi.icon size={16} strokeWidth={2.5} />
                </div>
              </div>
              <p className="text-lg md:text-2xl font-bold truncate" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card">
        <h2 className="text-base md:text-lg font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="text-indigo-400" size={18} />
          <span>6 חודשים אחרונים</span>
        </h2>
        <DashboardCharts monthlyData={monthlyData} />
      </div>

      {/* Assets */}
      {(assets?.length ?? 0) > 0 && (
        <div className="card">
          <h2 className="text-base md:text-lg font-bold mb-3 flex items-center gap-2">
            <Landmark className="text-indigo-400" size={18} />
            <span>ריכוז נכסים</span>
          </h2>
          <div className="space-y-1">
            {assets!.map(a => (
              <div key={a.id} className="flex justify-between items-center py-2.5 px-3 table-row rounded-lg">
                <span className="text-sm font-medium">{a.name}</span>
                <span className="font-bold text-sm" style={{ color: '#818cf8' }}>
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
