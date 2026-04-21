'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildHash, classifyTransaction } from '@/lib/finance.logic'
import { detectSource, parseBySource, SOURCE_META } from '@/lib/parsers'

/**
 * Universal file importer — supports CSV, XLS, XLSX, ODS, TXT
 * Uses SheetJS (xlsx) for all parsing
 */
export default function CsvImport() {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState('generic')
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleImport() {
    const file = fileRef.current?.files?.[0]
    if (!file) { setStatus('אנא בחר קובץ'); return }

    setLoading(true)
    setStatus('טוען קובץ...')

    try {
      // Dynamic import — xlsx is a CommonJS module, .default may be undefined
      const xlsxMod = await import('xlsx')
      const XLSX = xlsxMod.default ?? xlsxMod

      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, {
        type: 'array',
        cellDates: false,   // keep serial numbers — our parser converts them
        raw: false,         // formatted text values
        codepage: 1255,     // Windows Hebrew encoding for old XLS files
      })

      // Take the first sheet
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]

      // Find where actual data starts — skip metadata rows at top (common in Israeli bank exports)
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: false,
      })

      if (rawRows.length === 0) {
        setStatus('הקובץ ריק או לא נקרא — בדוק פורמט')
        return
      }

      // Scan up to first 20 rows to find headers (usually contains exact date & amount columns)
      let headerIdx = 0
      for (let i = 0; i < Math.min(20, rawRows.length); i++) {
        const rowArray = (rawRows[i] as unknown[] || []).map(c => String(c ?? '').trim())
        const hasDateCol = rowArray.some(c => /^(תאריך|תאריך עסקה|תאריך פעולה|תאריך הפעולה)$/.test(c))
        const hasAmountCol = rowArray.some(c => /^(זכות|חובה|סכום|סכום עסקה|סכום חיוב)$/.test(c))
        
        if (hasDateCol && hasAmountCol) {
          headerIdx = i
          break
        }
      }

      const rawHeaders = (rawRows[headerIdx] || []) as string[]
      const headers = rawHeaders.map(h => String(h ?? '').trim())

      // Map subsequent rows to objects using the detected headers
      const rows: Record<string, unknown>[] = []
      for (let i = headerIdx + 1; i < rawRows.length; i++) {
        const rowArray = rawRows[i] as unknown[]
        const obj: Record<string, unknown> = {}
        let hasData = false
        headers.forEach((h, colIdx) => {
          if (h && rowArray[colIdx] !== undefined && rowArray[colIdx] !== '') {
            obj[h] = rowArray[colIdx]
            hasData = true
          }
        })
        if (hasData) rows.push(obj)
      }

      const detectedSource = source === 'generic' ? detectSource(headers) : source
      const parsed = parseBySource(detectedSource, rows)

      if (parsed.length === 0) {
        setStatus(`לא נמצאו עמודות מתאימות. Headers שנמצאו: ${headers.slice(0, 6).join(', ')}`)
        return
      }

      setStatus(`זוהו ${parsed.length} תנועות מ-${SOURCE_META[detectedSource]?.label ?? detectedSource}. שומר...`)

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('לא מחובר')

      const { data: rules } = await supabase
        .from('classification_rules')
        .select('match_type,pattern,category_id,priority')
        .eq('user_id', user.id)

      const toInsert = parsed.map(r => ({
        user_id: user.id,
        date: r.date,
        amount: r.amount,
        description: r.description,
        source: detectedSource,
        hash: buildHash({ date: r.date, amount: r.amount, description: r.description, source: detectedSource }),
        category_id: rules?.length ? classifyTransaction(r.description, rules as Parameters<typeof classifyTransaction>[1]) : null,
      }))

      const { error } = await supabase
        .from('transactions')
        .upsert(toInsert, { onConflict: 'user_id,hash', ignoreDuplicates: true })

      if (error) throw error

      await supabase.from('imports').insert({
        user_id: user.id,
        file_name: file.name,
        source: detectedSource,
        rows_total: parsed.length,
        rows_imported: toInsert.length,
        rows_skipped: 0,
        status: 'done',
      })

      setStatus(`✓ יובאו ${toInsert.length} תנועות (כפילויות דולגו אוטומטית)`)
      if (fileRef.current) fileRef.current.value = ''

    } catch (e: unknown) {
      setStatus(`שגיאה: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return (
    <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => setOpen(true)}>
      📤 ייבוא קובץ
    </button>
  )

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">ייבוא תנועות</h2>
        <button className="btn-ghost text-sm" onClick={() => { setOpen(false); setStatus(null) }}>✕ סגור</button>
      </div>

      {/* Source + file — stack on mobile */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div>
          <label className="label">מקור / בנק</label>
          <select className="input" value={source} onChange={e => setSource(e.target.value)}>
            {Object.entries(SOURCE_META).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
            &ldquo;זיהוי אוטומטי&rdquo; ינסה לזהות את הבנק מה-headers
          </p>
        </div>

        <div>
          <label className="label">קובץ</label>
          <input
            className="input"
            type="file"
            accept=".csv,.xls,.xlsx,.ods,.txt"
            ref={fileRef}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
            תומך ב-CSV, XLS, XLSX, ODS, TXT
          </p>
        </div>
      </div>

      {/* Hints */}
      <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(99,102,241,0.06)', color: 'var(--color-muted)', lineHeight: 1.8 }}>
        <strong style={{ color: '#a5b4fc' }}>טיפ לייצוא:</strong>
        &nbsp;הפועלים: אינטרנט בנקאי → תנועות → ייצוא Excel ·
        &nbsp;לאומי: נט&nbsp;→ יומן חשבון → ייצוא ·
        &nbsp;פאגי: לחצן &ldquo;הורד Excel&rdquo; ·
        &nbsp;מרכנתיל: ייצוא לאקסל מיומן הפעולות ·
        &nbsp;כאל/מקס/ישראכרט: תנועות → ייצוא CSV
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn-primary text-sm" onClick={handleImport} disabled={loading}>
          {loading ? 'מייבא...' : '📤 ייבא'}
        </button>
        {status && (
          <p className="text-sm" style={{
            color: status.startsWith('✓') ? '#10b981'
              : status.startsWith('שגיאה') ? '#f43f5e'
              : '#a5b4fc'
          }}>
            {status}
          </p>
        )}
      </div>
    </div>
  )
}
