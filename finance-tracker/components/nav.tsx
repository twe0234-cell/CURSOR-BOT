'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/dashboard',    label: 'דאשבורד',          icon: '📊' },
  { href: '/transactions', label: 'תנועות',             icon: '💳' },
  { href: '/recurring',   label: 'הוצאות קבועות',      icon: '🔁' },
  { href: '/assets',      label: 'נכסים ושווי נקי',   icon: '🏦' },
  { href: '/banks',       label: 'חיבור בנקים',        icon: '🔗' },
  { href: '/categories',  label: 'קטגוריות',            icon: '🏷️' },
  { href: '/rules',       label: 'חוקי סיווג',          icon: '⚙️' },
]

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link key={href} href={href}
            onClick={onClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150"
            style={active ? {
              background: 'linear-gradient(135deg, rgba(79,70,229,0.12), rgba(124,58,237,0.08))',
              color: '#4f46e5',
              boxShadow: 'inset 0 0 0 1px rgba(79,70,229,0.18)',
            } : {
              color: 'var(--color-muted)',
            }}>
            <span className="text-base">{icon}</span>
            <span>{label}</span>
            {active && <span className="mr-auto w-1.5 h-1.5 rounded-full bg-indigo-500 opacity-80" />}
          </Link>
        )
      })}
    </nav>
  )

  const LogoBlock = () => (
    <div className="flex items-center gap-2.5 px-2 mb-6">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg"
        style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
        ₪
      </div>
      <div>
        <p className="font-extrabold text-sm leading-tight" style={{ color: 'var(--color-text)' }}>Finance</p>
        <p className="font-extrabold text-sm leading-tight" style={{ color: 'var(--color-accent)' }}>Tracker</p>
      </div>
    </div>
  )

  return (
    <>
      {/* ─── Desktop sidebar ─── */}
      <aside
        className="hidden lg:flex w-60 flex-shrink-0 h-screen sticky top-0 flex-col p-4"
        style={{
          background: 'rgba(255,255,255,0.88)',
          borderLeft: '1px solid rgba(99,102,241,0.12)',
          backdropFilter: 'blur(16px)',
          boxShadow: '4px 0 24px rgba(99,102,241,0.06)',
        }}
      >
        <LogoBlock />
        <NavLinks />
        <div className="mt-auto pt-4 border-t" style={{ borderColor: 'rgba(99,102,241,0.1)' }}>
          <button onClick={signOut}
            className="btn-ghost w-full text-sm flex items-center gap-2"
            style={{ justifyContent: 'flex-end' }}>
            <span>התנתק</span>
            <span>🚪</span>
          </button>
        </div>
      </aside>

      {/* ─── Mobile top bar ─── */}
      <div
        className="lg:hidden fixed top-0 right-0 left-0 z-40 flex items-center justify-between px-4 h-14"
        style={{
          background: 'rgba(255,255,255,0.92)',
          borderBottom: '1px solid rgba(99,102,241,0.12)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 2px 16px rgba(99,102,241,0.08)',
        }}
      >
        <button onClick={signOut} className="p-2 rounded-lg text-sm" style={{ color: 'var(--color-muted)' }} title="התנתק">
          🚪
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-sm"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>₪</div>
          <span className="font-extrabold text-sm" style={{ color: 'var(--color-accent)' }}>Finance Tracker</span>
        </div>

        <button
          onClick={() => setMobileOpen(v => !v)}
          className="p-2 rounded-xl transition-all duration-150"
          style={{
            color: 'var(--color-accent)',
            background: mobileOpen ? 'rgba(79,70,229,0.12)' : 'rgba(79,70,229,0.06)',
            border: '1px solid rgba(79,70,229,0.15)',
          }}
          aria-label="תפריט"
        >
          <span className="flex flex-col gap-1.5 w-5 items-end">
            <span className="block h-0.5 rounded-full transition-all duration-200 bg-indigo-600"
              style={{ width: mobileOpen ? '100%' : '100%', transform: mobileOpen ? 'rotate(45deg) translate(3px, 3px)' : 'none' }} />
            <span className="block h-0.5 rounded-full transition-all duration-200 bg-indigo-600"
              style={{ width: '70%', opacity: mobileOpen ? 0 : 1 }} />
            <span className="block h-0.5 rounded-full transition-all duration-200 bg-indigo-600"
              style={{ width: '100%', transform: mobileOpen ? 'rotate(-45deg) translate(3px, -3px)' : 'none' }} />
          </span>
        </button>
      </div>

      {/* ─── Mobile backdrop ─── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30"
          style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ─── Mobile drawer (from right, RTL) ─── */}
      <div
        className="lg:hidden fixed top-0 right-0 bottom-0 z-50 w-72 flex flex-col p-5 transition-transform duration-300 ease-in-out"
        style={{
          transform: mobileOpen ? 'translateX(0)' : 'translateX(100%)',
          background: 'rgba(255,255,255,0.97)',
          borderLeft: '1px solid rgba(99,102,241,0.12)',
          backdropFilter: 'blur(20px)',
          boxShadow: '-8px 0 32px rgba(99,102,241,0.12)',
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <LogoBlock />
          <button onClick={() => setMobileOpen(false)}
            className="p-2 rounded-xl btn-ghost text-sm ml-auto">✕</button>
        </div>

        <NavLinks onClick={() => setMobileOpen(false)} />

        <div className="mt-auto pt-4 border-t" style={{ borderColor: 'rgba(99,102,241,0.1)' }}>
          <button onClick={signOut}
            className="btn-ghost w-full text-sm flex items-center gap-2"
            style={{ justifyContent: 'flex-end' }}>
            <span>התנתק</span>
            <span>🚪</span>
          </button>
        </div>
      </div>
    </>
  )
}
