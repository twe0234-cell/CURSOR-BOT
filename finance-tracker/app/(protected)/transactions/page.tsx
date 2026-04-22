import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import TransactionTable from '@/components/transactions/TransactionTable'
import CsvImport from '@/components/transactions/CsvImport'
import ManualTransactionForm from '@/components/transactions/ManualTransactionForm'
import { buildHash } from '@/lib/finance.logic'

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

  async function addManualTransaction(fd: FormData) {
    'use server'
    const sb = await createClient()
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) return

    let categoryId = fd.get('category_id') as string || null
    const newCategoryName = fd.get('new_category') as string
    
    // Auto create category if typed
    if (newCategoryName?.trim()) {
      const { data: newCat } = await sb.from('categories').insert({
        user_id: u.id, name: newCategoryName.trim(), type: parseFloat(fd.get('amount') as string) > 0 ? 'income' : 'expense'
      }).select().single()
      if (newCat) categoryId = newCat.id
    }

    const date = fd.get('date') as string
    const amount = parseFloat(fd.get('amount') as string)
    const description = fd.get('description') as string

    await sb.from('transactions').insert({
      user_id: u.id,
      date,
      amount,
      description,
      source: 'manual',
      category_id: categoryId,
      hash: buildHash({ date, amount, description, source: 'manual' })
    })
    
    revalidatePath('/transactions')
  }

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

      <div className="flex gap-3 flex-wrap">
        <CsvImport />
        <ManualTransactionForm categories={categories ?? []} addAction={addManualTransaction} />
      </div>

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
