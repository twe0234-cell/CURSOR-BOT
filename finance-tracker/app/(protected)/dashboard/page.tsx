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

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  // Fetch last 12 months of transactions
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

  const _ = recurring // used for future forecast

  const kpis = [
    { label: 'הכנסות החודש',  value: fmt(thisMonth.income),   color: '#10b981', bg: '#d1fae5', icon: TrendingUp },
    { label: 'הוצאות החודש',  value: fmt(thisMonth.expenses),  color: '#f43f5e', bg: '#ffe4e6', icon: TrendingDown },
    { label: 'מאזן נטו',      value: fmt(thisMonth.net),       color: thisMonth.net >= 0 ? '#10b981' : '#f43f5e', bg: thisMonth.net >= 0 ? '#d1fae5' : '#ffe4e6', icon: Wallet },
    { label: 'שווי נקי כולל', value: fmt(netWorth),            color: '#4f46e5', bg: '#e0e7ff', icon: Landmark },
  ]

  return (
    <div className="space-y-6 animate-fade-in-up">
      <h1 className="text-3xl font-extrabold" style={{ color: 'var(--color-text)' }}>דאשבורד</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        {kpis.map(kpi => (
          <div key={kpi.label} className="card relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-2 h-full" style={{ background: kpi.color }}></div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm mb-1 font-medium" style={{ color: 'var(--color-muted)' }}>{kpi.label}</p>
                <p className="text-3xl font-bold" style={{ color: 'var(--color-text)' }}>{kpi.value}</p>
              </div>
              <div className="p-3 rounded-2xl transition-transform group-hover:scale-110" style={{ background: kpi.bg, color: kpi.color }}>
                <kpi.icon size={26} strokeWidth={2.5} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="card">
        <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
          <TrendingUp className="text-indigo-500" size={20} />
          <span>6 חודשים אחרונים</span>
        </h2>
        <div style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.05))' }}>
          <DashboardCharts monthlyData={monthlyData} />
        </div>
      </div>

      {/* Assets summary */}
      {(assets?.length ?? 0) > 0 && (
        <div className="card">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Landmark className="text-indigo-500" size={20} />
            <span>ריכוז נכסים</span>
          </h2>
          <div className="space-y-1">
            {assets!.map(a => (
              <div key={a.id} className="flex justify-between items-center py-3 px-4 table-row rounded-lg">
                <span className="font-medium">{a.name}</span>
                <span className="font-bold text-indigo-600">
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
