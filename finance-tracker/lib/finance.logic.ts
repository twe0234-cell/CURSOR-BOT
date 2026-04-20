// Pure business logic — no DB calls, fully testable

export type TransactionRow = {
  date: string
  amount: number
  description: string
  source: string
  hash?: string
}

/** Build a dedup hash from key fields */
export function buildHash(t: Pick<TransactionRow, 'date' | 'amount' | 'description' | 'source'>): string {
  return `${t.date}|${t.amount}|${t.description.trim().toLowerCase()}|${t.source}`
}

/** Apply classification rules (ordered by priority desc) */
export function classifyTransaction(
  description: string,
  rules: Array<{ match_type: string; pattern: string; category_id: string; priority: number }>
): string | null {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority)
  for (const rule of sorted) {
    const desc = description.toLowerCase()
    const pat = rule.pattern.toLowerCase()
    let matched = false
    switch (rule.match_type) {
      case 'contains':     matched = desc.includes(pat); break
      case 'equals':       matched = desc === pat; break
      case 'starts_with':  matched = desc.startsWith(pat); break
      case 'regex':        try { matched = new RegExp(rule.pattern, 'i').test(description) } catch { matched = false }; break
    }
    if (matched) return rule.category_id
  }
  return null
}

/** Calculate recurring expense for a target month */
export function getActiveRecurring(
  expenses: Array<{ amount: number; start_date: string; end_date: string | null; frequency: string }>,
  targetDate: Date
): number {
  return expenses
    .filter(e => {
      const start = new Date(e.start_date)
      const end = e.end_date ? new Date(e.end_date) : null
      return start <= targetDate && (end === null || end >= targetDate)
    })
    .reduce((sum, e) => sum + e.amount, 0)
}

/** Monthly summary from transactions */
export function summarizeMonth(
  transactions: Array<{ amount: number; date: string }>,
  year: number,
  month: number // 1-based
): { income: number; expenses: number; net: number } {
  const relevant = transactions.filter(t => {
    const d = new Date(t.date)
    return d.getFullYear() === year && d.getMonth() + 1 === month
  })
  const income = relevant.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expenses = relevant.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  return { income, expenses, net: income - expenses }
}

/** Detect anomaly: expense > 1.5x category average over last 6 months */
export function isAnomaly(
  amount: number,
  categoryHistory: number[]
): boolean {
  if (categoryHistory.length < 2) return false
  const avg = categoryHistory.reduce((s, v) => s + v, 0) / categoryHistory.length
  return Math.abs(amount) > avg * 1.5
}

/** Latest snapshot value per asset */
export function getLatestAssetValues(
  snapshots: Array<{ asset_id: string; value: number; snapshot_date: string }>
): Record<string, number> {
  const latest: Record<string, { value: number; date: string }> = {}
  for (const s of snapshots) {
    if (!latest[s.asset_id] || s.snapshot_date > latest[s.asset_id].date) {
      latest[s.asset_id] = { value: s.value, date: s.snapshot_date }
    }
  }
  return Object.fromEntries(Object.entries(latest).map(([k, v]) => [k, v.value]))
}

/** Net worth = assets - liabilities (negative recurring debts) */
export function calcNetWorth(
  assetValues: Record<string, number>
): number {
  return Object.values(assetValues).reduce((s, v) => s + v, 0)
}
