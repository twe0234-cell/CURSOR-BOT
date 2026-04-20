'use client'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
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
        <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false}
            tickFormatter={v => `₪${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8 }}
            labelStyle={{ color: '#f1f5f9', fontWeight: 600 }}
            formatter={tooltipFormatter}
          />
          <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
          <Bar dataKey="הכנסות" fill="#10b981" radius={[4, 4, 0, 0]} />
          <Bar dataKey="הוצאות" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="נטו"    fill="#6366f1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
