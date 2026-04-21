/**
 * Universal file parser using SheetJS (xlsx)
 * Supports: CSV, XLS, XLSX, ODS, and more
 *
 * Parsers for Israeli banks & sources:
 * הפועלים, לאומי, דיסקונט, כאל, מקס, ישראכרט, פאגי, מרכנתיל עסקי, generic
 */

export interface ParsedRow {
  date: string        // ISO YYYY-MM-DD
  amount: number      // positive = income, negative = expense
  description: string
  source: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseILDate(raw: string | number | undefined): string {
  if (!raw) return ''

  // Excel serial date (number)
  if (typeof raw === 'number') {
    const excelEpoch = new Date(1899, 11, 30)
    const d = new Date(excelEpoch.getTime() + raw * 86400000)
    return d.toISOString().split('T')[0]
  }

  const s = String(raw).trim()
  if (!s) return ''

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  // DD/MM/YYYY or D/M/YYYY
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/)
  if (m) {
    const [, d, mo, y] = m
    const year = y.length === 2 ? '20' + y : y
    return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return s
}

function parseAmount(raw: string | number | undefined): number {
  if (raw === undefined || raw === null || raw === '') return 0
  if (typeof raw === 'number') return raw
  const cleaned = String(raw).replace(/[^\d.\-+]/g, '')
  return parseFloat(cleaned) || 0
}

function firstVal(row: Record<string, unknown>, ...keys: string[]): string | number | undefined {
  for (const k of keys) {
    if (k in row && row[k] !== undefined && row[k] !== '') {
      return row[k] as string | number
    }
  }
  return undefined
}

// ─── Bank Parsers ─────────────────────────────────────────────────────────────

export function parseHapoalim(rows: Record<string, unknown>[]): ParsedRow[] {
  return rows.map(r => ({
    date: parseILDate(firstVal(r, 'תאריך', 'date')),
    amount: -(parseAmount(firstVal(r, 'סכום', 'amount'))),
    description: String(firstVal(r, 'תיאור', 'description') ?? '').trim(),
    source: 'hapoalim',
  })).filter(r => r.date && r.amount !== 0)
}

export function parseLeumi(rows: Record<string, unknown>[]): ParsedRow[] {
  return rows.map(r => {
    const credit = parseAmount(firstVal(r, 'זכות', 'credit'))
    const debit  = parseAmount(firstVal(r, 'חובה', 'debit'))
    const amount = credit > 0 ? credit : -debit
    return {
      date: parseILDate(firstVal(r, 'תאריך ערך', 'תאריך', 'date')),
      amount,
      description: String(firstVal(r, 'תיאור פעולה', 'תיאור', 'description') ?? '').trim(),
      source: 'leumi',
    }
  }).filter(r => r.date && r.amount !== 0)
}

export function parseDiscount(rows: Record<string, unknown>[]): ParsedRow[] {
  return rows.map(r => ({
    date: parseILDate(firstVal(r, 'תאריך', 'date')),
    amount: parseAmount(firstVal(r, 'סכום', 'amount')),
    description: String(firstVal(r, 'תיאור', 'description') ?? '').trim(),
    source: 'discount',
  })).filter(r => r.date && r.amount !== 0)
}

// ─── פאגי (Pagi) — bank account CSV ──────────────────────────────────────────
export function parsePagi(rows: Record<string, unknown>[]): ParsedRow[] {
  return rows.map(r => {
    // פאגי exports: תאריך, תיאור, חובה, זכות, יתרה
    const credit = parseAmount(firstVal(r, 'זכות', 'credit', 'הכנסה'))
    const debit  = parseAmount(firstVal(r, 'חובה', 'debit',  'הוצאה'))
    const amount = credit > 0 ? credit : -debit
    return {
      date: parseILDate(firstVal(r, 'תאריך', 'date', 'תאריך עסקה')),
      amount,
      description: String(firstVal(r, 'תיאור', 'פירוט', 'description', 'תנועה') ?? '').trim(),
      source: 'pagi',
    }
  }).filter(r => r.date && r.amount !== 0)
}

// ─── מרכנתיל (Mercantile) — business account ─────────────────────────────────
export function parseMercantile(rows: Record<string, unknown>[]): ParsedRow[] {
  return rows.map(r => {
    // מרכנתיל: תאריך פעולה, תיאור, חובה, זכות, יתרה
    const credit = parseAmount(firstVal(r, 'זכות', 'credit', 'הכנסה', 'כניסה'))
    const debit  = parseAmount(firstVal(r, 'חובה', 'debit',  'הוצאה', 'יציאה'))
    const amount = credit > 0 ? credit : -debit
    return {
      date: parseILDate(firstVal(r, 'תאריך פעולה', 'תאריך ערך', 'תאריך', 'date')),
      amount,
      description: String(firstVal(r, 'תיאור', 'פרטים', 'description') ?? '').trim(),
      source: 'mercantile',
    }
  }).filter(r => r.date && r.amount !== 0)
}

// ─── Credit cards ────────────────────────────────────────────────────────────

export function parseCal(rows: Record<string, unknown>[]): ParsedRow[] {
  return rows.map(r => ({
    date: parseILDate(firstVal(r, 'תאריך עסקה', 'תאריך', 'date')),
    amount: -(parseAmount(firstVal(r, 'סכום חיוב', 'סכום', 'amount'))),
    description: String(firstVal(r, 'שם בית עסק', 'תיאור', 'description') ?? '').trim(),
    source: 'cal',
  })).filter(r => r.date && r.amount !== 0)
}

export function parseMax(rows: Record<string, unknown>[]): ParsedRow[] {
  return rows.map(r => ({
    date: parseILDate(firstVal(r, 'תאריך עסקה', 'תאריך', 'date')),
    amount: -(parseAmount(firstVal(r, 'סכום עסקה', 'סכום', 'amount'))),
    description: String(firstVal(r, 'שם בית עסק', 'תיאור', 'description') ?? '').trim(),
    source: 'max',
  })).filter(r => r.date && r.amount !== 0)
}

export function parseIsracard(rows: Record<string, unknown>[]): ParsedRow[] {
  return rows.map(r => ({
    date: parseILDate(firstVal(r, 'תאריך רכישה', 'תאריך', 'date')),
    amount: -(parseAmount(firstVal(r, 'סכום חיוב', 'סכום', 'amount'))),
    description: String(firstVal(r, 'שם בית עסק', 'תיאור', 'description') ?? '').trim(),
    source: 'isracard',
  })).filter(r => r.date && r.amount !== 0)
}

// ─── Generic fallback ─────────────────────────────────────────────────────────

export function parseGeneric(rows: Record<string, unknown>[]): ParsedRow[] {
  if (rows.length === 0) return []
  const keys = Object.keys(rows[0])
  const dateKey = keys.find(k => /תאריך|date/i.test(k))
  const amtKey  = keys.find(k => /סכום|amount|חיוב/i.test(k))
  const descKey = keys.find(k => /תיאור|description|פירוט|שם/i.test(k))

  if (!dateKey || !amtKey) return []
  return rows.map(r => ({
    date: parseILDate(r[dateKey] as string | number),
    amount: parseAmount(r[amtKey] as string | number),
    description: descKey ? String(r[descKey] ?? '').trim() : 'Unknown',
    source: 'generic',
  })).filter(r => r.date && r.amount !== 0)
}

// ─── Auto-detect source from headers ─────────────────────────────────────────

export function detectSource(headers: string[]): string {
  const h = headers.join(' ')
  if (/זכות.*חובה|חובה.*זכות/.test(h) && /תאריך ערך|פעולה/.test(h) && !/בית עסק/.test(h)) {
    if (/מרכנתיל|mercantile/i.test(h)) return 'mercantile'
    if (/פאגי|pagi/i.test(h)) return 'pagi'
    return 'leumi' // leumi/pagi/mercantile all have debit+credit columns
  }
  if (/תאריך רכישה/.test(h)) return 'isracard'
  if (/שם בית עסק/.test(h) && /סכום עסקה/.test(h)) return 'max'
  if (/שם בית עסק/.test(h) && /סכום חיוב/.test(h)) return 'cal'
  if (/תיאור.*סכום|סכום.*תיאור/.test(h) && !/בית עסק/.test(h)) return 'hapoalim'
  return 'generic'
}

export const SOURCE_META: Record<string, { label: string; accepts: string }> = {
  hapoalim:    { label: 'בנק הפועלים',        accepts: '.csv,.xls,.xlsx' },
  leumi:       { label: 'בנק לאומי',          accepts: '.csv,.xls,.xlsx' },
  discount:    { label: 'בנק דיסקונט',        accepts: '.csv,.xls,.xlsx' },
  pagi:        { label: 'פאגי',               accepts: '.csv,.xls,.xlsx' },
  mercantile:  { label: 'מרכנתיל (עסקי)',    accepts: '.csv,.xls,.xlsx' },
  cal:         { label: 'כאל',                accepts: '.csv,.xls,.xlsx' },
  max:         { label: 'מקס',                accepts: '.csv,.xls,.xlsx' },
  isracard:    { label: 'ישראכרט',            accepts: '.csv,.xls,.xlsx' },
  generic:     { label: 'זיהוי אוטומטי',      accepts: '.csv,.xls,.xlsx,.ods,.txt' },
}

export function parseBySource(source: string, rows: Record<string, unknown>[]): ParsedRow[] {
  switch (source) {
    case 'hapoalim':   return parseHapoalim(rows)
    case 'leumi':      return parseLeumi(rows)
    case 'discount':   return parseDiscount(rows)
    case 'pagi':       return parsePagi(rows)
    case 'mercantile': return parseMercantile(rows)
    case 'cal':        return parseCal(rows)
    case 'max':        return parseMax(rows)
    case 'isracard':   return parseIsracard(rows)
    default:           return parseGeneric(rows)
  }
}
