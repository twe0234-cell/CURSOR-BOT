'use client'

import { useState, useEffect } from 'react'
import { Sparkles, AlertTriangle, TrendingUp, Info } from 'lucide-react'

type Insight = {
  type: 'anomaly' | 'warning' | 'positive'
  message: string
  amount?: number
}

export default function AiInsightsPanel() {
  const [insights, setInsights] = useState<Insight[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoClassifyResult, setAutoClassifyResult] = useState<{ classified_count: number; rules_added: number } | null>(null)

  const fetchInsights = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/insights', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה לא צפויה')
      setInsights(data.insights)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleAutoClassify = async () => {
    setClassifying(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/auto-classify', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה בסיווג')
      setAutoClassifyResult({ classified_count: data.classified_count, rules_added: data.rules_added })
      
      // If it suggested recurring, add them to insights array so the user sees them
      if (data.recurring_suggestions?.length > 0) {
        const newInsights = data.recurring_suggestions.map((r: any) => ({
          type: 'positive',
          message: `זיהיתי הוצאה קבועה אפשרית: ${r.name}`,
          amount: r.amount
        }))
        setInsights(prev => [...(prev || []), ...newInsights])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setClassifying(false)
    }
  }

  // Optional: Auto fetch on mount or wait for user to click. Let's wait for user to click for an "Agentic" feel, or auto-fetch if we want it fully passive.
  // We'll add a button to trigger it.

  const fmt = (v?: number) => v ? new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v) : ''

  if (!insights && !loading && !error) {
    return (
      <div className="card p-6 flex flex-col items-center justify-center text-center space-y-3" style={{ background: 'linear-gradient(135deg, rgba(79,70,229,0.03), rgba(236,72,153,0.03))' }}>
        <div className="p-3 rounded-full bg-indigo-50 text-indigo-600 mb-2">
          <Sparkles size={24} />
        </div>
        <h3 className="font-bold text-lg">סוכן פיננסי AI</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          הסוכן החכם שלנו יסרוק את התנועות שלך, יזהה חריגות, כפילויות, והוצאות קבועות, ויציג לך תובנות ממוקדות.
        </p>
        <div className="flex gap-3 mt-2">
          <button onClick={fetchInsights} disabled={loading} className="btn-primary">
            <Sparkles size={16} /> נתח נתונים
          </button>
          <button onClick={handleAutoClassify} disabled={classifying} className="btn-ghost shadow-sm bg-white" style={{ border: '1px solid var(--color-border)' }}>
            🤖 סיווג אוטומטי
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <Sparkles size={18} style={{ color: 'var(--color-accent)' }} />
          <span>תובנות AI</span>
        </h2>
        <div className="flex gap-2">
          <button onClick={handleAutoClassify} disabled={classifying} className="btn-ghost text-xs py-1 px-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            {classifying ? 'מסווג...' : '🤖 סווג תנועות'}
          </button>
          <button onClick={fetchInsights} disabled={loading} className="btn-ghost text-xs py-1 px-2">
            {loading ? 'מנתח...' : 'רענן'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="space-y-3 animate-pulse">
          <div className="h-16 bg-slate-100 rounded-xl w-full"></div>
          <div className="h-16 bg-slate-100 rounded-xl w-full"></div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 text-rose-600 text-sm">
          <p className="font-bold mb-1">שגיאה בניתוח</p>
          <p>{error}</p>
        </div>
      )}

      {insights && !loading && insights.length === 0 && (
        <div className="text-center p-4 text-sm text-slate-500">
          לא נמצאו חריגות מיוחדות. הכל נראה תקין! 🎉
        </div>
      )}

      {autoClassifyResult && (
        <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm border border-emerald-100 animate-fade-in-up">
          <span className="font-bold">סיווג אוטומטי הושלם! </span>
          סווגו {autoClassifyResult.classified_count} תנועות חדשות ונוצרו {autoClassifyResult.rules_added} כללים חכמים.
        </div>
      )}

      {insights && !loading && insights.length > 0 && (
        <div className="space-y-3">
          {insights.map((insight, i) => {
            const isWarning = insight.type === 'warning' || insight.type === 'anomaly'
            const Icon = isWarning ? AlertTriangle : insight.type === 'positive' ? TrendingUp : Info
            const colorClass = isWarning ? 'text-rose-600 bg-rose-50 border-rose-100' : insight.type === 'positive' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-indigo-600 bg-indigo-50 border-indigo-100'
            
            return (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${colorClass} animate-fade-in-up`} style={{ animationDelay: \`\${i * 100}ms\` }}>
                <div className="mt-0.5">
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium leading-relaxed text-slate-800">{insight.message}</p>
                  {insight.amount && (
                    <p className="text-xs font-bold mt-1 opacity-80">{fmt(insight.amount)}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
