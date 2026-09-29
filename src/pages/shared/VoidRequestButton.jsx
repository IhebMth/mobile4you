import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

// "Void" button for one cash_transactions row. Comptoir sends a request with a
// reason (admin must accept). When the ADMIN presses it, the request is created
// and approved in the same click.
export default function VoidRequestButton({ tx, onDone }) {
  const { user, profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  async function submit() {
    setError(null)
    if (reason.trim().length < 3) {
      setError('اكتب سبب الإلغاء (3 أحرف على الأقل)')
      return
    }
    setSaving(true)
    const { data, error: e1 } = await supabase
      .from('void_requests')
      .insert({ cash_transaction_id: tx.id, reason: reason.trim(), requested_by: user.id })
      .select('id')
      .single()
    if (e1) {
      setSaving(false)
      setError(e1.message.includes('one_pending_void_per_tx')
        ? 'يوجد طلب إلغاء بانتظار الموافقة لهذي العملية'
        : 'خطأ: ' + e1.message)
      return
    }
    if (isAdmin) {
      const { error: e2 } = await supabase.rpc('review_void_request', {
        p_id: data.id, p_approve: true, p_note: 'إلغاء مباشر من المدير',
      })
      if (e2) { setSaving(false); setError('خطأ: ' + e2.message); return }
    }
    setSaving(false)
    setOpen(false)
    setReason('')
    if (!isAdmin) alert('تم إرسال طلب الإلغاء، بانتظار موافقة المدير')
    onDone?.()
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-[#b3170f] text-xs font-semibold hover:underline">
        {isAdmin ? 'إلغاء' : 'طلب إلغاء'}
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl p-6 w-[380px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-extrabold mb-1">{isAdmin ? 'إلغاء العملية' : 'طلب إلغاء عملية'}</h3>
            <p className="text-xs text-[#6b6b6b] mb-3">
              {tx.description} — {Number(tx.amount).toFixed(2)} د.ت
            </p>
            <label className="block text-sm font-semibold mb-1.5">سبب الإلغاء (إجباري)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              className="w-full px-3.5 py-2.5 border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#e4211b]" />
            {error && <p className="text-[#b3170f] text-sm mt-2">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={submit} disabled={saving}
                className="bg-[#e4211b] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60">
                {saving ? '...' : isAdmin ? 'تأكيد الإلغاء' : 'إرسال الطلب'}
              </button>
              <button onClick={() => setOpen(false)} className="text-sm px-4 py-2 rounded-lg border border-[#e5e5e5]">
                رجوع
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
