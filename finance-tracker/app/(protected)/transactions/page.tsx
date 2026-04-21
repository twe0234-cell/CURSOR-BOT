import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import TransactionTable from '@/components/transactions/TransactionTable'
import CsvImport from '@/components/transactions/CsvImport'

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; cat?: string }>
}) {
  const sp = await searchParams
  const page = parseInt(sp.page ?? '1')
  const q = sp.q ?? ''
  const catFilter = sp.cat ?? ''
  const PAGE_SIZE = 50

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: categories }] = await Promise.all([
    supabase.from('categories').select('id,name,type').eq('user_id', user.id).order('name'),
  ])

  let query = supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  if (q) query = query.ilike('description', `%${q}%`)
  if (catFilter) query = query.eq('category_id', catFilter)

  const { data: txs, count } = await query
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  async function deleteTransaction(id: string) {
    'use server'
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) return
    await sb.from('transactions').delete().eq('id', id).eq('user_id', u.id)
    revalidatePath('/transactions')
  }

  async function updateCategory(id: string, categoryId: string) {
    'use server'
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) return
    await sb.from('transactions').update({ category_id: categoryId || null }).eq('id', id).eq('user_id', u.id)
    revalidatePath('/transactions')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">תנועות</h1>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>{count ?? 0} רשומות</span>
      </div>

      <CsvImport />

      <TransactionTable
        transactions={txs ?? []}
        categories={categories ?? []}
        page={page}
        totalPages={totalPages}
        q={q}
        catFilter={catFilter}
        deleteAction={deleteTransaction}
        updateCategoryAction={updateCategory}
      />
    </div>
  )
}
