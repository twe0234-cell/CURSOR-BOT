'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

type Tx = {
  id: string; date: string; amount: number; description: string;
  source: string; category_id: string | null; notes: string | null
}
type Cat = { id: string; name: string; type: string }

const SOURCE_LABELS: Record<string, string> = {
  hapoalim: 'הפועלים', leumi: 'לאומי', discount: 'דיסקונט',
  cal: 'כאל', max: 'מקס', isracard: 'ישראכרט', manual: 'ידני', generic: 'כללי'
}

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

export default function TransactionTable({
  transactions, categories, page, totalPages, q, catFilter,
  deleteAction, updateCategoryAction,
}: {
  transactions: Tx[]; categories: Cat[]; page: number; totalPages: number;
  q: string; catFilter: string;
  deleteAction: (id: string) => Promise<void>;
  updateCategoryAction: (id: string, catId: string) => Promise<void>;
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [search, setSearch] = useState(q)
  const [, startTransition] = useTransition()

  function applyFilter(params: Record<string, string>) {
    const cur = new URLSearchParams(sp.toString())
    Object.entries(params).forEach(([k, v]) => v ? cur.set(k, v) : cur.delete(k))
    cur.set('page', '1')
    router.push(`/transactions?${cur.toString()}`)
  }

  return (
    <div className="card space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input className="input" style={{ width: 220 }} placeholder="חיפוש תיאור..."
          value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && applyFilter({ q: search })} />
        <select className="input" style={{ width: 160 }} value={catFilter}
          onChange={e => applyFilter({ cat: e.target.value })}>
          <option value="">כל הקטגוריות</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(q || catFilter) && (
          <button className="btn-ghost text-sm" onClick={() => { setSearch(''); applyFilter({ q: '', cat: '' }) }}>
            ✕ נקה
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: 'var(--color-muted)', borderBottom: '1px solid var(--color-border)' }}>
              <th className="text-right py-2 px-3 font-medium">תאריך</th>
              <th className="text-right py-2 px-3 font-medium">תיאור</th>
              <th className="text-right py-2 px-3 font-medium">מקור</th>
              <th className="text-right py-2 px-3 font-medium">קטגוריה</th>
              <th className="text-left py-2 px-3 font-medium">סכום</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10" style={{ color: 'var(--color-muted)' }}>
                אין תנועות — ייבא CSV או הוסף ידנית
              </td></tr>
            ) : transactions.map(tx => (
              <tr key={tx.id} className="table-row">
                <td className="py-2 px-3 text-sm" style={{ color: 'var(--color-muted)' }}>
                  {new Date(tx.date).toLocaleDateString('he-IL')}
                </td>
                <td className="py-2 px-3 max-w-xs truncate" title={tx.description}>{tx.description}</td>
                <td className="py-2 px-3 text-xs" style={{ color: 'var(--color-muted)' }}>
                  {SOURCE_LABELS[tx.source] ?? tx.source}
                </td>
                <td className="py-2 px-3">
                  <select className="input text-xs py-1" style={{ width: 130 }}
                    value={tx.category_id ?? ''}
                    onChange={e => startTransition(() => updateCategoryAction(tx.id, e.target.value))}>
                    <option value="">ללא</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </td>
                <td className="py-2 px-3 text-left font-semibold"
                  style={{ color: tx.amount > 0 ? '#10b981' : '#f43f5e' }}>
                  {fmt(tx.amount)}
                </td>
                <td className="py-2 px-3">
                  <button onClick={() => startTransition(() => deleteAction(tx.id))}
                    className="text-xs opacity-40 hover:opacity-100 transition-opacity"
                    style={{ color: '#f43f5e' }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link href={`/transactions?page=${page - 1}&q=${q}&cat=${catFilter}`}
            className={`btn-ghost text-sm ${page <= 1 ? 'opacity-30 pointer-events-none' : ''}`}>
            ‹ הקודם
          </Link>
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>עמוד {page} מתוך {totalPages}</span>
          <Link href={`/transactions?page=${page + 1}&q=${q}&cat=${catFilter}`}
            className={`btn-ghost text-sm ${page >= totalPages ? 'opacity-30 pointer-events-none' : ''}`}>
            הבא ›
          </Link>
        </div>
      )}
    </div>
  )
}
