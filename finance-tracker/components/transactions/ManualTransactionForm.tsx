'use client'
import { useState } from 'react'

type Cat = { id: string; name: string; type: string }

export default function ManualTransactionForm({ categories, addAction }: { categories: Cat[], addAction: (fd: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isIncome, setIsIncome] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      const fd = new FormData(e.currentTarget)
      if (isIncome) {
        // Ensure income amounts are positive
        const amt = Math.abs(parseFloat(fd.get('amount') as string))
        fd.set('amount', amt.toString())
      } else {
        // Ensure expense amounts are negative
        const amt = -Math.abs(parseFloat(fd.get('amount') as string))
        fd.set('amount', amt.toString())
      }
      await addAction(fd)
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return (
    <button className="btn-ghost shadow-sm border border-[var(--color-border)] flex items-center gap-2 text-sm" onClick={() => setOpen(true)}>
      ➕ הוספה ידנית (הכנסה / הוצאה)
    </button>
  )

  return (
    <div className="card space-y-4 border-indigo-100 bg-indigo-50/30">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-indigo-900">הוספת תנועה ידנית</h2>
        <button className="btn-ghost text-sm text-indigo-500" onClick={() => setOpen(false)}>✕ סגור</button>
      </div>

      <div className="flex gap-2 mb-2 p-1 bg-white rounded-lg border border-indigo-100 shadow-sm w-fit">
        <button 
          onClick={() => setIsIncome(false)}
          className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${!isIncome ? 'bg-rose-100 text-rose-700' : 'text-slate-500 hover:bg-slate-50'}`}
        >הוצאה</button>
        <button 
          onClick={() => setIsIncome(true)}
          className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${isIncome ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
        >הכנסה</button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label text-indigo-900">תאריך</label>
          <input className="input bg-white border-indigo-200" type="date" name="date" defaultValue={new Date().toISOString().split('T')[0]} required />
        </div>
        <div>
          <label className="label text-indigo-900">סכום ₪ (ללא מינוס)</label>
          <input className="input bg-white border-indigo-200" type="number" step="0.01" name="amount" placeholder="למשל 1500" min="0.01" required />
        </div>
        <div>
          <label className="label text-indigo-900">תיאור העסקה</label>
          <input className="input bg-white border-indigo-200" type="text" name="description" placeholder={isIncome ? 'משכורת / העברה' : 'קניות / חשמל'} required />
        </div>
        <div>
          <label className="label text-indigo-900">קטגוריה</label>
          <div className="flex gap-2">
            <select className="input flex-1 bg-white border-indigo-200" name="category_id">
              <option value="">ללא קטגוריה / בחר...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="input flex-1 bg-white border-indigo-200" type="text" name="new_category" placeholder="או צור חדש..." />
          </div>
        </div>
        
        <div className="sm:col-span-2 pt-2">
          <button type="submit" className="btn-primary w-full sm:w-auto px-8" disabled={loading}>
            {loading ? 'שומר...' : '✔️ שמור תנועה'}
          </button>
        </div>
      </form>
    </div>
  )
}
