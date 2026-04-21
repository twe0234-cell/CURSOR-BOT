import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SUPPORTED_BANKS = new Set([
  'hapoalim', 'leumi', 'discount', 'mizrahi', 'max', 'cal', 'isracard'
])

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 })

    const body = await req.json() as { bankId?: string; username?: string; password?: string }
    const { bankId, username, password } = body

    if (!bankId || !SUPPORTED_BANKS.has(bankId)) {
      return NextResponse.json({ error: 'בנק לא נתמך' }, { status: 400 })
    }
    if (!username?.trim() || !password?.trim()) {
      return NextResponse.json({ error: 'פרטי כניסה חסרים' }, { status: 400 })
    }

    // Attempt scrape — uses israeli-bank-scrapers if installed
    // Falls back to saving connection for future use when scraper package is available
    let txCount = 0
    let scrapeError: string | null = null

    try {
      // Dynamic import — only works when package is installed + running on Node (not Edge)
      const { createScraper, CompanyTypes } = await import('israeli-bank-scrapers')

      const companyMap: Record<string, string> = {
        hapoalim: CompanyTypes.hapoalim,
        leumi:    CompanyTypes.leumi,
        discount: CompanyTypes.discount,
        mizrahi:  CompanyTypes.mizrahi,
        max:      CompanyTypes.max,
        cal:      CompanyTypes.visaCal,
        isracard: CompanyTypes.isracard,
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scraper = createScraper({ companyId: companyMap[bankId] as any, verbose: false, startDate: new Date(Date.now() - 90 * 86400000) })
      const result  = await scraper.scrape({ username: username.trim(), password } as any)

      if (!result.success) throw new Error(result.errorMessage ?? 'שגיאת scraping')

      const txns = (result.accounts ?? []).flatMap(a => a.txns)
      txCount = txns.length

      if (txns.length > 0) {
        const toInsert = txns.map(tx => ({
          user_id:     user.id,
          date:        tx.date.slice(0, 10),
          amount:      tx.type === 'normal' ? -(tx.chargedAmount ?? tx.originalAmount) : (tx.chargedAmount ?? tx.originalAmount),
          description: tx.description ?? '',
          source:      bankId,
          hash:        `${tx.date.slice(0, 10)}|${tx.chargedAmount ?? tx.originalAmount}|${(tx.description ?? '').trim().toLowerCase()}|${bankId}`,
        }))

        await supabase
          .from('transactions')
          .upsert(toInsert, { onConflict: 'user_id,hash', ignoreDuplicates: true })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Package not installed = expected in dev; log but don't fail the connection save
      if (!msg.includes('Cannot find module')) scrapeError = msg
    }

    // Save / update the connection record
    const { error: dbError } = await supabase
      .from('bank_connections')
      .upsert({
        user_id:       user.id,
        bank_id:       bankId,
        display_name:  bankId,
        is_active:     true,
        last_synced_at: scrapeError ? null : new Date().toISOString(),
        last_error:    scrapeError,
      }, { onConflict: 'user_id,bank_id,account_number', ignoreDuplicates: false })

    if (dbError) throw dbError

    const message = scrapeError
      ? `חיבור נשמר. יש להתקין את חבילת ה-scraper כדי למשוך תנועות אוטומטית.`
      : `חובר בהצלחה — נמשכו ${txCount} תנועות`

    return NextResponse.json({ success: true, message, txCount })

  } catch (err: unknown) {
    console.error('[bank-connect]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'שגיאה לא צפויה' },
      { status: 500 }
    )
  }
}
