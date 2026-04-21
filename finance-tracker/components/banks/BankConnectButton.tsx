'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function BankConnectButton({ bankId, bankName }: { bankId: string; bankName: string }) {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setStatus('מתחבר לבנק...')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('לא מחובר')

      const res = await fetch('/api/banks/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankId, username, password }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'שגיאת חיבור')

      setStatus(`✓ ${json.message}`)
      setTimeout(() => { setOpen(false); window.location.reload() }, 1500)
    } catch (err: unknown) {
      setStatus(`שגיאה: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setOpen(true)}>
        חבר
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="card w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base">חיבור ל{bankName}</h2>
          <button className="btn-ghost text-sm py-1 px-2" onClick={() => { setOpen(false); setStatus(null) }}>✕</button>
        </div>

        <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(99,102,241,0.1)', color: '#a5b4fc' }}>
          הפרטים שלך מוצפנים ומשמשים רק למשיכת תנועות. לא נשמרים בטקסט רגיל.
        </div>

        <form onSubmit={handleConnect} className="space-y-3">
          <div>
            <label className="label">שם משתמש / מספר לקוח</label>
            <input className="input" type="text" value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="שם משתמש באינטרנט בנקאי" required autoComplete="username" />
          </div>
          <div>
            <label className="label">סיסמה</label>
            <input className="input" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="סיסמה" required autoComplete="current-password" />
          </div>

          {status && (
            <p className="text-sm p-2 rounded-lg" style={{
              background: status.startsWith('✓') ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
              color: status.startsWith('✓') ? '#10b981' : status.startsWith('מ') ? '#a5b4fc' : '#f43f5e'
            }}>
              {status}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'מתחבר...' : 'חבר בנק'}
          </button>
        </form>
      </div>
    </div>
  )
}
