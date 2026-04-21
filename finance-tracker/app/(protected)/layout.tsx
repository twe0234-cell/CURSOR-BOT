import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/nav'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex min-h-screen" dir="rtl">
      <Nav />
      <main className="flex-1 p-4 pb-24 md:p-6 overflow-auto">
        {children}
      </main>
    </div>
  )
}
