import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const ASSET_TYPE_LABELS: Record<string, string> = {
  hishtalmut: 'קרן השתלמות',
  pension:    'פנסיה',
  stocks:     'מניות',
  real_estate:'נדל"ן',
  savings:    'חיסכון',
  crypto:     'קריפטו',
  inventory:  'מלאי עסקי (STaM ERP)',
  other:      'אחר',
}

const ASSET_TYPE_ICONS: Record<string, string> = {
  hishtalmut: '🏦', pension: '👴', stocks: '📈',
  real_estate: '🏠', savings: '💰', crypto: '🔷',
  inventory: '📦', other: '🗂️',
}

function fmt(n: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)
}

export default async function AssetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: assets }, { data: snapshots }] = await Promise.all([
    supabase.from('assets').select('*').eq('user_id', user.id).order('created_at'),
    supabase.from('asset_snapshots').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: false }),
  ])

  // Latest value per asset
  const latestVal: Record<string, number> = {}
  const latestDate: Record<string, string> = {}
  for (const s of snapshots ?? []) {
    if (latestVal[s.asset_id] === undefined) {
      latestVal[s.asset_id] = s.value
      latestDate[s.asset_id] = s.snapshot_date
    }
  }

  const total = Object.values(latestVal).reduce((s, v) => s + v, 0)

  async function addAsset(fd: FormData) {
    'use server'
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    await sb.from('assets').insert({
      user_id: user.id,
      name: fd.get('name') as string,
      asset_type: fd.get('asset_type') as string,
      notes: (fd.get('notes') as string) || null,
    })
    revalidatePath('/assets')
  }

  async function addSnapshot(fd: FormData) {
    'use server'
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    await sb.from('asset_snapshots').insert({
      asset_id: fd.get('asset_id') as string,
      user_id: user.id,
      value: parseFloat(fd.get('value') as string),
      snapshot_date: fd.get('snapshot_date') as string,
      notes: (fd.get('notes') as string) || null,
    })
    revalidatePath('/assets')
  }

  async function deleteAsset(fd: FormData) {
    'use server'
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) return
    await sb.from('assets').delete().eq('id', fd.get('id') as string).eq('user_id', u.id)
    revalidatePath('/assets')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">נכסים ושווי נקי</h1>
        <div className="text-start">
          <p className="text-xs mb-0.5" style={{ color: 'var(--color-muted)' }}>שווי נקי כולל</p>
          <p className="text-2xl font-bold" style={{ color: '#a5b4fc' }}>{fmt(total)}</p>
        </div>
      </div>

      {/* Assets list */}
      <div className="card">
        <h2 className="font-semibold mb-4">נכסים</h2>
        {(assets?.length ?? 0) === 0 ? (
          <p style={{ color: 'var(--color-muted)' }} className="text-sm">אין נכסים עדיין — הוסף למטה.</p>
        ) : (
          <div className="space-y-4">
            {assets!.map(a => {
              const val = latestVal[a.id]
              const date = latestDate[a.id]
              const history = (snapshots ?? []).filter(s => s.asset_id === a.id).slice(0, 6)
              const icon = ASSET_TYPE_ICONS[a.asset_type] ?? '🗂️'

              return (
              <div key={a.id} className="p-4 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{icon}</span>
                      <div>
                        <p className="font-semibold">{a.name}</p>
                        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                          {ASSET_TYPE_LABELS[a.asset_type]}
                          {date && ` · עודכן ${new Date(date).toLocaleDateString('he-IL')}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-lg font-bold" style={{ color: '#a5b4fc' }}>
                        {val !== undefined ? fmt(val) : '—'}
                      </p>
                      <form action={deleteAsset}>
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" title="מחק נכס"
                          className="text-xs opacity-30 hover:opacity-80 transition-opacity"
                          style={{ color: '#f43f5e' }}>✕</button>
                      </form>
                    </div>
                  </div>

                  {/* Snapshot history mini-chart */}
                  {history.length >= 2 && (
                    <div className="mb-3 flex items-end gap-1 h-10">
                      {[...history].reverse().map((s, i) => {
                        const maxVal = Math.max(...history.map(h => h.value))
                        const height = maxVal ? (s.value / maxVal) * 100 : 50
                        return (
                          <div key={s.id} title={`${new Date(s.snapshot_date).toLocaleDateString('he-IL')}: ${fmt(s.value)}`}
                            className="flex-1 rounded-t transition-all"
                            style={{
                              height: `${height}%`,
                              background: i === history.length - 1 ? '#6366f1' : 'var(--color-border)',
                              minHeight: 4,
                            }} />
                        )
                      })}
                    </div>
                  )}

                  {/* Update value form */}
                  <form action={addSnapshot} className="flex gap-2 flex-wrap">
                    <input type="hidden" name="asset_id" value={a.id} />
                    <div className="flex-1 min-w-[120px]">
                      <input className="input text-sm" type="number" name="value"
                        placeholder="שווי חדש ₪" step="0.01" required />
                    </div>
                    <div>
                      <input className="input text-sm" style={{ width: 140 }} type="date" name="snapshot_date"
                        defaultValue={new Date().toISOString().split('T')[0]} required />
                    </div>
                    <input className="input text-sm" style={{ width: 160 }} type="text" name="notes" placeholder="הערה" />
                    <button type="submit" className="btn-primary text-sm px-3 py-1.5">עדכן</button>
                  </form>

                  {/* Snapshot history */}
                  {history.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                      {history.map(s => (
                        <span key={s.id} className="text-xs" style={{ color: 'var(--color-muted)' }}>
                          {new Date(s.snapshot_date).toLocaleDateString('he-IL')}:{' '}
                          <span style={{ color: '#a5b4fc' }}>{fmt(s.value)}</span>
                          {s.notes && <span> ({s.notes})</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add asset form */}
      <div className="card">
        <h2 className="font-semibold mb-4">הוסף נכס חדש</h2>
        <form action={addAsset} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">שם הנכס</label>
              <input className="input" name="name" placeholder='קרן השתלמות מגדל' required />
            </div>
            <div>
              <label className="label">סוג</label>
              <select className="input" name="asset_type" required>
                {Object.entries(ASSET_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{ASSET_TYPE_ICONS[v]} {l}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">הערות</label>
            <input className="input" name="notes" placeholder="אופציונלי" />
          </div>
          <button type="submit" className="btn-primary">הוסף נכס</button>
        </form>
      </div>
    </div>
  )
}
