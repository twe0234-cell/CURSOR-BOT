import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import BankConnectButton from '@/components/banks/BankConnectButton'

const BANKS = [
  { id: 'hapoalim',   name: 'בנק הפועלים',      logo: '🏦', color: '#e53e3e' },
  { id: 'leumi',      name: 'בנק לאומי',         logo: '🟦', color: '#2b6cb0' },
  { id: 'discount',   name: 'בנק דיסקונט',       logo: '🔵', color: '#3182ce' },
  { id: 'mizrahi',    name: 'מזרחי טפחות',       logo: '🟡', color: '#d69e2e' },
  { id: 'pagi',       name: 'פאגי',              logo: '🏛️', color: '#0891b2' },
  { id: 'max',        name: 'מקס (כרטיס אשראי)', logo: '💳', color: '#805ad5' },
  { id: 'cal',        name: 'כאל (Visa Cal)',    logo: '💳', color: '#38a169' },
  { id: 'isracard',   name: 'ישראכרט',           logo: '💳', color: '#dd6b20' },
]

function fmt(d: string) {
  return new Date(d).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default async function BanksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: connections } = await supabase
    .from('bank_connections')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  async function removeConnection(fd: FormData) {
    'use server'
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    await sb.from('bank_connections')
      .update({ is_active: false })
      .eq('id', fd.get('id') as string)
      .eq('user_id', user.id)
    revalidatePath('/banks')
  }

  const connectedIds = new Set((connections ?? []).filter(c => c.is_active).map(c => c.bank_id))

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">חיבור בנקים</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
          חבר את חשבון הבנק שלך למשיכת תנועות אוטומטית — ללא ייבוא CSV ידני
        </p>
      </div>

      {/* How it works */}
      <div className="card p-4" style={{ background: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.25)' }}>
        <h2 className="font-semibold text-indigo-300 mb-2 text-sm">איך זה עובד?</h2>
        <ol className="text-xs space-y-1" style={{ color: '#94a3b8', listStyle: 'decimal', paddingRight: '1.2rem' }}>
          <li>לחץ "חבר" ליד הבנק שלך</li>
          <li>הזן את פרטי הכניסה שלך לאינטרנט בנקאי (לא נשמרים בשרת — מוצפנים מקומית)</li>
          <li>המערכת תמשוך תנועות חדשות אחת ליום באופן אוטומטי</li>
          <li>כפילויות מדולגות אוטומטית לפי hash</li>
        </ol>
        <p className="text-xs mt-2" style={{ color: '#64748b' }}>
          * בטוח כמו כניסה ידנית לאתר הבנק. אין שמירת סיסמה בטקסט רגיל.
        </p>
      </div>

      {/* Bank list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {BANKS.map(bank => {
          const conn = (connections ?? []).find(c => c.bank_id === bank.id && c.is_active)
          const connected = connectedIds.has(bank.id)
          return (
            <div key={bank.id} className="card p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{bank.logo}</span>
                <div>
                  <p className="font-semibold text-sm">{bank.name}</p>
                  {conn?.last_synced_at && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      סונכרן: {fmt(conn.last_synced_at)}
                    </p>
                  )}
                  {conn?.last_error && (
                    <p className="text-xs mt-0.5" style={{ color: '#f43f5e' }}>
                      שגיאה: {conn.last_error}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {connected ? (
                  <>
                    <span className="text-xs font-medium px-2 py-1 rounded-full"
                      style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                      ✓ מחובר
                    </span>
                    <form action={removeConnection}>
                      <input type="hidden" name="id" value={conn!.id} />
                      <button type="submit" className="btn-ghost text-xs py-1 px-2"
                        style={{ color: '#f43f5e' }}>
                        נתק
                      </button>
                    </form>
                  </>
                ) : (
                  <BankConnectButton bankId={bank.id} bankName={bank.name} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Connection history */}
      {(connections?.length ?? 0) > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3 text-sm">היסטוריית חיבורים</h2>
          <div className="space-y-1">
            {connections!.map(c => (
              <div key={c.id} className="flex justify-between items-center py-2 text-xs table-row px-2 rounded">
                <span>{BANKS.find(b => b.id === c.bank_id)?.name ?? c.bank_id}</span>
                <span style={{ color: 'var(--color-muted)' }}>
                  {c.is_active ? '🟢 פעיל' : '⚫ לא פעיל'} · {fmt(c.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
