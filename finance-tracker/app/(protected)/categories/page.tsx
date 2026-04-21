import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export default async function CategoriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: cats } = await supabase
    .from('categories').select('*').eq('user_id', user.id).order('type').order('name')

  const TYPE_LABELS = { income: 'הכנסה', fixed: 'הוצאה קבועה', variable: 'הוצאה משתנה' }
  const TYPE_COLORS = { income: '#10b981', fixed: '#f43f5e', variable: '#f59e0b' }

  async function addCategory(fd: FormData) {
    'use server'
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    await sb.from('categories').insert({
      user_id: user.id,
      name: fd.get('name') as string,
      type: fd.get('type') as string,
      parent_id: (fd.get('parent_id') as string) || null,
      color: (fd.get('color') as string) || null,
    })
    revalidatePath('/categories')
  }

  async function deleteCategory(fd: FormData) {
    'use server'
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) return
    await sb.from('categories').delete().eq('id', fd.get('id') as string).eq('user_id', u.id)
    revalidatePath('/categories')
  }

  const grouped = (cats ?? []).reduce<Record<string, NonNullable<typeof cats>>>((acc, c) => {
    acc[c.type] = acc[c.type] ?? []
    acc[c.type]!.push(c)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">קטגוריות</h1>

      {Object.entries(grouped).map(([type, items]) => (
        <div key={type} className="card">
          <h2 className="font-semibold mb-3" style={{ color: TYPE_COLORS[type as keyof typeof TYPE_COLORS] }}>
            {TYPE_LABELS[type as keyof typeof TYPE_LABELS]}
          </h2>
          <div className="space-y-1">
            {items?.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 px-3 rounded-lg table-row">
                <div className="flex items-center gap-3">
                  {c.color && <span className="w-3 h-3 rounded-full inline-block" style={{ background: c.color }} />}
                  <span className="text-sm">{c.name}</span>
                  {c.parent_id && <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                    ← {cats?.find(p => p.id === c.parent_id)?.name}
                  </span>}
                </div>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" className="text-xs opacity-30 hover:opacity-80 transition-opacity"
                    style={{ color: '#f43f5e' }}>✕</button>
                </form>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Add form */}
      <div className="card">
        <h2 className="font-semibold mb-4">הוסף קטגוריה</h2>
        <form action={addCategory} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">שם</label>
              <input className="input" name="name" placeholder='מזון' required />
            </div>
            <div>
              <label className="label">סוג</label>
              <select className="input" name="type" required>
                <option value="variable">הוצאה משתנה</option>
                <option value="fixed">הוצאה קבועה</option>
                <option value="income">הכנסה</option>
              </select>
            </div>
            <div>
              <label className="label">קטגוריית אב (אופציונלי)</label>
              <select className="input" name="parent_id">
                <option value="">ללא</option>
                {cats?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">צבע</label>
              <input className="input" type="color" name="color" defaultValue="#6366f1" />
            </div>
          </div>
          <button type="submit" className="btn-primary">הוסף</button>
        </form>
      </div>
    </div>
  )
}
