import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export default async function RulesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: rules }, { data: categories }] = await Promise.all([
    supabase.from('classification_rules').select('*').eq('user_id', user.id).order('priority', { ascending: false }),
    supabase.from('categories').select('id,name').eq('user_id', user.id).order('name'),
  ])

  const MATCH_LABELS = { contains: 'מכיל', equals: 'שווה ל', starts_with: 'מתחיל ב', regex: 'Regex' }

  async function addRule(fd: FormData) {
    'use server'
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    await sb.from('classification_rules').insert({
      user_id: user.id,
      match_type: fd.get('match_type') as string,
      pattern: fd.get('pattern') as string,
      category_id: fd.get('category_id') as string,
      priority: parseInt(fd.get('priority') as string) || 0,
    })
    revalidatePath('/rules')
  }

  async function deleteRule(fd: FormData) {
    'use server'
    const sb = await createClient()
    await sb.from('classification_rules').delete().eq('id', fd.get('id') as string)
    revalidatePath('/rules')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">חוקי סיווג אוטומטי</h1>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>{rules?.length ?? 0} חוקים</span>
      </div>

      <div className="card">
        <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
          חוקים עם priority גבוה יותר מנצחים. בייבוא CSV — הסיווג מתבצע אוטומטית.
        </p>
        {(rules?.length ?? 0) === 0 ? (
          <p style={{ color: 'var(--color-muted)' }} className="text-sm">אין חוקים — הוסף למטה</p>
        ) : (
          <div className="space-y-2">
            {rules!.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: '#12151f', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-3 text-sm">
                  <span className="px-2 py-0.5 rounded text-xs font-mono"
                    style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                    {MATCH_LABELS[r.match_type as keyof typeof MATCH_LABELS]}
                  </span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded"
                    style={{ background: '#12151f', border: '1px solid var(--color-border)' }}>
                    &quot;{r.pattern}&quot;
                  </span>
                  <span style={{ color: 'var(--color-muted)' }}>→</span>
                  <span>{categories?.find(c => c.id === r.category_id)?.name ?? '—'}</span>
                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>p={r.priority}</span>
                </div>
                <form action={deleteRule}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="text-xs opacity-30 hover:opacity-80"
                    style={{ color: '#f43f5e' }}>✕</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add rule form */}
      <div className="card">
        <h2 className="font-semibold mb-4">הוסף חוק</h2>
        <form action={addRule} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">סוג התאמה</label>
              <select className="input" name="match_type">
                <option value="contains">מכיל</option>
                <option value="equals">שווה ל</option>
                <option value="starts_with">מתחיל ב</option>
                <option value="regex">Regex</option>
              </select>
            </div>
            <div>
              <label className="label">תבנית</label>
              <input className="input font-mono" name="pattern" placeholder='סופר' required />
            </div>
            <div>
              <label className="label">קטגוריה</label>
              <select className="input" name="category_id" required>
                <option value="">בחר...</option>
                {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">עדיפות (גבוה = קודם)</label>
              <input className="input" type="number" name="priority" defaultValue={0} />
            </div>
          </div>
          <button type="submit" className="btn-primary">הוסף חוק</button>
        </form>
      </div>
    </div>
  )
}
