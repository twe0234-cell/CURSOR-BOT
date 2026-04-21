'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/dashboard',    label: 'דאשבורד',        icon: '📊' },
  { href: '/transactions', label: 'תנועות',           icon: '💳' },
  { href: '/assets',       label: 'נכסים',            icon: '🏦' },
  { href: '/recurring',    label: 'קבועות',           icon: '🔁' },
  { href: '/categories',   label: 'קטגוריות',          icon: '🏷️' },
  { href: '/rules',        label: 'חוקים',             icon: '⚙️' },
  { href: '/banks',        label: 'בנקים',             icon: '🔗' },
]

// First 4 show in bottom bar, rest in "more" sheet
const BOTTOM_NAV = NAV.slice(0, 4)
const MORE_NAV   = NAV.slice(4)

export default function Nav() {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()
  const [moreOpen, setMoreOpen] = useState(false)

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside
        className="hidden md:flex w-56 flex-shrink-0 h-screen sticky top-0 flex-col p-4 gap-1"
        style={{ background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)' }}
      >
        <div className="mb-6 px-2 flex items-center gap-2">
          <span className="text-xl p-1.5 rounded-lg" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>₪</span>
          <span className="font-bold text-base">Finance Tracker</span>
        </div>

        {NAV.map(({ href, label, icon }) => (
          <Link key={href} href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={isActive(href)
              ? { background: 'rgba(99,102,241,0.18)', color: '#a5b4fc' }
              : { color: 'var(--color-muted)' }}>
            <span>{icon}</span>{label}
          </Link>
        ))}

        <div className="mt-auto">
          <button onClick={signOut} className="btn-ghost w-full text-sm text-right">
            🚪 התנתק
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom bar ───────────────────────────────────────────── */}
      <nav className="fixed bottom-0 right-0 left-0 md:hidden z-50 flex items-stretch"
        style={{
          background: 'rgba(15,17,23,0.95)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
        {BOTTOM_NAV.map(({ href, label, icon }) => (
          <Link key={href} href={href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-all"
            style={isActive(href) ? { color: '#a5b4fc' } : { color: '#64748b' }}>
            <span className="text-lg leading-none">{icon}</span>
            <span>{label}</span>
          </Link>
        ))}

        {/* More button */}
        <button
          onClick={() => setMoreOpen(v => !v)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-all"
          style={{ color: moreOpen ? '#a5b4fc' : '#64748b' }}>
          <span className="text-lg leading-none">⋯</span>
          <span>עוד</span>
        </button>
      </nav>

      {/* ── More sheet (mobile) ─────────────────────────────────────────── */}
      {moreOpen && (
        <>
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)} />
          <div className="fixed bottom-16 right-0 left-0 z-50 md:hidden rounded-t-2xl p-4 space-y-1"
            style={{
              background: 'rgba(20,22,30,0.98)',
              backdropFilter: 'blur(20px)',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)',
            }}>
            {MORE_NAV.map(({ href, label, icon }) => (
              <Link key={href} href={href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium"
                style={isActive(href)
                  ? { background: 'rgba(99,102,241,0.18)', color: '#a5b4fc' }
                  : { color: '#94a3b8' }}>
                <span className="text-lg">{icon}</span>{label}
              </Link>
            ))}
            <div className="border-t mt-2 pt-2" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <button onClick={signOut}
                className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm text-right"
                style={{ color: '#94a3b8' }}>
                🚪 התנתק
              </button>
            </div>
          </div>
        </>
      )}

      {/* bottom bar spacer on mobile */}
      <div className="h-16 md:hidden flex-shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
    </>
  )
}
