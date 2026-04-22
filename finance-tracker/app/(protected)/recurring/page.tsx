import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export default async function RecurringPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: recurring }, { data: categories }] = await Promise.all([
    supabase.from('recurring_expenses').select('*').eq('user_id', user.id).order('name'),
    supabase.from('categories').select('id,name').eq('user_id', user.id).order('name'),
  ])

  const fmt = (n: number) =>
    new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

  const totalMonthly = (recurring ?? [])
    .filter(r => !r.end_date || new Date(r.end_date) >= new Date())
    .filter(r => r.frequency === 'monthly')
    .reduce((s, r) => s + r.amount, 0)

  async function addRecurring(fd: FormData) {
    'use server'
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return

    let categoryId = fd.get('category_id') as string || null
    const newCategoryName = fd.get('new_category') as string
    if (newCategoryName?.trim()) {
      const { data: newCat } = await sb.from('categories').insert({
        user_id: user.id, name: newCategoryName.trim(), type: 'expense'
      }).select().single()
      if (newCat) categoryId = newCat.id
    }

    await sb.from('recurring_expenses').insert({
      user_id: user.id,
      name: fd.get('name') as string,
      category_id: categoryId,
      amount: parseFloat(fd.get('amount') as string),
      frequency: fd.get('frequency') as string,
      start_date: fd.get('start_date') as string,
      end_date: (fd.get('end_date') as string) || null,
      payment_day: (fd.get('payment_day') as string) ? parseInt(fd.get('payment_day') as string) : null,
      payment_method: (fd.get('payment_method') as string) || 'manual',
      notes: (fd.get('notes') as string) || null,
    })
    revalidatePath('/recurring')
  }

  async function endRecurring(fd: FormData) {
    'use server'
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) return
    await sb.from('recurring_expenses').update({
      end_date: fd.get('end_date') as string,
    }).eq('id', fd.get('id') as string).eq('user_id', u.id)
    revalidatePath('/recurring')
  }

  async function deleteRecurring(fd: FormData) {
    'use server'
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) return
    await sb.from('recurring_expenses').delete()
      .eq('id', fd.get('id') as string).eq('user_id', u.id)
    revalidatePath('/recurring')
  }

  const FREQ = { monthly: 'חודשי', quarterly: 'רבעוני', yearly: 'שנתי' }
  const METHODS = {
    cash: 'מזומן',
    hok_pagi: 'הוק פאגי',
    hok_mercantile: 'הוק מרכנתיל',
    visa_chaya: 'ויזה חיה',
    direct_pagi: 'דיירקט פאגי',
    credit_mercantile: 'אשראי מרכנתיל'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">הוצאות קבועות</h1>
        <div>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>סה"כ חודשי פעיל</p>
          <p className="text-xl font-bold" style={{ color: '#f43f5e' }}>{fmt(totalMonthly)}</p>
        </div>
      </div>

      {/* List */}
      <div className="card">
        <h2 className="font-semibold mb-4">פעיל</h2>
        {(recurring?.length ?? 0) === 0 ? (
          <p style={{ color: 'var(--color-muted)' }} className="text-sm">אין הוצאות קבועות עדיין</p>
        ) : (
          <div className="space-y-2">
            {recurring!.map(r => {
              const active = !r.end_date || new Date(r.end_date) >= new Date()
              return (
                <div key={r.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', opacity: active ? 1 : 0.5 }}>
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      {FREQ[r.frequency as keyof typeof FREQ]} · מ-{new Date(r.start_date).toLocaleDateString('he-IL')}
                      {r.end_date && ` עד ${new Date(r.end_date).toLocaleDateString('he-IL')}`}
                      {r.payment_method && ` · ${METHODS[r.payment_method as keyof typeof METHODS] || r.payment_method}`}
                      {r.payment_day ? ` · ב-${r.payment_day} לחודש` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-bold" style={{ color: '#f43f5e' }}>{fmt(r.amount)}</span>
                    <div className="flex gap-2">
                      {active && (
                        <form action={endRecurring} className="flex gap-1 items-center flex-wrap">
                          <input type="hidden" name="id" value={r.id} />
                          <input className="input text-xs py-1" style={{ width: 130 }} type="date" name="end_date"
                            defaultValue={new Date().toISOString().split('T')[0]} />
                          <button type="submit" className="btn-ghost text-xs py-1 px-2">סיים</button>
                        </form>
                      )}
                      <form action={deleteRecurring}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="btn-ghost text-xs py-1 px-2 text-rose-500 hover:bg-rose-50" title="מחק לגמרי">
                          🗑️
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add form */}
      <div className="card">
        <h2 className="font-semibold mb-4">הוסף הוצאה קבועה</h2>
        <form action={addRecurring} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">שם</label>
              <input className="input" name="name" placeholder="שכירות" required />
            </div>
            <div>
              <label className="label">סכום ₪</label>
              <input className="input" type="number" name="amount" placeholder="3500" step="0.01" required />
            </div>
            <div>
              <label className="label">קטגוריה</label>
              <div className="flex gap-2">
                <select className="input flex-1" name="category_id">
                  <option value="">ללא / בחר מהרשימה</option>
                  {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input className="input flex-1" type="text" name="new_category" placeholder="או צור חדש..." />
              </div>
            </div>
            <div>
              <label className="label">תדירות</label>
              <select className="input" name="frequency">
                <option value="monthly">חודשי</option>
                <option value="quarterly">רבעוני</option>
                <option value="yearly">שנתי</option>
              </select>
            </div>
            <div>
              <label className="label">תאריך התחלה</label>
              <input className="input" type="date" name="start_date"
                defaultValue={new Date().toISOString().split('T')[0]} required />
            </div>
            <div>
              <label className="label">תאריך סיום (אופציונלי)</label>
              <input className="input" type="date" name="end_date" />
            </div>
            <div>
              <label className="label">יום בחודש לחיוב</label>
              <input className="input" type="number" name="payment_day" placeholder="1-31 (אופציונלי)" min="1" max="31" />
            </div>
            <div>
              <label className="label">אמצעי תשלום</label>
              <select className="input" name="payment_method">
                <option value="cash">מזומן</option>
                <option value="hok_pagi">הוק פאגי</option>
                <option value="hok_mercantile">הוק מרכנתיל</option>
                <option value="visa_chaya">ויזה חיה</option>
                <option value="direct_pagi">דיירקט פאגי</option>
                <option value="credit_mercantile">אשראי מרכנתיל</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">הערות</label>
            <input className="input" name="notes" placeholder="אופציונלי" />
          </div>
          <button type="submit" className="btn-primary">הוסף</button>
        </form>
      </div>
    </div>
  )
}
