'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function syncErpData() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'לא מחובר' }
    }

    // 1. Fetch Inventory data
    const { data: inventoryData, error: invError } = await supabase
      .from('inventory')
      .select('amount_paid, total_cost')
      // Only include items where user is owner or if there's no RLS we'll just sum what we get
    
    if (invError) throw invError

    // 2. Fetch Investments data
    const { data: investmentsData, error: invsError } = await supabase
      .from('erp_investments')
      .select('amount_paid')
    
    if (invsError) throw invsError

    // Calculate totals
    const totalInventoryPaid = inventoryData?.reduce((acc, curr) => acc + (Number(curr.amount_paid) || 0), 0) || 0
    const totalInvestmentsPaid = investmentsData?.reduce((acc, curr) => acc + (Number(curr.amount_paid) || 0), 0) || 0

    // 3. Find or Create Assets for these
    async function upsertAssetSnapshot(name: string, type: string, value: number) {
      // Find asset
      const { data: assets } = await supabase
        .from('assets')
        .select('id')
        .eq('user_id', user!.id)
        .eq('name', name)
        .limit(1)

      let assetId: string
      
      if (!assets || assets.length === 0) {
        // Create asset
        const { data: newAsset, error: createError } = await supabase
          .from('assets')
          .insert({
            user_id: user!.id,
            name: name,
            asset_type: type,
            notes: 'סונכרן אוטומטית מ-STaM ERP'
          })
          .select('id')
          .single()
          
        if (createError) throw createError
        assetId = newAsset.id
      } else {
        assetId = assets[0].id
      }

      // Add snapshot (only if it differs from the last snapshot on the same day, or just add a new one for today)
      const today = new Date().toISOString().split('T')[0]
      
      const { data: recentSnapshots } = await supabase
        .from('asset_snapshots')
        .select('id, value')
        .eq('asset_id', assetId)
        .eq('snapshot_date', today)
        .limit(1)

      if (recentSnapshots && recentSnapshots.length > 0) {
        // Update existing snapshot for today
        if (recentSnapshots[0].value !== value) {
          await supabase
            .from('asset_snapshots')
            .update({ value, notes: 'עודכן אוטומטית' })
            .eq('id', recentSnapshots[0].id)
        }
      } else {
        // Insert new snapshot
        await supabase
          .from('asset_snapshots')
          .insert({
            user_id: user!.id,
            asset_id: assetId,
            snapshot_date: today,
            value: value,
            notes: 'סונכרן אוטומטית'
          })
      }
    }

    if (totalInventoryPaid > 0) {
      await upsertAssetSnapshot('מלאי ששולם (STaM)', 'inventory', totalInventoryPaid)
    }
    
    if (totalInvestmentsPaid > 0) {
      await upsertAssetSnapshot('השקעות ששולמו (STaM)', 'inventory', totalInvestmentsPaid)
    }

    revalidatePath('/assets')
    
    return { 
      success: true, 
      message: `מלאי: ₪${totalInventoryPaid.toLocaleString()}, השקעות: ₪${totalInvestmentsPaid.toLocaleString()}`
    }

  } catch (error: unknown) {
    console.error('Sync error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }
  }
}
