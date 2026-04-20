'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/dashboard',    label: 'דאשבורד',         icon: '📊' },
  { href: '/transactions', label: 'תנועות',            icon: '💳' },
  { href: '/recurring',   label: 'הוצאות קבועות',     icon: '🔁' },
  { href: '/assets',      label: 'נכסים ושווי נקי',  icon: '🏦' },
  { href: '/categories',  label: 'קטגוריות',           icon: '🏷️' },
  { href: '/rules',       label: 'חוקי סיווג',         icon: '⚙️' },
]

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside style={{ background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)' }}
      className="w-56 flex-shrink-0 h-screen sticky top-0 flex flex-col p-4 gap-1">
      <div className="mb-6 px-2">
        <div className="flex items-center gap-2">
          <span className="text-xl p-1.5 rounded-lg" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>₪</span>
          <span className="font-bold text-base">Finance Tracker</span>
        </div>
      </div>

      {NAV.map(({ href, label, icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link key={href} href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={active
              ? { background: 'rgba(99,102,241,0.18)', color: '#a5b4fc' }
              : { color: 'var(--color-muted)' }}>
            <span>{icon}</span>
            {label}
          </Link>
        )
      })}

      <div className="mt-auto">
        <button onClick={signOut} className="btn-ghost w-full text-sm text-right">
          🚪 התנתק
        </button>
      </div>
    </aside>
  )
}
