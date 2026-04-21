'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Target, Trophy, AlertCircle, Heart } from 'lucide-react'

type PersonalData = {
  compliments: string[]
  alerts: string[]
  goals: { title: string; progress: number; tip: string }[]
  overallScore: number
  summary: string
}

export default function PersonalAreaClient() {
  const [data, setData] = useState<PersonalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPersonalData()
  }, [])

  async function fetchPersonalData() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/personal')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message || json.error || 'שגיאה בטעינת נתונים')
      setData(json.data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-indigo-50 rounded-2xl w-full"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-48 bg-emerald-50 rounded-2xl"></div>
          <div className="h-48 bg-rose-50 rounded-2xl"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-6 bg-rose-50 text-rose-700 border border-rose-100">
        <h2 className="font-bold mb-2">שגיאה בטעינת האיזור האישי</h2>
        <p>{error}</p>
        <button onClick={fetchPersonalData} className="btn-primary mt-4">נסה שוב</button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Hero Score */}
      <div className="card p-6 md:p-8 flex flex-col md:flex-row items-center gap-6" style={{ background: 'linear-gradient(135deg, rgba(79,70,229,0.05), rgba(236,72,153,0.05))', borderColor: 'rgba(99,102,241,0.2)' }}>
        <div className="relative flex items-center justify-center w-32 h-32 rounded-full" style={{ background: 'conic-gradient(#4f46e5 ' + data.overallScore + '%, transparent 0)' }}>
          <div className="absolute inset-1 bg-white rounded-full flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-black" style={{ color: 'var(--color-accent)' }}>{data.overallScore}</span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">ציון פיננסי</span>
          </div>
        </div>
        <div className="text-center md:text-right flex-1">
          <h2 className="text-2xl font-extrabold mb-2" style={{ color: 'var(--color-text)' }}>היי, הנה הסיכום שלך 👋</h2>
          <p className="text-slate-600 leading-relaxed text-sm md:text-base">{data.summary}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Compliments */}
        <div className="card space-y-4" style={{ borderColor: 'rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.02)' }}>
          <h3 className="font-bold flex items-center gap-2 text-emerald-700">
            <Trophy size={18} /> חיזוקים והישגים
          </h3>
          <ul className="space-y-3">
            {data.compliments.length > 0 ? data.compliments.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-emerald-800">
                <Heart size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">{c}</span>
              </li>
            )) : <li className="text-sm text-slate-500">עוד קצת מאמץ ויהיו כאן המון הישגים!</li>}
          </ul>
        </div>

        {/* Alerts */}
        <div className="card space-y-4" style={{ borderColor: 'rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.02)' }}>
          <h3 className="font-bold flex items-center gap-2 text-rose-700">
            <AlertCircle size={18} /> לתשומת ליבך
          </h3>
          <ul className="space-y-3">
            {data.alerts.length > 0 ? data.alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-rose-800">
                <span className="text-rose-500 font-bold mt-0.5 flex-shrink-0">•</span>
                <span className="leading-relaxed">{a}</span>
              </li>
            )) : <li className="text-sm text-slate-500">אין התרעות מיוחדות. הכל תקין! 🎉</li>}
          </ul>
        </div>
      </div>

      {/* Goals / Tips */}
      <div className="card space-y-4" style={{ borderColor: 'rgba(99,102,241,0.2)' }}>
        <h3 className="font-bold flex items-center gap-2 text-indigo-700">
          <Target size={18} /> יעדים והמלצות מהסוכן
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.goals.map((g, i) => (
            <div key={i} className="p-4 rounded-xl border border-indigo-100 bg-white shadow-sm space-y-3">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-sm text-indigo-900">{g.title}</span>
                <span className="text-xs font-bold text-indigo-600">{g.progress}%</span>
              </div>
              <div className="w-full h-2 bg-indigo-50 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: \`\${g.progress}%\` }}></div>
              </div>
              <p className="text-xs text-slate-600 pt-1 border-t border-indigo-50">{g.tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
