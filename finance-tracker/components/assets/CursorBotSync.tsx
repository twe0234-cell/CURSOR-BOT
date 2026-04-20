'use client'

import { useState } from 'react'
import { syncErpData } from '@/lib/erp.actions'

export default function CursorBotSync() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleSync() {
    setLoading(true)
    setResult('מחשב נתונים מ-STaM ERP...')
    
    try {
      const res = await syncErpData()
      if (res.success) {
        setResult(`✓ סונכרן בהצלחה! ${res.message}`)
      } else {
        setResult(`שגיאה: ${res.error}`)
      }
    } catch (e: unknown) {
      setResult(`שגיאה: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ background: 'linear-gradient(145deg, #1e1b4b, #312e81)', borderColor: '#4338ca' }}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-indigo-200 flex items-center gap-2">
            <span>🤖</span> סנכרון מערכת STaM ERP
          </h2>
          <p className="text-xs text-indigo-300 mt-1">
            משיכת נתונים אוטומטית מטבלאות המלאי, ההשקעות והמכירות אל תוך הנכסים שלך.
          </p>
        </div>
        <button 
          onClick={handleSync} 
          disabled={loading}
          className="btn-primary"
          style={{ background: '#4f46e5', color: '#fff' }}
        >
          {loading ? 'מסנכרן...' : '🔄 סנכרן עכשיו'}
        </button>
      </div>
      
      {result && (
        <div className="mt-3 text-sm p-2 rounded" style={{ background: 'rgba(0,0,0,0.2)', color: result.startsWith('✓') ? '#10b981' : '#f43f5e' }}>
          {result}
        </div>
      )}
    </div>
  )
}
