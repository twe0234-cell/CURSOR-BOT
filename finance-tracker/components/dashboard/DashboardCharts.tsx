'use client'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid
} from 'recharts'

type MonthlyEntry = { name: string; הכנסות: number; הוצאות: number; נטו: number }

const fmt = (v: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tooltipFormatter = (v: any, name: any): [string, string] => [fmt(Number(v)), String(name ?? '')]

export default function DashboardCharts({ monthlyData }: { monthlyData: MonthlyEntry[] }) {
  return (
    <div style={{ direction: 'ltr' }}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={3}>
          <CartesianGrid vertical={false} stroke="rgba(99,102,241,0.08)" />
          <XAxis dataKey="name"
            tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }}
            axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false} tickLine={false}
            tickFormatter={v => `₪${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            contentStyle={{
              background: 'rgba(255,255,255,0.97)',
              border: '1px solid rgba(99,102,241,0.18)',
              borderRadius: 12,
              boxShadow: '0 8px 24px rgba(99,102,241,0.15)',
            }}
            labelStyle={{ color: '#1e293b', fontWeight: 700, marginBottom: 4 }}
            formatter={tooltipFormatter}
            cursor={{ fill: 'rgba(99,102,241,0.05)' }}
          />
          <Legend
            wrapperStyle={{ color: '#64748b', fontSize: 12, paddingTop: 8 }}
          />
          <Bar dataKey="הכנסות" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={36} />
          <Bar dataKey="הוצאות" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={36} />
          <Bar dataKey="נטו"    fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
